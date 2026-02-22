export default function Loading() {
  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
        {/* Header Skeleton */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6 animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-2/3 mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-1/3"></div>
        </div>

        {/* Countdown Timer Skeleton */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6 animate-pulse">
          <div className="text-center">
            <div className="h-4 bg-gray-200 rounded w-24 mx-auto mb-2"></div>
            <div className="h-12 bg-gray-200 rounded w-48 mx-auto mb-2"></div>
            <div className="h-4 bg-gray-200 rounded w-32 mx-auto"></div>
          </div>
        </div>

        {/* Stock Display Skeleton */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6 animate-pulse">
          <div className="flex justify-between items-center">
            <div className="flex-1">
              <div className="h-4 bg-gray-200 rounded w-32 mb-2"></div>
              <div className="h-10 bg-gray-200 rounded w-40"></div>
            </div>
            <div className="flex-1 text-right">
              <div className="h-4 bg-gray-200 rounded w-24 mb-2 ml-auto"></div>
              <div className="h-10 bg-gray-200 rounded w-32 ml-auto"></div>
            </div>
          </div>

          {/* Progress Bar Skeleton */}
          <div className="mt-4">
            <div className="flex justify-between text-xs mb-1">
              <div className="h-3 bg-gray-200 rounded w-16"></div>
              <div className="h-3 bg-gray-200 rounded w-20"></div>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2"></div>
          </div>
        </div>

        {/* Sale Details Skeleton */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6 animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-32 mb-4"></div>
          <div className="space-y-3">
            <div className="flex justify-between">
              <div className="h-4 bg-gray-200 rounded w-24"></div>
              <div className="h-4 bg-gray-200 rounded w-32"></div>
            </div>
            <div className="flex justify-between">
              <div className="h-4 bg-gray-200 rounded w-24"></div>
              <div className="h-4 bg-gray-200 rounded w-32"></div>
            </div>
            <div className="flex justify-between">
              <div className="h-4 bg-gray-200 rounded w-24"></div>
              <div className="h-4 bg-gray-200 rounded w-32"></div>
            </div>
          </div>
        </div>

        {/* Purchase Section Skeleton */}
        <div className="bg-white rounded-lg shadow-md p-6 animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-40 mb-4"></div>
          <div className="space-y-4">
            {/* Input Skeleton */}
            <div>
              <div className="h-4 bg-gray-200 rounded w-20 mb-2"></div>
              <div className="h-12 bg-gray-200 rounded w-full"></div>
            </div>
            {/* Button Skeleton */}
            <div className="h-12 bg-gray-200 rounded w-full"></div>
            {/* Help Text Skeleton */}
            <div className="h-3 bg-gray-200 rounded w-3/4 mx-auto"></div>
          </div>
        </div>

        {/* Loading Status Text */}
        <div className="text-center mt-8" role="status" aria-live="polite">
          <p className="text-gray-600">Loading sale information...</p>
          <span className="sr-only">Loading sale details, please wait</span>
        </div>
      </div>
    </div>
  );
}
