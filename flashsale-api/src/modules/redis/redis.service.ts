import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import Redis from 'ioredis';
import * as path from 'path';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis;
  private purchaseLuaScript: string;
  private purchaseLuaSha: string;

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    const host = this.configService.get<string>('REDIS_HOST') || 'localhost';
    const port = this.configService.get<number>('REDIS_PORT') || 6379;

    this.client = new Redis({
      host,
      port,
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      enableOfflineQueue: true,
      connectTimeout: 10000,
      lazyConnect: false,
      keepAlive: 30000,
      // Performance optimizations
      autoResubscribe: false,
      autoResendUnfulfilledCommands: true,
    });

    this.client.on('connect', () => {
      this.logger.log(`Connected to Redis at ${host}:${port}`);
    });

    this.client.on('error', (err: Error) => {
      this.logger.error(`Redis connection error: ${err?.message || err}`);
    });

    // Load and register Lua script
    await this.loadPurchaseScript();
  }

  async onModuleDestroy() {
    await this.client.quit();
    this.logger.log('Redis connection closed');
  }

  private async loadPurchaseScript() {
    try {
      // Try multiple paths for different environments
      const possiblePaths = [
        // Production: script copied to dist alongside compiled code
        path.join(__dirname, 'script', 'purchase.lua'),
        // Alternative: from project root
        path.join(
          process.cwd(),
          'src',
          'modules',
          'redis',
          'script',
          'purchase.lua',
        ),
      ];

      let scriptPath: string | null = null;
      for (const possiblePath of possiblePaths) {
        if (fs.existsSync(possiblePath)) {
          scriptPath = possiblePath;
          break;
        }
      }

      if (!scriptPath) {
        throw new Error(
          `Lua script not found in any of these locations:\n${possiblePaths.join('\n')}`,
        );
      }

      this.purchaseLuaScript = fs.readFileSync(scriptPath, 'utf8');
      this.logger.log(`Lua script loaded from: ${scriptPath}`);

      // Pre-load script into Redis
      this.purchaseLuaSha = (await this.client.script(
        'LOAD',
        this.purchaseLuaScript,
      )) as string;
      this.logger.log(
        `Purchase Lua script loaded with SHA: ${this.purchaseLuaSha}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to load Lua script: ${message}`);
      throw error;
    }
  }

  /**
   * Execute atomic purchase operation using Lua script
   * @returns 0 = SOLD_OUT, 1 = SUCCESS, 2 = ALREADY_PURCHASED
   */
  async executePurchase(saleId: string, userId: string): Promise<number> {
    const stockKey = `sale:${saleId}:stock`;
    const usersKey = `sale:${saleId}:users`;

    try {
      const result = await this.client.evalsha(
        this.purchaseLuaSha,
        2,
        stockKey,
        usersKey,
        userId,
      );
      return result as number;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to execute purchase script: ${message} `);
      throw error;
    }
  }

  /**
   * Get remaining stock for a sale
   */
  async getStock(saleId: string): Promise<number> {
    const stockKey = `sale:${saleId}:stock`;
    const stock = await this.client.get(stockKey);
    return stock ? parseInt(stock, 10) : 0;
  }

  /**
   * Set stock for a sale
   */
  async setStock(saleId: string, stock: number): Promise<void> {
    const stockKey = `sale:${saleId}:stock`;
    await this.client.set(stockKey, stock);
  }

  /**
   * Get all users who purchased for a sale
   */
  async getUsers(saleId: string): Promise<string[]> {
    const usersKey = `sale:${saleId}:users`;
    return await this.client.smembers(usersKey);
  }

  /**
   * Check if user already purchased
   */
  async hasUserPurchased(saleId: string, userId: string): Promise<boolean> {
    const usersKey = `sale:${saleId}:users`;
    const result = await this.client.sismember(usersKey, userId);
    return result === 1;
  }

  /**
   * Add users to the purchased set (for reconciliation)
   */
  async addUsers(saleId: string, userIds: string[]): Promise<void> {
    if (userIds.length === 0) return;
    const usersKey = `sale:${saleId}:users`;
    await this.client.sadd(usersKey, ...userIds);
  }

  /**
   * Reset sale data (for testing/admin)
   */
  async resetSale(saleId: string): Promise<void> {
    const stockKey = `sale:${saleId}:stock`;
    const usersKey = `sale:${saleId}:users`;
    await this.client.del(stockKey, usersKey);
  }

  /**
   * Health check
   */
  async ping(): Promise<boolean> {
    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }

  /**
   * Get raw client (for advanced operations)
   */
  getClient(): Redis {
    return this.client;
  }
}
