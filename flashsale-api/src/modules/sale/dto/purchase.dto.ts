import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class PurchaseDto {
  @IsUUID()
  @IsNotEmpty()
  saleId: string;

  @IsString()
  @IsNotEmpty()
  userId: string;
}
