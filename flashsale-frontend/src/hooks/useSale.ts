import { attemptPurchase, getAllSales, getSaleStatus, getUserPurchase } from '@/lib/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

/**
 * Hook to fetch sale status with automatic refetching
 */
export function useSaleStatus(saleId: string) {
  return useQuery({
    queryKey: ['sale', saleId],
    queryFn: () => getSaleStatus(saleId),
    refetchInterval: 3000, // Refetch every 3 seconds for real-time updates
    staleTime: 1000, // Consider data stale after 1 second
  });
}

/**
 * Hook to fetch user purchase status
 */
export function useUserPurchase(saleId: string, userId: string) {
  return useQuery({
    queryKey: ['userPurchase', saleId, userId],
    queryFn: () => getUserPurchase(saleId, userId),
    enabled: !!userId && userId.trim() !== '', // Only fetch when userId is provided
    retry: false, // Don't retry if user hasn't purchased yet
    staleTime: 5000,
  });
}

/**
 * Hook to handle purchase mutation
 */
export function usePurchase(saleId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId }: { userId: string }) => attemptPurchase(saleId, userId),
    onSuccess: (data, variables) => {
      // Invalidate and refetch relevant queries after successful purchase
      queryClient.invalidateQueries({ queryKey: ['sale', saleId] });
      queryClient.invalidateQueries({ queryKey: ['userPurchase', saleId, variables.userId] });
      queryClient.invalidateQueries({ queryKey: ['sales'] });
    },
  });
}

/**
 * Hook to fetch multiple sales
 */
export function useAllSales() {
  return useQuery({
    queryKey: ['sales'],
    queryFn: () => getAllSales(),
    refetchInterval: 10000, // Refetch every 10 seconds
    staleTime: 5000,
  });
}
