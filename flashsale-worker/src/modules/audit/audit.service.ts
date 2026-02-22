import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { AuditEventType } from "./audit.types";

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Log an audit event
   */
  async logEvent(
    saleId: string,
    userId: string,
    eventType: AuditEventType,
    metadata?: Record<string, any>,
  ): Promise<void> {
    try {
      await this.prisma.orderAuditTrail.create({
        data: {
          saleId,
          userId,
          eventType,
          metadata: metadata || {},
        },
      });

      this.logger.debug(`Audit logged: ${eventType} - ${saleId} - ${userId}`);
    } catch (error) {
      // Log error but don't throw - audit failures shouldn't break the main flow
      const message = error instanceof Error ? error.message : "Unknown error";
      this.logger.error(`Failed to log audit event: ${message}`);
    }
  }
}
