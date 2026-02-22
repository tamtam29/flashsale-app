import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { QueueService } from '../queue/queue.service';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private queue: QueueService,
  ) {}

  async checkHealth() {
    const startTime = Date.now();

    const checks = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
      Promise.resolve(this.checkRabbitMQ()),
    ]);

    const [database, redis, rabbitmq] = checks;

    const allHealthy = checks.every((check) => check.status === 'up');
    const status = allHealthy ? 'ok' : 'degraded';

    const responseTime = Date.now() - startTime;

    return {
      status,
      timestamp: new Date().toISOString(),
      responseTime: `${responseTime}ms`,
      services: {
        database,
        redis,
        rabbitmq,
      },
    };
  }

  private async checkDatabase() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'up', message: 'Connected' };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Database health check failed: ${message}`);
      return { status: 'down', message };
    }
  }

  private async checkRedis() {
    try {
      const isHealthy = await this.redis.ping();
      return isHealthy
        ? { status: 'up', message: 'Connected' }
        : { status: 'down', message: 'Ping failed' };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Redis health check failed: ${message}`);
      return { status: 'down', message };
    }
  }

  private checkRabbitMQ() {
    try {
      const isHealthy = this.queue.isHealthy();
      return isHealthy
        ? { status: 'up', message: 'Connected' }
        : { status: 'down', message: 'Not connected' };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`RabbitMQ health check failed: ${message}`);
      return { status: 'down', message };
    }
  }
}
