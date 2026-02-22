'use client';

import { usePurchase, useSaleStatus, useUserPurchase } from '@/hooks/useSale';
import { PurchaseResponse } from '@/types/sale';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

export default function SalePage() {
  const params = useParams();
  const saleId = params.saleId as string;

  // State management
  const [userId, setUserId] = useState('');
  const [purchaseResult, setPurchaseResult] = useState<PurchaseResponse | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<string>('');
  const [salePhase, setSalePhase] = useState<'before' | 'active' | 'ended'>('before');

  // React Query hooks
  const { data: saleStatus, isLoading: saleLoading, error: saleError } = useSaleStatus(saleId);
  const { data: userPurchase } = useUserPurchase(saleId, userId);
  const purchaseMutation = usePurchase(saleId);

  // Format time difference in readable format
  const formatTimeDiff = useCallback((ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h ${minutes % 60}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }, []);

  // Countdown timer
  useEffect(() => {
    if (!saleStatus) return;

    const updateCountdown = () => {
      const now = new Date().getTime();
      const startsAt = new Date(saleStatus.startsAt).getTime();
      const endsAt = new Date(saleStatus.endsAt).getTime();

      if (now < startsAt) {
        // Sale hasn't started
        setSalePhase('before');
        const diff = startsAt - now;
        setTimeRemaining(formatTimeDiff(diff));
      } else if (now >= startsAt && now < endsAt) {
        // Sale is active
        setSalePhase('active');
        const diff = endsAt - now;
        setTimeRemaining(formatTimeDiff(diff));
      } else {
        // Sale has ended
        setSalePhase('ended');
        setTimeRemaining('Sale Ended');
      }
    };

    // Update immediately
    updateCountdown();

    // Update every second
    const interval = setInterval(updateCountdown, 1000);

    return () => clearInterval(interval);
  }, [saleStatus, formatTimeDiff]);

  // Handle purchase attempt
  const handlePurchase = async () => {
    if (!userId || userId.trim() === '') {
      setInputError('Please enter a valid User ID');
      return;
    }

    setInputError(null);
    setPurchaseResult(null);

    try {
      const result = await purchaseMutation.mutateAsync({ userId });
      setPurchaseResult(result);
    } catch (err) {
      setInputError(err instanceof Error ? err.message : 'Failed to complete purchase');
    }
  };

  // Check if purchase button should be disabled
  const isPurchaseDisabled = (): boolean => {
    if (!userId || userId.trim() === '' || !saleStatus) return true;
    if (purchaseMutation.isPending) return true;
    if (salePhase === 'before' || salePhase === 'ended') return true;
    if (saleStatus.remainingStock <= 0) return true;
    if (userPurchase?.purchased) return true;
    return false;
  };

  // Get button text based on state
  const getButtonText = (): string => {
    if (purchaseMutation.isPending) return 'Processing...';
    if (salePhase === 'before') return 'Sale Not Started';
    if (salePhase === 'ended') return 'Sale Ended';
    if (!saleStatus) return 'Loading...';
    if (saleStatus.remainingStock <= 0) return 'SOLD OUT';
    if (userPurchase?.purchased) return 'Already Purchased';
    return 'Buy Now';
  };

  // Get button color based on state
  const getButtonColor = (): string => {
    if (isPurchaseDisabled()) return 'bg-gray-400 cursor-not-allowed';
    return 'bg-blue-600 hover:bg-blue-700';
  };

  // Compile error message
  const error = inputError || saleError?.message || purchaseMutation.error?.message || null;

  // Render result feedback
  const renderResultFeedback = () => {
    if (error) {
      return (
        <div className="p-4 rounded-lg bg-red-50 border border-red-200">
          <div className="flex items-center gap-2">
            <span className="text-2xl">❌</span>
            <div>
              <p className="font-semibold text-red-800">Error</p>
              <p className="text-red-600">{error}</p>
            </div>
          </div>
        </div>
      );
    }

    if (purchaseResult) {
      switch (purchaseResult.status) {
        case 'SUCCESS':
          return (
            <div className="p-4 rounded-lg bg-green-50 border border-green-200">
              <div className="flex items-center gap-2">
                <span className="text-2xl">✅</span>
                <div>
                  <p className="font-semibold text-green-800">Purchase Successful!</p>
                  <p className="text-green-600">{purchaseResult.message}</p>
                  {userPurchase?.orderId && (
                    <p className="text-sm text-green-700 mt-1">
                      Order ID: <span className="font-mono">{userPurchase.orderId}</span>
                    </p>
                  )}
                </div>
              </div>
            </div>
          );

        case 'ALREADY_PURCHASED':
          return (
            <div className="p-4 rounded-lg bg-yellow-50 border border-yellow-200">
              <div className="flex items-center gap-2">
                <span className="text-2xl">⚠️</span>
                <div>
                  <p className="font-semibold text-yellow-800">Already Purchased</p>
                  <p className="text-yellow-600">{purchaseResult.message}</p>
                  {userPurchase?.orderId && (
                    <p className="text-sm text-yellow-700 mt-1">
                      Order ID: <span className="font-mono">{userPurchase.orderId}</span>
                    </p>
                  )}
                </div>
              </div>
            </div>
          );

        case 'SOLD_OUT':
          return (
            <div className="p-4 rounded-lg bg-red-50 border border-red-200">
              <div className="flex items-center gap-2">
                <span className="text-2xl">❌</span>
                <div>
                  <p className="font-semibold text-red-800">Sold Out</p>
                  <p className="text-red-600">{purchaseResult.message}</p>
                </div>
              </div>
            </div>
          );

        case 'SALE_NOT_ACTIVE':
          return (
            <div className="p-4 rounded-lg bg-orange-50 border border-orange-200">
              <div className="flex items-center gap-2">
                <span className="text-2xl">⏰</span>
                <div>
                  <p className="font-semibold text-orange-800">Sale Not Active</p>
                  <p className="text-orange-600">{purchaseResult.message}</p>
                </div>
              </div>
            </div>
          );

        default:
          return null;
      }
    }

    return null;
  };

  if (saleLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading sale information...</p>
        </div>
      </div>
    );
  }

  if (!saleStatus) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600">Sale not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">{saleStatus.name}</h1>
          <p className="text-sm text-gray-500">Sale ID: {saleStatus.saleId}</p>
        </div>

        {/* Countdown Timer */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="text-center">
            <p className="text-sm text-gray-600 mb-2">
              {salePhase === 'before' && 'Starts in:'}
              {salePhase === 'active' && 'Ends in:'}
              {salePhase === 'ended' && 'Status:'}
            </p>
            <p
              className={`text-4xl font-bold ${
                salePhase === 'active'
                  ? 'text-green-600'
                  : salePhase === 'before'
                  ? 'text-blue-600'
                  : 'text-red-600'
              }`}
            >
              {timeRemaining}
            </p>
            {salePhase === 'active' && (
              <p className="text-sm text-green-600 mt-2 font-semibold">🔴 LIVE NOW</p>
            )}
          </div>
        </div>

        {/* Stock Display */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm text-gray-600">Remaining Stock</p>
              <p
                className={`text-3xl font-bold ${
                  saleStatus.remainingStock > 10
                    ? 'text-green-600'
                    : saleStatus.remainingStock > 0
                    ? 'text-yellow-600'
                    : 'text-red-600'
                }`}
              >
                {saleStatus.remainingStock > 0
                  ? `${saleStatus.remainingStock} items`
                  : 'SOLD OUT'}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-600">Total Sold</p>
              <p className="text-3xl font-bold text-gray-900">{saleStatus.totalSold}</p>
            </div>
          </div>
        </div>

        {/* Purchase Section */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Make a Purchase</h2>

          {/* User ID Input */}
          <div className="mb-4">
            <label htmlFor="userId" className="block text-sm font-medium text-gray-700 mb-2">
              User ID
            </label>
            <input
              type="text"
              id="userId"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="Enter your user ID"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-gray-900"
              disabled={purchaseMutation.isPending}
            />
          </div>

          {/* Buy Button */}
          <button
            onClick={handlePurchase}
            disabled={isPurchaseDisabled()}
            className={`w-full py-3 px-6 rounded-lg text-white font-semibold transition-colors ${getButtonColor()}`}
          >
            {getButtonText()}
          </button>

          {/* User Purchase Status */}
          {userPurchase?.purchased && (
            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-800">
                ✓ You have already purchased from this sale
              </p>
              {userPurchase.orderId && (
                <p className="text-xs text-blue-600 mt-1">
                  Order ID: <span className="font-mono">{userPurchase.orderId}</span>
                </p>
              )}
            </div>
          )}
        </div>

        {/* Result Feedback */}
        {renderResultFeedback()}

        {/* Sale Details */}
        <div className="bg-white rounded-lg shadow-md p-6 mt-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Sale Details</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Start Time:</span>
              <span className="text-gray-900 font-medium">
                {new Date(saleStatus.startsAt).toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">End Time:</span>
              <span className="text-gray-900 font-medium">
                {new Date(saleStatus.endsAt).toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Status:</span>
              <span
                className={`font-medium ${
                  saleStatus.saleActive ? 'text-green-600' : 'text-red-600'
                }`}
              >
                {saleStatus.status}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
