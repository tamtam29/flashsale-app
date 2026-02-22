/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { Test, TestingModule } from '@nestjs/testing';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';
import { QueueService } from '../queue/queue.service';
import { RedisService } from '../redis/redis.service';
import { SaleService } from './sale.service';

describe('SaleService', () => {
  let service: SaleService;
  let prisma: PrismaService;
  let redis: RedisService;
  let queue: QueueService;
  let audit: AuditService;

  const mockSale = {
    id: 'test_sale',
    name: 'Test Sale',
    totalStock: 100,
    startsAt: new Date(Date.now() - 1000), // Started 1 second ago
    endsAt: new Date(Date.now() + 3600000), // Ends in 1 hour
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SaleService,
        {
          provide: PrismaService,
          useValue: {
            sale: {
              findUnique: jest.fn(),
              findMany: jest.fn(),
            },
            order: {
              count: jest.fn(),
              findMany: jest.fn(),
              findFirst: jest.fn(),
              deleteMany: jest.fn(),
            },
            orderAuditTrail: {
              deleteMany: jest.fn(),
            },
          },
        },
        {
          provide: RedisService,
          useValue: {
            executePurchase: jest.fn(),
            getStock: jest.fn(),
            setStock: jest.fn(),
            addUsers: jest.fn(),
            resetSale: jest.fn(),
          },
        },
        {
          provide: QueueService,
          useValue: {
            publishPurchaseEvent: jest.fn(),
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

    service = module.get<SaleService>(SaleService);
    prisma = module.get<PrismaService>(PrismaService);
    redis = module.get<RedisService>(RedisService);
    queue = module.get<QueueService>(QueueService);
    audit = module.get<AuditService>(AuditService);
  });

  describe('validateSaleWindow', () => {
    it('should return true for sale in progress', () => {
      const result = service['validateSaleWindow'](mockSale);
      expect(result).toBe(true);
    });

    it('should return false for future sale', () => {
      const futureSale = {
        ...mockSale,
        startsAt: new Date(Date.now() + 3600000),
      };
      const result = service['validateSaleWindow'](futureSale);
      expect(result).toBe(false);
    });

    it('should return false for past sale', () => {
      const pastSale = {
        ...mockSale,
        startsAt: new Date(Date.now() - 7200000),
        endsAt: new Date(Date.now() - 3600000),
      };
      const result = service['validateSaleWindow'](pastSale);
      expect(result).toBe(false);
    });
  });

  describe('attemptPurchase', () => {
    beforeEach(() => {
      jest.spyOn(prisma.sale, 'findUnique').mockResolvedValue(mockSale as any);
    });

    it('should return SUCCESS for successful purchase', async () => {
      jest.spyOn(redis, 'executePurchase').mockResolvedValue(1); // SUCCESS

      const result = await service.attemptPurchase('test_sale', 'user_1');

      expect(result.status).toBe('SUCCESS');
      expect(audit.logEvent).toHaveBeenCalledWith(
        'test_sale',
        'user_1',
        'ATTEMPTED',
        expect.any(Object),
      );
      expect(audit.logEvent).toHaveBeenCalledWith(
        'test_sale',
        'user_1',
        'RESERVED',
        expect.any(Object),
      );
      expect(queue.publishPurchaseEvent).toHaveBeenCalledWith(
        'test_sale',
        'user_1',
      );
    });

    it('should return ALREADY_PURCHASED for duplicate purchase', async () => {
      jest.spyOn(redis, 'executePurchase').mockResolvedValue(2); // ALREADY_PURCHASED

      const result = await service.attemptPurchase('test_sale', 'user_1');

      expect(result.status).toBe('ALREADY_PURCHASED');
      expect(audit.logEvent).toHaveBeenCalledWith(
        'test_sale',
        'user_1',
        'REJECTED_DUPLICATE',
        expect.any(Object),
      );
      expect(queue.publishPurchaseEvent).not.toHaveBeenCalled();
    });

    it('should return SOLD_OUT when stock exhausted', async () => {
      jest.spyOn(redis, 'executePurchase').mockResolvedValue(0); // SOLD_OUT

      const result = await service.attemptPurchase('test_sale', 'user_1');

      expect(result.status).toBe('SOLD_OUT');
      expect(audit.logEvent).toHaveBeenCalledWith(
        'test_sale',
        'user_1',
        'REJECTED_SOLD_OUT',
        expect.any(Object),
      );
      expect(queue.publishPurchaseEvent).not.toHaveBeenCalled();
    });

    it('should throw error for sale not started', async () => {
      const futureSale = {
        ...mockSale,
        startsAt: new Date(Date.now() + 3600000),
      };
      jest
        .spyOn(prisma.sale, 'findUnique')
        .mockResolvedValue(futureSale as any);

      await expect(
        service.attemptPurchase('test_sale', 'user_1'),
      ).rejects.toThrow('Sale is not currently active');

      expect(audit.logEvent).toHaveBeenCalledWith(
        'test_sale',
        'user_1',
        'REJECTED_NOT_ACTIVE',
        expect.any(Object),
      );
    });

    it('should throw error for sale ended', async () => {
      const pastSale = {
        ...mockSale,
        endsAt: new Date(Date.now() - 3600000),
      };
      jest.spyOn(prisma.sale, 'findUnique').mockResolvedValue(pastSale as any);

      await expect(
        service.attemptPurchase('test_sale', 'user_1'),
      ).rejects.toThrow('Sale is not currently active');
    });

    it('should throw error for non-existent sale', async () => {
      jest.spyOn(prisma.sale, 'findUnique').mockResolvedValue(null);

      await expect(
        service.attemptPurchase('invalid_sale', 'user_1'),
      ).rejects.toThrow('Sale invalid_sale not found');
    });
  });

  describe('getSaleStatus', () => {
    beforeEach(() => {
      jest.spyOn(prisma.sale, 'findUnique').mockResolvedValue(mockSale as any);
      jest.spyOn(prisma.order, 'count').mockResolvedValue(50);
      jest.spyOn(redis, 'getStock').mockResolvedValue(50);
    });

    it('should return complete sale status', async () => {
      const result = await service.getSaleStatus('test_sale');

      expect(result).toMatchObject({
        saleId: 'test_sale',
        name: 'Test Sale',
        remainingStock: 50,
        totalSold: 50,
        saleActive: true,
        status: 'ACTIVE',
      });
    });

    it('should handle zero remaining stock', async () => {
      jest.spyOn(redis, 'getStock').mockResolvedValue(0);
      jest.spyOn(prisma.order, 'count').mockResolvedValue(100);

      const result = await service.getSaleStatus('test_sale');

      expect(result.remainingStock).toBe(0);
      expect(result.totalSold).toBe(100);
    });
  });

  describe('getUserPurchase', () => {
    it('should return purchase info when user has purchased', async () => {
      const mockOrder = {
        id: 'order_123',
        saleId: 'test_sale',
        userId: 'user_1',
        status: 'CONFIRMED',
        createdAt: new Date(),
      };
      jest.spyOn(prisma.sale, 'findUnique').mockResolvedValue(mockSale as any);
      jest.spyOn(prisma.order, 'findFirst').mockResolvedValue(mockOrder as any);

      const result = await service.getUserPurchase('test_sale', 'user_1');

      expect(result).toMatchObject({
        purchased: true,
        orderId: 'order_123',
        status: 'CONFIRMED',
      });
    });

    it('should return not purchased when user has not purchased', async () => {
      jest.spyOn(prisma.sale, 'findUnique').mockResolvedValue(mockSale as any);
      jest.spyOn(prisma.order, 'findFirst').mockResolvedValue(null);

      const result = await service.getUserPurchase('test_sale', 'user_1');

      expect(result).toMatchObject({
        purchased: false,
        orderId: null,
        status: 'NOT_PURCHASED',
      });
    });
  });

  describe('resetSale', () => {
    beforeEach(() => {
      jest.spyOn(prisma.sale, 'findUnique').mockResolvedValue(mockSale as any);
      jest
        .spyOn(prisma.order, 'deleteMany')
        .mockResolvedValue({ count: 5 } as any);
      jest
        .spyOn(prisma.orderAuditTrail, 'deleteMany')
        .mockResolvedValue({ count: 10 } as any);
      jest.spyOn(redis, 'setStock').mockResolvedValue(undefined);
      jest.spyOn(redis, 'resetSale').mockResolvedValue(undefined);
    });

    it('should reset sale successfully', async () => {
      await service.resetSale('test_sale');

      expect(prisma.order.deleteMany).toHaveBeenCalledWith({
        where: { saleId: 'test_sale' },
      });
      expect(prisma.orderAuditTrail.deleteMany).toHaveBeenCalledWith({
        where: { saleId: 'test_sale' },
      });
      expect(redis.resetSale).toHaveBeenCalledWith('test_sale');
      expect(redis.setStock).toHaveBeenCalledWith('test_sale', 100);
    });

    it('should throw error when sale not found', async () => {
      jest.spyOn(prisma.sale, 'findUnique').mockResolvedValue(null);

      await expect(service.resetSale('invalid_sale')).rejects.toThrow(
        'Sale invalid_sale not found',
      );
    });
  });

  describe('getAllSales', () => {
    it('should return all sales with their status', async () => {
      const mockSales = [
        mockSale,
        {
          id: 'sale_2',
          name: 'Second Sale',
          totalStock: 50,
          startsAt: new Date(Date.now() + 3600000),
          endsAt: new Date(Date.now() + 7200000),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      jest.spyOn(prisma.sale, 'findMany').mockResolvedValue(mockSales as any);
      jest
        .spyOn(redis, 'getStock')
        .mockResolvedValueOnce(30)
        .mockResolvedValueOnce(50);
      jest
        .spyOn(prisma.order, 'count')
        .mockResolvedValueOnce(70)
        .mockResolvedValueOnce(0);

      const result = await service.getAllSales();

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        saleId: 'test_sale',
        name: 'Test Sale',
        remainingStock: 30,
        totalSold: 70,
        saleActive: true,
        status: 'ACTIVE',
      });
      expect(result[1]).toMatchObject({
        saleId: 'sale_2',
        name: 'Second Sale',
        remainingStock: 50,
        totalSold: 0,
        saleActive: false,
        status: 'INACTIVE',
      });
    });

    it('should return empty array when no sales exist', async () => {
      jest.spyOn(prisma.sale, 'findMany').mockResolvedValue([]);

      const result = await service.getAllSales();

      expect(result).toEqual([]);
    });
  });

  describe('reconcileSales', () => {
    it('should reconcile sales with database and sync to Redis', async () => {
      const mockOrders = [
        { userId: 'user_1' },
        { userId: 'user_2' },
        { userId: 'user_3' },
      ];

      jest.spyOn(prisma.sale, 'findMany').mockResolvedValue([mockSale] as any);
      jest.spyOn(prisma.order, 'count').mockResolvedValue(30);
      jest.spyOn(prisma.order, 'findMany').mockResolvedValue(mockOrders as any);
      jest.spyOn(redis, 'setStock').mockResolvedValue(undefined);
      jest.spyOn(redis, 'addUsers').mockResolvedValue(undefined);

      await service.reconcileSales();

      expect(redis.setStock).toHaveBeenCalledWith('test_sale', 70); // 100 - 30
      expect(redis.addUsers).toHaveBeenCalledWith('test_sale', [
        'user_1',
        'user_2',
        'user_3',
      ]);
    });

    it('should handle sales with no orders', async () => {
      jest.spyOn(prisma.sale, 'findMany').mockResolvedValue([mockSale] as any);
      jest.spyOn(prisma.order, 'count').mockResolvedValue(0);
      jest.spyOn(prisma.order, 'findMany').mockResolvedValue([]);
      jest.spyOn(redis, 'setStock').mockResolvedValue(undefined);

      await service.reconcileSales();

      expect(redis.setStock).toHaveBeenCalledWith('test_sale', 100); // Full stock
      expect(redis.addUsers).not.toHaveBeenCalled();
    });

    it('should handle oversold scenario gracefully', async () => {
      jest.spyOn(prisma.sale, 'findMany').mockResolvedValue([mockSale] as any);
      jest.spyOn(prisma.order, 'count').mockResolvedValue(150); // More than total stock
      jest.spyOn(prisma.order, 'findMany').mockResolvedValue([]);
      jest.spyOn(redis, 'setStock').mockResolvedValue(undefined);

      await service.reconcileSales();

      expect(redis.setStock).toHaveBeenCalledWith('test_sale', 0); // Math.max(0, ...)
    });

    it('should throw error if reconciliation fails', async () => {
      jest
        .spyOn(prisma.sale, 'findMany')
        .mockRejectedValue(new Error('Database error'));

      await expect(service.reconcileSales()).rejects.toThrow('Database error');
    });
  });

  describe('getSaleStatus', () => {
    it('should throw error when sale not found', async () => {
      jest.spyOn(prisma.sale, 'findUnique').mockResolvedValue(null);

      await expect(service.getSaleStatus('invalid_sale')).rejects.toThrow(
        'Sale invalid_sale not found',
      );
    });
  });

  describe('getUserPurchase', () => {
    it('should throw error when sale not found', async () => {
      jest.spyOn(prisma.sale, 'findUnique').mockResolvedValue(null);

      await expect(
        service.getUserPurchase('invalid_sale', 'user_1'),
      ).rejects.toThrow('Sale invalid_sale not found');
    });
  });

  describe('getSale (cache behavior)', () => {
    it('should return cached sale within TTL', async () => {
      jest.spyOn(prisma.sale, 'findUnique').mockResolvedValue(mockSale as any);

      // First call should hit database
      const result1 = await service['getSale']('test_sale');
      expect(prisma.sale.findUnique).toHaveBeenCalledTimes(1);

      // Second call within TTL should use cache
      const result2 = await service['getSale']('test_sale');
      expect(prisma.sale.findUnique).toHaveBeenCalledTimes(1); // Still 1
      expect(result2).toEqual(result1);
    });

    it('should fetch from database after cache expires', async () => {
      const updatedSale = { ...mockSale, name: 'Updated Sale' };
      jest
        .spyOn(prisma.sale, 'findUnique')
        .mockResolvedValueOnce(mockSale as any)
        .mockResolvedValueOnce(updatedSale as any);

      // First call
      await service['getSale']('test_sale');
      expect(prisma.sale.findUnique).toHaveBeenCalledTimes(1);

      // Manually expire cache by manipulating time
      const cache = service['saleCache'];
      const cached = cache.get('test_sale');
      if (cached) {
        cached.cachedAt = Date.now() - 70000; // Expired (> 60000ms TTL)
      }

      // Second call should hit database again
      const result = await service['getSale']('test_sale');
      expect(prisma.sale.findUnique).toHaveBeenCalledTimes(2);
      expect(result.name).toBe('Updated Sale');
    });
  });

  describe('attemptPurchase edge cases', () => {
    beforeEach(() => {
      jest.spyOn(prisma.sale, 'findUnique').mockResolvedValue(mockSale as any);
    });

    it('should throw error for unknown purchase result', async () => {
      jest.spyOn(redis, 'executePurchase').mockResolvedValue(999 as any); // Unknown result

      await expect(
        service.attemptPurchase('test_sale', 'user_1'),
      ).rejects.toThrow('Unknown purchase result: 999');
    });
  });
});
