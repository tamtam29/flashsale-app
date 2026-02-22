'use client';

import { useAllSales } from '@/hooks/useSale';
import { SaleStatus } from '@/types/sale';
import Link from 'next/link';

export default function Home() {
  const { data: sales, isLoading, error } = useAllSales();

  const getSaleCardStyle = (sale: SaleStatus) => {
    if (sale.saleActive) {
      // Active sale - vibrant green gradient
      return 'from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700';
    } else if (new Date(sale.startsAt) > new Date()) {
      // Future sale - blue/purple gradient
      return 'from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700';
    } else {
      // Past/ended sale - gray gradient
      return 'from-gray-400 to-gray-500 hover:from-gray-500 hover:to-gray-600';
    }
  };

  const getSaleStatusBadge = (sale: SaleStatus) => {
    if (sale.saleActive) {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
          🔴 LIVE NOW
        </span>
      );
    } else if (new Date(sale.startsAt) > new Date()) {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
          ⏰ UPCOMING
        </span>
      );
    } else {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
          ⏹️ ENDED
        </span>
      );
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <main className="container mx-auto px-4 py-16 max-w-4xl">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-gray-900 mb-4">
            ⚡ Flash Sale System
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            High-performance flash sale platform with real-time stock tracking and concurrent purchase handling
          </p>
        </div>

        {/* Quick Links to Sales */}
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-6">Active Sales</h2>
          
          {isLoading && (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
              <p className="mt-4 text-gray-600">Loading sales...</p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
              <p className="font-semibold">Error loading sales</p>
              <p className="text-sm mt-1">{error instanceof Error ? error.message : 'Unknown error'}</p>
            </div>
          )}

          {sales && sales.length > 0 && (
            <div className="grid gap-4 md:grid-cols-3">
              {sales.map((sale) => (
                <Link
                  key={sale.saleId}
                  href={`/sale/${sale.saleId}`}
                  className={`block p-6 bg-gradient-to-br ${getSaleCardStyle(sale)} rounded-lg shadow-md hover:shadow-xl transition-all transform hover:-translate-y-1`}
                >
                  <div className="text-white">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium opacity-90">Flash Sale</p>
                      {getSaleStatusBadge(sale)}
                    </div>
                    <p className="text-2xl font-bold mb-1">{sale.name}</p>
                    <p className="text-sm opacity-90 mb-3">{sale.saleId}</p>
                    
                    {sale.saleActive && (
                      <div className="bg-white/20 rounded px-2 py-1 mb-3">
                        <p className="text-xs font-semibold">
                          Stock: {sale.remainingStock} / {sale.remainingStock + sale.totalSold}
                        </p>
                      </div>
                    )}
                    
                    <div className="flex items-center justify-between">
                      <span className="text-sm opacity-90">
                        {sale.saleActive ? 'Buy Now →' : 'View Details →'}
                      </span>
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-gray-600 text-sm">
          <p>Built for high-concurrency scenarios • Enterprise-ready architecture</p>
        </div>
      </main>
    </div>
  );
}
