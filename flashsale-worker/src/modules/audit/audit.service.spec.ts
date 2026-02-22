/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Test, TestingModule } from "@nestjs/testing";
import { PrismaService } from "../database/prisma.service";
import { AuditService } from "./audit.service";
import { AuditEventType } from "./audit.types";

describe("AuditService", () => {
  let service: AuditService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        {
          provide: PrismaService,
          useValue: {
            orderAuditTrail: {
              create: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<AuditService>(AuditService);
    prisma = module.get<PrismaService>(PrismaService);

    jest.clearAllMocks();
  });

  describe("logEvent", () => {
    const saleId = "sale-uuid-123";
    const userId = "user-123";

    it("should successfully log audit event", async () => {
      const metadata = {
        orderId: "order-uuid-456",
        processedAt: "2026-02-23T00:00:00Z",
      };

      jest.spyOn(prisma.orderAuditTrail, "create").mockResolvedValue({
        id: "audit-uuid-789",
        saleId,
        userId,
        eventType: AuditEventType.CONFIRMED,
        metadata,
        createdAt: new Date(),
      } as any);

      await service.logEvent(
        saleId,
        userId,
        AuditEventType.CONFIRMED,
        metadata,
      );

      expect(prisma.orderAuditTrail.create).toHaveBeenCalledWith({
        data: {
          saleId,
          userId,
          eventType: AuditEventType.CONFIRMED,
          metadata,
        },
      });
    });

    it("should log event without metadata", async () => {
      jest.spyOn(prisma.orderAuditTrail, "create").mockResolvedValue({
        id: "audit-uuid-789",
        saleId,
        userId,
        eventType: AuditEventType.ATTEMPTED,
        metadata: {},
        createdAt: new Date(),
      } as any);

      await service.logEvent(saleId, userId, AuditEventType.ATTEMPTED);

      expect(prisma.orderAuditTrail.create).toHaveBeenCalledWith({
        data: {
          saleId,
          userId,
          eventType: AuditEventType.ATTEMPTED,
          metadata: {},
        },
      });
    });

    it("should handle database errors gracefully without throwing", async () => {
      jest
        .spyOn(prisma.orderAuditTrail, "create")
        .mockRejectedValue(new Error("Database error"));

      // Should not throw - audit failures should not break main flow
      await expect(
        service.logEvent(saleId, userId, AuditEventType.CONFIRMED),
      ).resolves.not.toThrow();
    });

    it("should log all event types", async () => {
      const eventTypes = [
        AuditEventType.ATTEMPTED,
        AuditEventType.RESERVED,
        AuditEventType.REJECTED_DUPLICATE,
        AuditEventType.REJECTED_SOLD_OUT,
        AuditEventType.REJECTED_NOT_ACTIVE,
        AuditEventType.CONFIRMED,
        AuditEventType.FAILED_DB,
        AuditEventType.ADMIN_RESET,
      ];

      jest.spyOn(prisma.orderAuditTrail, "create").mockResolvedValue({
        id: "audit-uuid",
        saleId,
        userId,
        eventType: AuditEventType.CONFIRMED,
        metadata: {},
        createdAt: new Date(),
      } as any);

      for (const eventType of eventTypes) {
        await service.logEvent(saleId, userId, eventType);

        expect(prisma.orderAuditTrail.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              eventType,
            }),
          }),
        );
      }

      expect(prisma.orderAuditTrail.create).toHaveBeenCalledTimes(
        eventTypes.length,
      );
    });

    it("should handle metadata with various data types", async () => {
      const complexMetadata = {
        orderId: "order-123",
        timestamp: "2026-02-23T00:00:00Z",
        retryCount: 3,
        error: "Some error",
        details: {
          nested: "value",
          array: [1, 2, 3],
        },
      };

      jest.spyOn(prisma.orderAuditTrail, "create").mockResolvedValue({
        id: "audit-uuid",
        saleId,
        userId,
        eventType: AuditEventType.FAILED_DB,
        metadata: complexMetadata,
        createdAt: new Date(),
      } as any);

      await service.logEvent(
        saleId,
        userId,
        AuditEventType.FAILED_DB,
        complexMetadata,
      );

      expect(prisma.orderAuditTrail.create).toHaveBeenCalledWith({
        data: {
          saleId,
          userId,
          eventType: AuditEventType.FAILED_DB,
          metadata: complexMetadata,
        },
      });
    });

    it("should handle connection timeout errors", async () => {
      jest
        .spyOn(prisma.orderAuditTrail, "create")
        .mockRejectedValue(new Error("Connection timeout"));

      await expect(
        service.logEvent(saleId, userId, AuditEventType.CONFIRMED),
      ).resolves.not.toThrow();

      expect(prisma.orderAuditTrail.create).toHaveBeenCalled();
    });

    it("should handle unknown error types", async () => {
      jest
        .spyOn(prisma.orderAuditTrail, "create")
        .mockRejectedValue("Unknown error string");

      await expect(
        service.logEvent(saleId, userId, AuditEventType.CONFIRMED),
      ).resolves.not.toThrow();
    });

    it("should use empty object for undefined metadata", async () => {
      jest.spyOn(prisma.orderAuditTrail, "create").mockResolvedValue({
        id: "audit-uuid",
        saleId,
        userId,
        eventType: AuditEventType.RESERVED,
        metadata: {},
        createdAt: new Date(),
      } as any);

      await service.logEvent(
        saleId,
        userId,
        AuditEventType.RESERVED,
        undefined,
      );

      expect(prisma.orderAuditTrail.create).toHaveBeenCalledWith({
        data: {
          saleId,
          userId,
          eventType: AuditEventType.RESERVED,
          metadata: {},
        },
      });
    });
  });
});
