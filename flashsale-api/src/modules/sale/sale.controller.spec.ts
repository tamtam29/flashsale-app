/* eslint-disable @typescript-eslint/unbound-method */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { SaleController } from './sale.controller';
import { SaleService } from './sale.service';

describe('SaleController', () => {
  let controller: SaleController;
  let service: SaleService;

  const mockSaleService = {
    getAllSales: jest.fn(),
    attemptPurchase: jest.fn(),
    getSaleStatus: jest.fn(),
    getUserPurchase: jest.fn(),
    resetSale: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SaleController],
      providers: [
        {
          provide: SaleService,
          useValue: mockSaleService,
        },
      ],
    }).compile();

    controller = module.get<SaleController>(SaleController);
    service = module.get<SaleService>(SaleService);

    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  describe('getAllSales', () => {
    it('should return array of sales', async () => {
      const mockSales = [
        {
          saleId: 'sale-uuid-1',
          name: 'Sale 1',
          remainingStock: 50,
          totalSold: 50,
          saleActive: true,
          startsAt: new Date(),
          endsAt: new Date(),
          status: 'ACTIVE',
        },
        {
          saleId: 'sale-uuid-2',
          name: 'Sale 2',
          remainingStock: 100,
          totalSold: 0,
          saleActive: false,
          startsAt: new Date(),
          endsAt: new Date(),
          status: 'INACTIVE',
        },
      ];

      jest.spyOn(service, 'getAllSales').mockResolvedValue(mockSales);

      const result = await controller.getAllSales();

      expect(result).toEqual(mockSales);
      expect(service.getAllSales).toHaveBeenCalledTimes(1);
    });

    it('should return empty array when no sales exist', async () => {
      jest.spyOn(service, 'getAllSales').mockResolvedValue([]);

      const result = await controller.getAllSales();

      expect(result).toEqual([]);
      expect(service.getAllSales).toHaveBeenCalledTimes(1);
    });
  });

  describe('purchase', () => {
    const validPurchaseDto = {
      saleId: '123e4567-e89b-12d3-a456-426614174000',
      userId: 'user123',
    };

    it('should successfully process purchase', async () => {
      const mockResponse = {
        success: true,
        status: 'SUCCESS',
        message: 'Purchase reserved successfully',
        orderId: 'order-123',
      };

      jest.spyOn(service, 'attemptPurchase').mockResolvedValue(mockResponse);

      const result = await controller.purchase(validPurchaseDto);

      expect(result).toEqual(mockResponse);
      expect(service.attemptPurchase).toHaveBeenCalledWith(
        validPurchaseDto.saleId,
        validPurchaseDto.userId,
      );
    });

    it('should handle sold out scenario', async () => {
      const mockResponse = {
        success: false,
        status: 'SOLD_OUT',
        message: 'Sale is sold out',
      };

      jest.spyOn(service, 'attemptPurchase').mockResolvedValue(mockResponse);

      const result = await controller.purchase(validPurchaseDto);

      expect(result).toEqual(mockResponse);
      expect(result.success).toBe(false);
      expect(result.status).toBe('SOLD_OUT');
    });

    it('should handle already purchased scenario', async () => {
      const mockResponse = {
        success: false,
        status: 'ALREADY_PURCHASED',
        message: 'You have already purchased from this sale',
      };

      jest.spyOn(service, 'attemptPurchase').mockResolvedValue(mockResponse);

      const result = await controller.purchase(validPurchaseDto);

      expect(result).toEqual(mockResponse);
      expect(result.success).toBe(false);
      expect(result.status).toBe('ALREADY_PURCHASED');
    });

    it('should throw BadRequestException for inactive sale', async () => {
      jest
        .spyOn(service, 'attemptPurchase')
        .mockRejectedValue(
          new BadRequestException('Sale is not currently active'),
        );

      await expect(controller.purchase(validPurchaseDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException for non-existent sale', async () => {
      jest
        .spyOn(service, 'attemptPurchase')
        .mockRejectedValue(new NotFoundException('Sale not found'));

      await expect(controller.purchase(validPurchaseDto)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getSaleStatus', () => {
    const validSaleId = '123e4567-e89b-12d3-a456-426614174000';

    it('should return sale status', async () => {
      const mockStatus = {
        saleId: validSaleId,
        name: 'Test Sale',
        remainingStock: 75,
        totalSold: 25,
        saleActive: true,
        startsAt: new Date(),
        endsAt: new Date(),
        status: 'ACTIVE',
      };

      jest.spyOn(service, 'getSaleStatus').mockResolvedValue(mockStatus);

      const result = await controller.getSaleStatus(validSaleId);

      expect(result).toEqual(mockStatus);
      expect(service.getSaleStatus).toHaveBeenCalledWith(validSaleId);
    });

    it('should throw NotFoundException for non-existent sale', async () => {
      jest
        .spyOn(service, 'getSaleStatus')
        .mockRejectedValue(
          new NotFoundException(`Sale ${validSaleId} not found`),
        );

      await expect(controller.getSaleStatus(validSaleId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return status with zero stock', async () => {
      const mockStatus = {
        saleId: validSaleId,
        name: 'Sold Out Sale',
        remainingStock: 0,
        totalSold: 100,
        saleActive: true,
        startsAt: new Date(),
        endsAt: new Date(),
        status: 'ACTIVE',
      };

      jest.spyOn(service, 'getSaleStatus').mockResolvedValue(mockStatus);

      const result = await controller.getSaleStatus(validSaleId);

      expect(result.remainingStock).toBe(0);
      expect(result.totalSold).toBe(100);
    });
  });

  describe('getUserPurchase', () => {
    const validSaleId = '123e4567-e89b-12d3-a456-426614174000';
    const userId = 'user123';

    it('should return purchase info when user has purchased', async () => {
      const mockPurchase = {
        purchased: true,
        orderId: 'order-123',
        status: 'CONFIRMED',
      };

      jest.spyOn(service, 'getUserPurchase').mockResolvedValue(mockPurchase);

      const result = await controller.getUserPurchase(validSaleId, userId);

      expect(result).toEqual(mockPurchase);
      expect(service.getUserPurchase).toHaveBeenCalledWith(validSaleId, userId);
    });

    it('should return not purchased when user has not purchased', async () => {
      const mockPurchase = {
        purchased: false,
        orderId: null,
        status: 'NOT_PURCHASED',
      };

      jest.spyOn(service, 'getUserPurchase').mockResolvedValue(mockPurchase);

      const result = await controller.getUserPurchase(validSaleId, userId);

      expect(result.purchased).toBe(false);
      expect(result.orderId).toBeNull();
      expect(result.status).toBe('NOT_PURCHASED');
    });

    it('should throw NotFoundException for non-existent sale', async () => {
      jest
        .spyOn(service, 'getUserPurchase')
        .mockRejectedValue(
          new NotFoundException(`Sale ${validSaleId} not found`),
        );

      await expect(
        controller.getUserPurchase(validSaleId, userId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('resetSale', () => {
    const validResetDto = {
      saleId: '123e4567-e89b-12d3-a456-426614174000',
    };

    it('should successfully reset sale', async () => {
      jest.spyOn(service, 'resetSale').mockResolvedValue(undefined);

      const result = await controller.resetSale(validResetDto);

      expect(result).toEqual({
        success: true,
        message: `Sale ${validResetDto.saleId} has been reset`,
      });
      expect(service.resetSale).toHaveBeenCalledWith(validResetDto.saleId);
    });

    it('should throw NotFoundException for non-existent sale', async () => {
      jest
        .spyOn(service, 'resetSale')
        .mockRejectedValue(
          new NotFoundException(`Sale ${validResetDto.saleId} not found`),
        );

      await expect(controller.resetSale(validResetDto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return success response structure', async () => {
      jest.spyOn(service, 'resetSale').mockResolvedValue(undefined);

      const result = await controller.resetSale(validResetDto);

      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('message');
      expect(result.message).toContain(validResetDto.saleId);
    });
  });

  describe('Error Handling', () => {
    it('should propagate service errors', async () => {
      const error = new Error('Database connection failed');
      jest.spyOn(service, 'getAllSales').mockRejectedValue(error);

      await expect(controller.getAllSales()).rejects.toThrow(error);
    });

    it('should handle unexpected errors in purchase', async () => {
      const error = new Error('Unexpected error');
      jest.spyOn(service, 'attemptPurchase').mockRejectedValue(error);

      await expect(
        controller.purchase({
          saleId: '123e4567-e89b-12d3-a456-426614174000',
          userId: 'user123',
        }),
      ).rejects.toThrow(error);
    });
  });

  describe('Controller Methods', () => {
    it('should have getAllSales method', () => {
      expect(controller.getAllSales).toBeDefined();
      expect(typeof controller.getAllSales).toBe('function');
    });

    it('should have purchase method', () => {
      expect(controller.purchase).toBeDefined();
      expect(typeof controller.purchase).toBe('function');
    });

    it('should have getSaleStatus method', () => {
      expect(controller.getSaleStatus).toBeDefined();
      expect(typeof controller.getSaleStatus).toBe('function');
    });

    it('should have getUserPurchase method', () => {
      expect(controller.getUserPurchase).toBeDefined();
      expect(typeof controller.getUserPurchase).toBe('function');
    });

    it('should have resetSale method', () => {
      expect(controller.resetSale).toBeDefined();
      expect(typeof controller.resetSale).toBe('function');
    });
  });
});
