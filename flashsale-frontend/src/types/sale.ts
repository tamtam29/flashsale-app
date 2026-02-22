export interface SaleStatus {
  saleId: string;
  name: string;
  remainingStock: number;
  totalSold: number;
  saleActive: boolean;
  startsAt: string;
  endsAt: string;
  status: string;
}

export interface PurchaseResponse {
  status: 'SUCCESS' | 'ALREADY_PURCHASED' | 'SOLD_OUT' | 'SALE_NOT_ACTIVE';
  message: string;
}

export interface UserPurchase {
  purchased: boolean;
  orderId: string | null;
  status: string;
}
