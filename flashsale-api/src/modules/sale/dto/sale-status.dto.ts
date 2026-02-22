export class SaleStatusDto {
  saleId: string;
  name: string;
  remainingStock: number;
  totalSold: number;
  saleActive: boolean;
  startsAt: Date;
  endsAt: Date;
  status: string;
}
