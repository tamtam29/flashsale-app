import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { DatabaseModule } from '../database/database.module';
import { QueueModule } from '../queue/queue.module';
import { RedisModule } from '../redis/redis.module';
import { SaleController } from './sale.controller';
import { SaleService } from './sale.service';

@Module({
  imports: [DatabaseModule, RedisModule, QueueModule, AuditModule],
  controllers: [SaleController],
  providers: [SaleService],
  exports: [SaleService],
})
export class SaleModule {}
