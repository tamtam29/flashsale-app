/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from './audit.service';
import { AuditEventType } from './audit.types';

describe('AuditService', () => {
  let service: AuditService;
  let prisma: PrismaService;

  beforeEach(async () => {
    jest.useFakeTimers();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        {
          provide: PrismaService,
          useValue: {
            orderAuditTrail: {
              createMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
          },
        },
      ],
    }).compile();

    service = module.get<AuditService>(AuditService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe('logEvent', () => {
    it('should queue audit event for batch processing', () => {
      service.logEvent('sale_1', 'user_1', AuditEventType.ATTEMPTED, {
        timestamp: '2026-02-23',
      });

      // Event should be queued, not immediately flushed
      expect(prisma.orderAuditTrail.createMany).not.toHaveBeenCalled();

      // Verify queue contains the event (accessing private property for testing)

      const queue = service['auditQueue'];
      expect(queue).toHaveLength(1);
      expect(queue[0]).toMatchObject({
        saleId: 'sale_1',
        userId: 'user_1',
        eventType: AuditEventType.ATTEMPTED,
        metadata: { timestamp: '2026-02-23' },
      });
    });

    it('should start flush timer on first event', () => {
      expect(service['flushTimer']).toBeNull();

      service.logEvent('sale_1', 'user_1', AuditEventType.ATTEMPTED);

      expect(service['flushTimer']).not.toBeNull();
    });

    it('should flush immediately when queue reaches 100 events', async () => {
      // Add 100 events
      for (let i = 0; i < 100; i++) {
        service.logEvent(`sale_${i}`, 'user_1', AuditEventType.ATTEMPTED);
      }

      // Wait for async flush to complete
      await Promise.resolve();

      expect(prisma.orderAuditTrail.createMany).toHaveBeenCalledTimes(1);
      expect(prisma.orderAuditTrail.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            saleId: 'sale_0',
            userId: 'user_1',
            eventType: AuditEventType.ATTEMPTED,
          }),
        ]),
        skipDuplicates: true,
      });
    });

    it('should handle events without metadata', () => {
      service.logEvent('sale_1', 'user_1', AuditEventType.RESERVED);

      const queue = service['auditQueue'];

      expect(queue[0].metadata).toBeUndefined();
    });
  });

  describe('flush', () => {
    it('should flush queued events to database', async () => {
      service.logEvent('sale_1', 'user_1', AuditEventType.ATTEMPTED);
      service.logEvent('sale_1', 'user_2', AuditEventType.RESERVED);
      service.logEvent('sale_2', 'user_3', AuditEventType.CONFIRMED);

      await service['flush']();

      expect(prisma.orderAuditTrail.createMany).toHaveBeenCalledWith({
        data: [
          {
            saleId: 'sale_1',
            userId: 'user_1',
            eventType: AuditEventType.ATTEMPTED,
            metadata: {},
          },
          {
            saleId: 'sale_1',
            userId: 'user_2',
            eventType: AuditEventType.RESERVED,
            metadata: {},
          },
          {
            saleId: 'sale_2',
            userId: 'user_3',
            eventType: AuditEventType.CONFIRMED,
            metadata: {},
          },
        ],
        skipDuplicates: true,
      });

      // Queue should be cleared after flush
      expect(service['auditQueue']).toHaveLength(0);
    });

    it('should not flush when queue is empty', async () => {
      await service['flush']();

      expect(prisma.orderAuditTrail.createMany).not.toHaveBeenCalled();
    });

    it('should flush maximum 100 events at a time', async () => {
      // Add 150 events
      for (let i = 0; i < 150; i++) {
        service['auditQueue'].push({
          saleId: `sale_${i}`,
          userId: 'user_1',
          eventType: AuditEventType.ATTEMPTED,
        });
      }

      await service['flush']();

      // Should flush only 100

      const callArgs = (prisma.orderAuditTrail.createMany as jest.Mock).mock
        .calls[0][0];

      expect(callArgs.data).toHaveLength(100);

      // 50 should remain in queue
      expect(service['auditQueue']).toHaveLength(50);
    });

    it('should handle flush errors gracefully', async () => {
      jest
        .spyOn(prisma.orderAuditTrail, 'createMany')
        .mockRejectedValue(new Error('Database error'));

      service.logEvent('sale_1', 'user_1', AuditEventType.ATTEMPTED);

      // Should not throw
      await expect(service['flush']()).resolves.not.toThrow();
    });

    it('should preserve metadata in flushed events', async () => {
      const metadata = {
        orderId: 'order_123',
        timestamp: '2026-02-23T00:00:00Z',
      };

      service.logEvent('sale_1', 'user_1', AuditEventType.RESERVED, metadata);

      await service['flush']();

      expect(prisma.orderAuditTrail.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: [
            {
              saleId: 'sale_1',
              userId: 'user_1',
              eventType: AuditEventType.RESERVED,
              metadata,
            },
          ],
        }),
      );
    });
  });

  describe('timer-based flush', () => {
    it('should flush events after 1 second', async () => {
      service.logEvent('sale_1', 'user_1', AuditEventType.ATTEMPTED);

      expect(prisma.orderAuditTrail.createMany).not.toHaveBeenCalled();

      // Fast-forward time by 1 second
      jest.advanceTimersByTime(1000);
      await Promise.resolve();

      expect(prisma.orderAuditTrail.createMany).toHaveBeenCalledTimes(1);
    });

    it('should continue flushing events on interval', async () => {
      service.logEvent('sale_1', 'user_1', AuditEventType.ATTEMPTED);

      // First flush at 1 second
      jest.advanceTimersByTime(1000);
      await Promise.resolve();
      expect(prisma.orderAuditTrail.createMany).toHaveBeenCalledTimes(1);

      // Add new events
      service.logEvent('sale_2', 'user_2', AuditEventType.RESERVED);

      // Second flush at 2 seconds
      jest.advanceTimersByTime(1000);
      await Promise.resolve();
      expect(prisma.orderAuditTrail.createMany).toHaveBeenCalledTimes(2);
    });
  });

  describe('onModuleDestroy', () => {
    it('should clear flush timer', async () => {
      service.logEvent('sale_1', 'user_1', AuditEventType.ATTEMPTED);

      const timer = service['flushTimer'];
      expect(timer).not.toBeNull();

      await service.onModuleDestroy();

      // Timer should be cleared (implementation sets it to null)
      // In fake timers, we just verify clearInterval was called
      expect(service['flushTimer']).toBeNull();
    });

    it('should flush remaining events', async () => {
      service.logEvent('sale_1', 'user_1', AuditEventType.ATTEMPTED);
      service.logEvent('sale_2', 'user_2', AuditEventType.RESERVED);

      await service.onModuleDestroy();

      expect(prisma.orderAuditTrail.createMany).toHaveBeenCalled();
      expect(service['auditQueue']).toHaveLength(0);
    });

    it('should handle destroy when no events queued', async () => {
      await expect(service.onModuleDestroy()).resolves.not.toThrow();
    });
  });

  describe('batch processing', () => {
    it('should handle multiple event types in batch', async () => {
      service.logEvent('sale_1', 'user_1', AuditEventType.ATTEMPTED);
      service.logEvent('sale_1', 'user_1', AuditEventType.RESERVED);
      service.logEvent('sale_1', 'user_2', AuditEventType.REJECTED_DUPLICATE);
      service.logEvent('sale_2', 'user_3', AuditEventType.REJECTED_SOLD_OUT);
      service.logEvent('sale_2', 'user_4', AuditEventType.CONFIRMED);

      await service['flush']();

      const callArgs = (prisma.orderAuditTrail.createMany as jest.Mock).mock
        .calls[0][0];

      expect(callArgs.data).toHaveLength(5);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return
      expect(callArgs.data.map((d: any) => d.eventType)).toEqual([
        AuditEventType.ATTEMPTED,
        AuditEventType.RESERVED,
        AuditEventType.REJECTED_DUPLICATE,
        AuditEventType.REJECTED_SOLD_OUT,
        AuditEventType.CONFIRMED,
      ]);
    });

    it('should handle admin events', async () => {
      service.logEvent('sale_1', 'SYSTEM', AuditEventType.ADMIN_RESET, {
        deletedOrders: 100,
        deletedAudits: 200,
      });

      await service['flush']();

      expect(prisma.orderAuditTrail.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: [
            {
              saleId: 'sale_1',
              userId: 'SYSTEM',
              eventType: AuditEventType.ADMIN_RESET,
              metadata: {
                deletedOrders: 100,
                deletedAudits: 200,
              },
            },
          ],
        }),
      );
    });
  });
});
