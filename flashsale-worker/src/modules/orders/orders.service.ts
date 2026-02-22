import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { AuditEventType } from "../audit/audit.types";
import { PrismaService } from "../database/prisma.service";

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Process an order from the queue
   * This method is idempotent - handles duplicate processing gracefully
   */
  async processOrder(saleId: string, userId: string): Promise<void> {
    this.logger.log(`Processing order: saleId=${saleId}, userId=${userId}`);

    try {
      // Attempt to create the order in the database
      const order = await this.prisma.order.create({
        data: {
          saleId,
          userId,
          status: "CONFIRMED",
        },
      });

      this.logger.log(`Order confirmed: ${order.id} - ${saleId} - ${userId}`);

      // Log successful confirmation to audit trail
      await this.auditService.logEvent(
        saleId,
        userId,
        AuditEventType.CONFIRMED,
        {
          orderId: order.id,
          processedAt: new Date().toISOString(),
        },
      );
    } catch (error) {
      // Handle Prisma unique constraint violation (P2002)
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        // Order already exists - this is expected in case of duplicate processing (idempotent behavior)
        this.logger.warn(
          `Duplicate order (already processed): saleId=${saleId}, userId=${userId}`,
        );

        // Don't log duplicate audit event, just return success
        // The order was already confirmed previously
        return;
      }

      // Any other database error should be logged and re-thrown
      const errorStack = error instanceof Error ? error.stack : String(error);
      this.logger.error(
        `Failed to process order: saleId=${saleId}, userId=${userId}`,
        errorStack,
      );

      // Log the database failure to audit trail
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      let errorCode = "UNKNOWN";
      if (error && typeof error === "object" && "code" in error) {
        const code = (error as { code: unknown }).code;
        errorCode =
          typeof code === "string" || typeof code === "number"
            ? String(code)
            : JSON.stringify(code);
      }
      await this.auditService.logEvent(
        saleId,
        userId,
        AuditEventType.FAILED_DB,
        {
          error: errorMessage,
          errorCode,
          failedAt: new Date().toISOString(),
        },
      );

      // Re-throw the error so the message will be NACKed and requeued
      throw error;
    }
  }
}
