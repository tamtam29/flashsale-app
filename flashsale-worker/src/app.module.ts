import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AuditModule } from "./modules/audit/audit.module";
import { DatabaseModule } from "./modules/database/database.module";
import { OrdersModule } from "./modules/orders/orders.module";
import { QueueModule } from "./modules/queue/queue.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ".env",
    }),
    DatabaseModule,
    AuditModule,
    OrdersModule,
    QueueModule,
  ],
})
export class AppModule {}
