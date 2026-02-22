import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as amqp from "amqp-connection-manager";
import { ChannelWrapper } from "amqp-connection-manager";
import { Channel, ConsumeMessage } from "amqplib";
import { OrdersService } from "../orders/orders.service";

interface PurchaseMessage {
  saleId: string;
  userId: string;
}

@Injectable()
export class QueueConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueConsumer.name);
  private connection: amqp.AmqpConnectionManager;
  private channelWrapper: ChannelWrapper;
  private readonly queueName = "purchase_queue";
  private readonly dlqName = "purchase_dlq";
  private readonly maxRetries = 3;

  constructor(
    private readonly configService: ConfigService,
    private readonly ordersService: OrdersService,
  ) {}

  async onModuleInit() {
    await this.connect();
  }

  async onModuleDestroy() {
    await this.disconnect();
  }

  private async connect() {
    const url =
      this.configService.get<string>("RABBITMQ_URL") ||
      "amqp://flashsale:flashsale_password@localhost:5672";

    if (!url) {
      throw new Error("RABBITMQ_URL is not configured");
    }

    this.logger.log(`Connecting to RabbitMQ: ${url}`);

    // Create connection manager
    this.connection = amqp.connect([url], {
      heartbeatIntervalInSeconds: 30,
      reconnectTimeInSeconds: 5,
    });

    // Handle connection events
    this.connection.on("connect", () => {
      this.logger.log("Connected to RabbitMQ");
    });

    this.connection.on("disconnect", (params) => {
      this.logger.warn("Disconnected from RabbitMQ", params?.err?.message);
    });

    this.connection.on("connectFailed", (params) => {
      this.logger.error("Failed to connect to RabbitMQ", params?.err?.message);
    });

    // Create channel wrapper
    this.channelWrapper = this.connection.createChannel({
      json: false,
      setup: async (channel: Channel) => {
        // Declare dead-letter queue
        await channel.assertQueue(this.dlqName, {
          durable: true,
        });

        // Declare main queue with DLQ configuration
        await channel.assertQueue(this.queueName, {
          durable: true,
          arguments: {
            "x-dead-letter-exchange": "",
            "x-dead-letter-routing-key": this.dlqName,
          },
        });

        // Set prefetch to 1 to process one message at a time
        await channel.prefetch(1);

        this.logger.log(`Consuming from queue: ${this.queueName}`);

        // Start consuming messages
        await channel.consume(
          this.queueName,
          (msg: ConsumeMessage | null) => {
            if (msg) {
              void this.handleMessage(msg, channel);
            }
          },
          {
            noAck: false, // Manual ACK
          },
        );
      },
    });

    await this.channelWrapper.waitForConnect();
    this.logger.log("Queue consumer initialized and ready");
  }

  private async handleMessage(msg: ConsumeMessage, channel: Channel) {
    try {
      // Parse message content
      const content = msg.content.toString();
      const parsed: unknown = JSON.parse(content);

      // Validate message structure
      if (
        !parsed ||
        typeof parsed !== "object" ||
        !("saleId" in parsed) ||
        !("userId" in parsed)
      ) {
        throw new Error("Invalid message format");
      }

      const message = parsed as PurchaseMessage;

      this.logger.debug(`Received message: ${content}`);

      // Process the order
      await this.ordersService.processOrder(message.saleId, message.userId);

      // ACK the message on success
      channel.ack(msg);
      this.logger.log(
        `Order processed successfully: saleId=${message.saleId}, userId=${message.userId}`,
      );
    } catch (error) {
      const errorStack = error instanceof Error ? error.stack : String(error);
      this.logger.error("Error processing message", errorStack);

      // Get retry count from message headers
      const headers = msg.properties.headers as
        | Record<string, unknown>
        | undefined;
      const headerValue = headers?.["x-retry-count"];
      const retryCount = typeof headerValue === "number" ? headerValue : 0;

      if (retryCount < this.maxRetries) {
        // NACK and requeue with updated retry count
        this.logger.warn(
          `Requeuing message (retry ${retryCount + 1}/${this.maxRetries})`,
        );

        // Publish back to queue with incremented retry count
        try {
          const content = msg.content.toString();
          channel.sendToQueue(this.queueName, Buffer.from(content), {
            persistent: true,
            headers: {
              "x-retry-count": retryCount + 1,
            },
          });

          // ACK the original message since we've requeued it
          channel.ack(msg);
        } catch (requeueError) {
          const requeueErrorStack =
            requeueError instanceof Error
              ? requeueError.stack
              : String(requeueError);
          this.logger.error("Failed to requeue message", requeueErrorStack);
          // NACK without requeue to avoid infinite loop
          channel.nack(msg, false, false);
        }
      } else {
        // Max retries exceeded - NACK without requeue (dead letter)
        this.logger.error(
          `Max retries exceeded for message, discarding: ${msg.content.toString()}`,
        );
        channel.nack(msg, false, false);
      }
    }
  }

  private async disconnect() {
    this.logger.log("Shutting down queue consumer...");

    try {
      if (this.channelWrapper) {
        await this.channelWrapper.close();
      }

      if (this.connection) {
        await this.connection.close();
      }

      this.logger.log("Queue consumer shut down gracefully");
    } catch (error) {
      const errorStack = error instanceof Error ? error.stack : String(error);
      this.logger.error("Error during shutdown", errorStack);
    }
  }
}
