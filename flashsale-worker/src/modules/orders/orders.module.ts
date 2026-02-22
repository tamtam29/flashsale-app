import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { OrdersService } from "./orders.service";

@Module({
  imports: [AuditModule],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
