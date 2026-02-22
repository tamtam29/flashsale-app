import type { PurchaseResponse, SaleStatus, UserPurchase } from '@/types/sale';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    endpoint: string,
    options?: RequestInit
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      cache: options?.cache || 'no-store', // Ensure fresh data by default
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Request failed' }));
      
      // Handle error message from response
      if (errorData.message) {
        throw new Error(errorData.message);
      }
      
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    return await response.json();
  }

  /**
   * Fetches the current status of a sale including stock levels and timing
   * @param saleId - The ID of the sale to fetch
   * @returns Sale status information
   */
  async getSaleStatus(saleId: string): Promise<SaleStatus> {
    return this.request<SaleStatus>(`/api/v1/sale/${saleId}/status`);
  }

  /**
   * Attempts to purchase an item from a flash sale
   * @param saleId - The ID of the sale
   * @param userId - The ID of the user making the purchase
   * @returns Purchase result indicating success or failure reason
   */
  async attemptPurchase(saleId: string, userId: string): Promise<PurchaseResponse> {
    return this.request<PurchaseResponse>('/api/v1/sale/purchase', {
      method: 'POST',
      body: JSON.stringify({ saleId, userId }),
    });
  }

  /**
   * Checks if a user has already made a purchase for a specific sale
   * @param saleId - The ID of the sale
   * @param userId - The ID of the user
   * @returns User purchase information including order ID if purchased
   */
  async getUserPurchase(saleId: string, userId: string): Promise<UserPurchase> {
    return this.request<UserPurchase>(`/api/v1/sale/${saleId}/user/${userId}/purchase`);
  }

  /**
   * Fetches all sales from the backend
   * @returns Array of all sale statuses
   */
  async getAllSales(): Promise<SaleStatus[]> {
    return this.request<SaleStatus[]>('/api/v1/sales');
  }

  /**
   * Fetches status for multiple sales (legacy method for backward compatibility)
   * @param saleIds - Array of sale IDs to fetch
   * @returns Array of sale statuses
   * @deprecated Use getAllSales() instead
   */
  async getSalesByIds(saleIds: string[]): Promise<SaleStatus[]> {
    const promises = saleIds.map(saleId => this.getSaleStatus(saleId));
    const results = await Promise.allSettled(promises);
    
    // Filter out any failed requests and return successful ones
    return results
      .filter((result): result is PromiseFulfilledResult<SaleStatus> => 
        result.status === 'fulfilled'
      )
      .map(result => result.value);
  }
}

export const apiClient = new ApiClient(API_BASE_URL);

// Export individual methods for backward compatibility
export const getSaleStatus = (saleId: string) => apiClient.getSaleStatus(saleId);
export const attemptPurchase = (saleId: string, userId: string) => apiClient.attemptPurchase(saleId, userId);
export const getUserPurchase = (saleId: string, userId: string) => apiClient.getUserPurchase(saleId, userId);
export const getAllSales = () => apiClient.getAllSales();
