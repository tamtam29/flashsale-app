import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PurchaseDto } from './dto/purchase.dto';
import { ResetSaleDto } from './dto/reset-sale.dto';
import { SaleStatusDto } from './dto/sale-status.dto';
import { UserPurchaseDto } from './dto/user-purchase.dto';
import { SaleService } from './sale.service';

@Controller('api/v1')
export class SaleController {
  constructor(private readonly saleService: SaleService) {}

  /**
   * Get all sales
   */
  @Get('sales')
  async getAllSales(): Promise<SaleStatusDto[]> {
    return await this.saleService.getAllSales();
  }

  /**
   * Attempt to purchase from a sale
   */
  @Post('sale/purchase')
  @Throttle({ default: { limit: 100, ttl: 1000 } }) // 100 req/second for stress testing
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async purchase(@Body() purchaseDto: PurchaseDto) {
    return await this.saleService.attemptPurchase(
      purchaseDto.saleId,
      purchaseDto.userId,
    );
  }

  /**
   * Get sale status
   */
  @Get('sale/:saleId/status')
  async getSaleStatus(
    @Param('saleId', ParseUUIDPipe) saleId: string,
  ): Promise<SaleStatusDto> {
    return await this.saleService.getSaleStatus(saleId);
  }

  /**
   * Check if user has purchased from a sale
   */
  @Get('sale/:saleId/user/:userId/purchase')
  async getUserPurchase(
    @Param('saleId', ParseUUIDPipe) saleId: string,
    @Param('userId') userId: string,
  ): Promise<UserPurchaseDto> {
    return await this.saleService.getUserPurchase(saleId, userId);
  }

  /**
   * Admin endpoint to reset a sale (for testing)
   */
  @Post('admin/reset')
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 req/minute for admin
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async resetSale(@Body() resetSaleDto: ResetSaleDto) {
    await this.saleService.resetSale(resetSaleDto.saleId);
    return {
      success: true,
      message: `Sale ${resetSaleDto.saleId} has been reset`,
    };
  }
}
