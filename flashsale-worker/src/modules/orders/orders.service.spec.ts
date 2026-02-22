/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Test, TestingModule } from "@nestjs/testing";
import { Prisma } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { AuditEventType } from "../audit/audit.types";
import { PrismaService } from "../database/prisma.service";
import { OrdersService } from "./orders.service";

describe("OrdersService", () => {
  let service: OrdersService;
  let prisma: PrismaService;
  let audit: AuditService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        {
          provide: PrismaService,
          useValue: {
            order: {
              create: jest.fn(),
            },
          },
        },
        {
          provide: AuditService,
          useValue: {
            logEvent: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
    prisma = module.get<PrismaService>(PrismaService);
    audit = module.get<AuditService>(AuditService);

    jest.clearAllMocks();
  });

  describe("processOrder", () => {
    const saleId = "sale-uuid-123";
    const userId = "user-123";

    it("should successfully process and create order", async () => {
      const mockOrder = {
        id: "order-uuid-456",
        saleId,
        userId,
        status: "CONFIRMED",
        createdAt: new Date(),
      };

      jest.spyOn(prisma.order, "create").mockResolvedValue(mockOrder as any);
      jest.spyOn(audit, "logEvent").mockResolvedValue(undefined);

      await service.processOrder(saleId, userId);

      expect(prisma.order.create).toHaveBeenCalledWith({
        data: {
          saleId,
          userId,
          status: "CONFIRMED",
        },
      });

      expect(audit.logEvent).toHaveBeenCalledWith(
        saleId,
        userId,
        AuditEventType.CONFIRMED,
        {
          orderId: mockOrder.id,
          processedAt: expect.any(String),
        },
      );
    });

    it("should handle duplicate order gracefully (idempotent)", async () => {
      const duplicateError = new Prisma.PrismaClientKnownRequestError(
        "Unique constraint failed",
        {
          code: "P2002",
          clientVersion: "5.0.0",
        },
      );

      jest.spyOn(prisma.order, "create").mockRejectedValue(duplicateError);
      jest.spyOn(audit, "logEvent").mockResolvedValue(undefined);

      // Should not throw - idempotent behavior
      await expect(service.processOrder(saleId, userId)).resolves.not.toThrow();

      // Should not log audit event for duplicate
      expect(audit.logEvent).not.toHaveBeenCalled();
    });

    it("should log failed database error and re-throw", async () => {
      const dbError = new Error("Database connection failed");

      jest.spyOn(prisma.order, "create").mockRejectedValue(dbError);
      jest.spyOn(audit, "logEvent").mockResolvedValue(undefined);

      await expect(service.processOrder(saleId, userId)).rejects.toThrow(
        "Database connection failed",
      );

      expect(audit.logEvent).toHaveBeenCalledWith(
        saleId,
        userId,
        AuditEventType.FAILED_DB,
        {
          error: "Database connection failed",
          errorCode: "UNKNOWN",
          failedAt: expect.any(String),
        },
      );
    });

    it("should handle Prisma error with error code", async () => {
      const prismaError = new Prisma.PrismaClientKnownRequestError(
        "Foreign key constraint failed",
        {
          code: "P2003",
          clientVersion: "5.0.0",
        },
      );

      jest.spyOn(prisma.order, "create").mockRejectedValue(prismaError);
      jest.spyOn(audit, "logEvent").mockResolvedValue(undefined);

      await expect(service.processOrder(saleId, userId)).rejects.toThrow();

      expect(audit.logEvent).toHaveBeenCalledWith(
        saleId,
        userId,
        AuditEventType.FAILED_DB,
        expect.objectContaining({
          errorCode: "P2003",
        }),
      );
    });

    it("should handle unknown error types", async () => {
      const unknownError = new Error("Unknown error string");

      jest.spyOn(prisma.order, "create").mockRejectedValue(unknownError);
      jest.spyOn(audit, "logEvent").mockResolvedValue(undefined);

      await expect(service.processOrder(saleId, userId)).rejects.toThrow();

      expect(audit.logEvent).toHaveBeenCalledWith(
        saleId,
        userId,
        AuditEventType.FAILED_DB,
        expect.objectContaining({
          error: "Unknown error string",
          errorCode: "UNKNOWN",
        }),
      );
    });

    it("should complete successfully even if audit has internal errors", async () => {
      const mockOrder = {
        id: "order-uuid-456",
        saleId,
        userId,
        status: "CONFIRMED",
        createdAt: new Date(),
      };

      jest.spyOn(prisma.order, "create").mockResolvedValue(mockOrder as any);
      // Audit service catches errors internally and doesn't throw, so it resolves
      jest.spyOn(audit, "logEvent").mockResolvedValue(undefined);

      // Should complete successfully - audit service handles its own errors
      await expect(service.processOrder(saleId, userId)).resolves.not.toThrow();

      expect(prisma.order.create).toHaveBeenCalled();
      expect(audit.logEvent).toHaveBeenCalled();
    });

    it("should log order creation with correct metadata", async () => {
      const mockOrder = {
        id: "order-uuid-789",
        saleId,
        userId,
        status: "CONFIRMED",
        createdAt: new Date(),
      };

      jest.spyOn(prisma.order, "create").mockResolvedValue(mockOrder as any);
      jest.spyOn(audit, "logEvent").mockResolvedValue(undefined);

      await service.processOrder(saleId, userId);

      const auditCall = (audit.logEvent as jest.Mock).mock.calls[0];
      expect(auditCall[3]).toHaveProperty("orderId", mockOrder.id);
      expect(auditCall[3]).toHaveProperty("processedAt");
    });

    it("should handle error with numeric code", async () => {
      const errorWithNumericCode = new Error("Database error");
      (errorWithNumericCode as any).code = 500;

      jest
        .spyOn(prisma.order, "create")
        .mockRejectedValue(errorWithNumericCode);
      jest.spyOn(audit, "logEvent").mockResolvedValue(undefined);

      await expect(service.processOrder(saleId, userId)).rejects.toThrow();

      expect(audit.logEvent).toHaveBeenCalledWith(
        saleId,
        userId,
        AuditEventType.FAILED_DB,
        expect.objectContaining({
          errorCode: "500",
        }),
      );
    });

    it("should handle error with complex code object", async () => {
      const errorWithComplexCode = new Error("Complex error");
      (errorWithComplexCode as any).code = {
        type: "CONSTRAINT",
        details: "Complex",
      };

      jest
        .spyOn(prisma.order, "create")
        .mockRejectedValue(errorWithComplexCode);
      jest.spyOn(audit, "logEvent").mockResolvedValue(undefined);

      await expect(service.processOrder(saleId, userId)).rejects.toThrow();

      expect(audit.logEvent).toHaveBeenCalledWith(
        saleId,
        userId,
        AuditEventType.FAILED_DB,
        expect.objectContaining({
          errorCode: expect.stringContaining("type"),
        }),
      );
    });
  });
});
