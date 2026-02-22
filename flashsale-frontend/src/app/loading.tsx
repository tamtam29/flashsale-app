export default function Loading() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <main className="container mx-auto px-4 py-16 max-w-4xl">
        {/* Header Skeleton */}
        <div className="text-center mb-12">
          <div className="h-12 bg-gray-200 rounded-lg w-3/4 mx-auto mb-4 animate-pulse"></div>
          <div className="h-6 bg-gray-200 rounded-lg w-2/3 mx-auto animate-pulse"></div>
        </div>

        {/* Content Skeleton */}
        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="h-8 bg-gray-200 rounded w-1/3 mb-6 animate-pulse"></div>
          
          {/* Sales Grid Skeleton */}
          <div className="grid gap-4 md:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="p-6 bg-gradient-to-br from-gray-200 to-gray-300 rounded-lg shadow-md animate-pulse"
              >
                <div className="space-y-3">
                  {/* Badge Skeleton */}
                  <div className="flex items-center justify-between">
                    <div className="h-4 bg-gray-300 rounded w-20"></div>
                    <div className="h-5 bg-gray-300 rounded-full w-16"></div>
                  </div>
                  
                  {/* Title Skeleton */}
                  <div className="h-8 bg-gray-300 rounded w-3/4"></div>
                  
                  {/* ID Skeleton */}
                  <div className="h-4 bg-gray-300 rounded w-1/2"></div>
                  
                  {/* Stock Skeleton */}
                  <div className="bg-white/30 rounded px-2 py-1">
                    <div className="h-3 bg-gray-300 rounded w-24"></div>
                  </div>
                  
                  {/* Button Skeleton */}
                  <div className="flex items-center justify-between pt-2">
                    <div className="h-4 bg-gray-300 rounded w-20"></div>
                    <div className="h-5 w-5 bg-gray-300 rounded"></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Loading Status Text */}
        <div className="text-center mt-8" role="status" aria-live="polite">
          <p className="text-gray-600">Loading flash sales...</p>
          <span className="sr-only">Loading flash sales, please wait</span>
        </div>
      </main>
    </div>
  );
}
