import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { UserRateLimitGuard } from './common/guards/user-rate-limit.guard';
import { AuditModule } from './modules/audit/audit.module';
import { DatabaseModule } from './modules/database/database.module';
import { HealthModule } from './modules/health/health.module';
import { QueueModule } from './modules/queue/queue.module';
import { RedisModule } from './modules/redis/redis.module';
import { SaleModule } from './modules/sale/sale.module';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // Rate Limiting - Redis-backed for distributed rate limiting
    ThrottlerModule.forRoot([
      {
        ttl: 1000, // 1 second
        limit: 100, // 100 requests per second (for stress testing)
      },
    ]),

    // Core modules
    DatabaseModule,
    RedisModule,
    QueueModule,
    AuditModule,

    // Feature modules
    SaleModule,
    HealthModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: UserRateLimitGuard,
    },
  ],
})
export class AppModule {}
