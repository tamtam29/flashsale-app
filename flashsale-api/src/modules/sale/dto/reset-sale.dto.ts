import { IsNotEmpty, IsUUID } from 'class-validator';

export class ResetSaleDto {
  @IsUUID()
  @IsNotEmpty()
  saleId: string;
}
