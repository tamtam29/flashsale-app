import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AuditEventType } from './audit.types';

@Injectable()
export class AuditService implements OnModuleDestroy {
  private readonly logger = new Logger(AuditService.name);
  private auditQueue: Array<{
    saleId: string;
    userId: string;
    eventType: AuditEventType;
    metadata?: Record<string, any>;
  }> = [];
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(private prisma: PrismaService) {}

  async onModuleDestroy() {
    // Clear timer
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    // Flush remaining events
    await this.flush();
    this.logger.log('Audit service shut down, all events flushed');
  }

  private startFlushTimer() {
    if (!this.flushTimer) {
      this.flushTimer = setInterval(() => {
        void this.flush();
      }, 1000);
    }
  }

  /**
   * Log an audit event (batched, non-blocking)
   */
  logEvent(
    saleId: string,
    userId: string,
    eventType: AuditEventType,
    metadata?: Record<string, any>,
  ): void {
    // Add to queue for batch processing
    this.auditQueue.push({ saleId, userId, eventType, metadata });

    // Start flush timer if not already running
    this.startFlushTimer();

    // Flush immediately if queue is large
    if (this.auditQueue.length >= 100) {
      void this.flush();
    }
  }

  /**
   * Flush audit queue to database
   */
  private async flush() {
    if (this.auditQueue.length === 0) return;

    const batch = this.auditQueue.splice(0, 100); // Take up to 100 events

    try {
      await this.prisma.orderAuditTrail.createMany({
        data: batch.map((event) => ({
          saleId: event.saleId,
          userId: event.userId,
          eventType: event.eventType,
          metadata: event.metadata || {},
        })),
        skipDuplicates: true,
      });

      this.logger.debug(`Flushed ${batch.length} audit events`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to flush audit events: ${message}`);
    }
  }
}
