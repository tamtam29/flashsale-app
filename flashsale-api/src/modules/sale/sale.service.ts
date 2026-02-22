import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { Sale } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuditEventType } from '../audit/audit.types';
import { PrismaService } from '../database/prisma.service';
import { QueueService } from '../queue/queue.service';
import { RedisService } from '../redis/redis.service';
import { SaleStatusDto } from './dto/sale-status.dto';
import { UserPurchaseDto } from './dto/user-purchase.dto';

@Injectable()
export class SaleService implements OnModuleInit {
  private readonly logger = new Logger(SaleService.name);
  private saleCache: Map<string, { sale: Sale; cachedAt: number }> = new Map();
  private readonly CACHE_TTL = 60000; // 1 minute

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private queue: QueueService,
    private audit: AuditService,
  ) {}

  async onModuleInit() {
    this.logger.log('Initializing SaleService...');
    await this.reconcileSales();
    this.logger.log('SaleService initialized successfully');
  }

  /**
   * Reconcile Redis state with database on startup
   */
  async reconcileSales(): Promise<void> {
    try {
      const sales = await this.prisma.sale.findMany();

      for (const sale of sales) {
        // Count confirmed orders for this sale
        const confirmedOrders = await this.prisma.order.count({
          where: {
            saleId: sale.id,
            status: 'CONFIRMED',
          },
        });

        // Calculate remaining stock
        const remainingStock = Math.max(0, sale.totalStock - confirmedOrders);

        // Set stock in Redis
        await this.redis.setStock(sale.id, remainingStock);

        // Get all users who purchased
        const orders = await this.prisma.order.findMany({
          where: {
            saleId: sale.id,
            status: 'CONFIRMED',
          },
          select: { userId: true },
        });

        // Add users to Redis set
        if (orders.length > 0) {
          const userIds = orders.map((order) => order.userId);
          await this.redis.addUsers(sale.id, userIds);
        }

        this.logger.debug(
          `Reconciled sale ${sale.id}: ${remainingStock} remaining, ${confirmedOrders} confirmed orders`,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to reconcile sales: ${message}`);
      throw error;
    }
  }

  /**
   * Validate if sale is currently active based on time window
   */
  validateSaleWindow(sale: Sale): boolean {
    const now = new Date();
    return now >= sale.startsAt && now <= sale.endsAt;
  }

  /**
   * Get all sales with their status
   */
  async getAllSales(): Promise<SaleStatusDto[]> {
    const sales = await this.prisma.sale.findMany({
      orderBy: {
        startsAt: 'asc',
      },
    });

    const salesWithStatus = await Promise.all(
      sales.map(async (sale) => {
        // Get remaining stock from Redis
        const remainingStock = await this.redis.getStock(sale.id);

        // Get total sold from database
        const totalSold = await this.prisma.order.count({
          where: {
            saleId: sale.id,
            status: 'CONFIRMED',
          },
        });

        // Check if sale is active
        const saleActive = this.validateSaleWindow(sale);

        return {
          saleId: sale.id,
          name: sale.name,
          remainingStock,
          totalSold,
          saleActive,
          startsAt: sale.startsAt,
          endsAt: sale.endsAt,
          status: saleActive ? 'ACTIVE' : 'INACTIVE',
        };
      }),
    );

    return salesWithStatus;
  }

  /**
   * Get sale status including remaining stock from Redis
   */
  async getSaleStatus(saleId: string): Promise<SaleStatusDto> {
    const sale = await this.prisma.sale.findUnique({
      where: { id: saleId },
    });

    if (!sale) {
      throw new NotFoundException(`Sale ${saleId} not found`);
    }

    // Get remaining stock from Redis
    const remainingStock = await this.redis.getStock(saleId);

    // Get total sold from database
    const totalSold = await this.prisma.order.count({
      where: {
        saleId,
        status: 'CONFIRMED',
      },
    });

    // Check if sale is active
    const saleActive = this.validateSaleWindow(sale);

    return {
      saleId: sale.id,
      name: sale.name,
      remainingStock,
      totalSold,
      saleActive,
      startsAt: sale.startsAt,
      endsAt: sale.endsAt,
      status: saleActive ? 'ACTIVE' : 'INACTIVE',
    };
  }

  /**
   * Check if user has purchased from this sale
   */
  async getUserPurchase(
    saleId: string,
    userId: string,
  ): Promise<UserPurchaseDto> {
    const sale = await this.prisma.sale.findUnique({
      where: { id: saleId },
    });

    if (!sale) {
      throw new NotFoundException(`Sale ${saleId} not found`);
    }

    const order = await this.prisma.order.findFirst({
      where: {
        saleId,
        userId,
      },
    });

    if (order) {
      return {
        purchased: true,
        orderId: order.id,
        status: order.status,
      };
    }

    return {
      purchased: false,
      orderId: null,
      status: 'NOT_PURCHASED',
    };
  }

  /**
   * Get sale from cache or database
   */
  private async getSale(saleId: string): Promise<Sale> {
    const cached = this.saleCache.get(saleId);
    const now = Date.now();

    if (cached && now - cached.cachedAt < this.CACHE_TTL) {
      return cached.sale;
    }

    const sale = await this.prisma.sale.findUnique({
      where: { id: saleId },
    });

    if (!sale) {
      throw new NotFoundException(`Sale ${saleId} not found`);
    }

    this.saleCache.set(saleId, { sale, cachedAt: now });
    return sale;
  }

  /**
   * Attempt to purchase from a sale (optimized for high concurrency)
   */
  async attemptPurchase(
    saleId: string,
    userId: string,
  ): Promise<{
    success: boolean;
    status: string;
    message: string;
    orderId?: string;
  }> {
    // Get sale from cache
    const sale = await this.getSale(saleId);

    // Validate time window
    if (!this.validateSaleWindow(sale)) {
      this.audit.logEvent(saleId, userId, AuditEventType.REJECTED_NOT_ACTIVE, {
        reason: 'Sale not active',
      });
      throw new BadRequestException('Sale is not currently active');
    }

    // Log attempt (non-blocking)
    this.audit.logEvent(saleId, userId, AuditEventType.ATTEMPTED, {
      timestamp: new Date().toISOString(),
    });

    // Execute purchase in Redis
    const result = await this.redis.executePurchase(saleId, userId);

    // Handle result
    if (result === 0) {
      // SOLD_OUT
      this.audit.logEvent(saleId, userId, AuditEventType.REJECTED_SOLD_OUT, {
        reason: 'No stock available',
      });
      return {
        success: false,
        status: 'SOLD_OUT',
        message: 'Sale is sold out',
      };
    } else if (result === 2) {
      // ALREADY_PURCHASED
      this.audit.logEvent(saleId, userId, AuditEventType.REJECTED_DUPLICATE, {
        reason: 'User already purchased',
      });
      return {
        success: false,
        status: 'ALREADY_PURCHASED',
        message: 'You have already purchased from this sale',
      };
    } else if (result === 1) {
      // SUCCESS
      this.audit.logEvent(saleId, userId, AuditEventType.RESERVED, {
        timestamp: new Date().toISOString(),
      });

      // Publish to queue for async processing (fire and forget)
      this.queue.publishPurchaseEvent(saleId, userId);

      return {
        success: true,
        status: 'SUCCESS',
        message: 'Purchase reserved successfully',
      };
    }

    throw new Error(`Unknown purchase result: ${result}`);
  }

  /**
   * Reset sale stock in Redis and database (for testing/admin)
   */
  async resetSale(saleId: string): Promise<void> {
    const sale = await this.prisma.sale.findUnique({
      where: { id: saleId },
    });

    if (!sale) {
      throw new NotFoundException(`Sale ${saleId} not found`);
    }

    // Delete all orders for this sale from database
    const deletedOrders = await this.prisma.order.deleteMany({
      where: { saleId },
    });

    // Delete all audit trail entries for this sale
    const deletedAudits = await this.prisma.orderAuditTrail.deleteMany({
      where: { saleId },
    });

    // Reset Redis data (clears both stock and users)
    await this.redis.resetSale(saleId);

    // Set stock to total
    await this.redis.setStock(saleId, sale.totalStock);

    // Clear in-memory cache for this sale
    this.saleCache.delete(saleId);

    // Log admin reset
    this.audit.logEvent(saleId, 'SYSTEM', AuditEventType.ADMIN_RESET, {
      resetAt: new Date().toISOString(),
      deletedOrders: deletedOrders.count,
      deletedAudits: deletedAudits.count,
    });

    this.logger.log(
      `Sale ${saleId} reset: ${sale.totalStock} stock, ${deletedOrders.count} orders deleted, ${deletedAudits.count} audits deleted`,
    );
  }
}
