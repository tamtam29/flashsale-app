import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqp-connection-manager';
import { ChannelWrapper } from 'amqp-connection-manager';
import { ConfirmChannel } from 'amqplib';

export interface PurchaseMessage {
  saleId: string;
  userId: string;
  timestamp: string;
}

@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private connection: amqp.AmqpConnectionManager;
  private channelWrapper: ChannelWrapper;
  private readonly queueName = 'purchase_queue';
  private readonly dlqName = 'purchase_dlq';

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    const url =
      this.configService.get<string>('RABBITMQ_URL') ||
      'amqp://flashsale:flashsale_password@localhost:5672';

    this.connection = amqp.connect([url], {
      heartbeatIntervalInSeconds: 30,
      reconnectTimeInSeconds: 5,
    });

    this.connection.on('connect', () => {
      this.logger.log('Connected to RabbitMQ');
    });

    this.connection.on('disconnect', (err: { err: Error }) => {
      this.logger.error(
        `Disconnected from RabbitMQ: ${err?.err?.message || 'Unknown error'}`,
      );
    });

    this.connection.on('connectFailed', (params) => {
      this.logger.error('Failed to connect to RabbitMQ', params?.err?.message);
    });

    this.channelWrapper = this.connection.createChannel({
      json: true,
      setup: async (channel: ConfirmChannel) => {
        // Declare dead-letter queue
        await channel.assertQueue(this.dlqName, {
          durable: true,
        });

        // Declare main queue with DLQ
        await channel.assertQueue(this.queueName, {
          durable: true,
          arguments: {
            'x-dead-letter-exchange': '',
            'x-dead-letter-routing-key': this.dlqName,
          },
        });

        // Set prefetch for better performance
        await channel.prefetch(100);

        this.logger.log(`Queue '${this.queueName}' asserted`);
      },
    });
  }

  async onModuleDestroy() {
    await this.channelWrapper.close();
    await this.connection.close();
    this.logger.log('RabbitMQ connection closed');
  }

  /**
   * Publish purchase event to queue (non-blocking, fire-and-forget)
   */
  publishPurchaseEvent(saleId: string, userId: string): void {
    const message: PurchaseMessage = {
      saleId,
      userId,
      timestamp: new Date().toISOString(),
    };

    // Use sendToQueue without await for fire-and-forget behavior
    this.channelWrapper
      .sendToQueue(this.queueName, message, {
        persistent: true,
        contentType: 'application/json',
      })
      .catch((error) => {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(`Failed to publish message: ${message}`, {
          saleId,
          userId,
        });
      });

    this.logger.debug(`Published purchase event: ${saleId} - ${userId}`);
  }

  /**
   * Health check
   */
  isHealthy(): boolean {
    try {
      return this.connection.isConnected();
    } catch {
      return false;
    }
  }
}
