import { Module } from "@nestjs/common";
import { OrdersModule } from "../orders/orders.module";
import { QueueConsumer } from "./queue.consumer";

@Module({
  imports: [OrdersModule],
  providers: [QueueConsumer],
})
export class QueueModule {}
