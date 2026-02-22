# Flash Sale Frontend

The web interface for the high-throughput flash sale system, built with Next.js 15 and React 19.

## Overview

This is a modern, responsive web application that allows users to browse available flash sales and make instant purchases. It features real-time stock updates, optimistic UI patterns, and automatic data revalidation.

**Key Features:**
- Browse all available sales with live status
- View detailed sale information and remaining stock
- One-click purchase with instant feedback
- Automatic retries and error handling
- Real-time data synchronization with SWR
- Responsive design with Tailwind CSS

## Folder Structure

```
flashsale-frontend/
├── public/                      # Static assets
│   ├── file.svg
│   ├── globe.svg
│   ├── next.svg
│   ├── vercel.svg
│   └── window.svg
│
├── src/
│   ├── app/                     # Next.js App Router
│   │   ├── layout.tsx           # Root layout with providers
│   │   ├── page.tsx             # Home page (sales list)
│   │   ├── globals.css          # Global styles
│   │   ├── favicon.ico
│   │   └── sale/
│   │       └── [saleId]/
│   │           └── page.tsx     # Sale detail page (purchase UI)
│   │
│   ├── hooks/
│   │   └── useSale.ts           # Custom hook for sale data fetching
│   │
│   ├── lib/
│   │   ├── api.ts               # API client functions
│   │   └── providers.tsx        # SWR configuration provider
│   │
│   └── types/
│       └── sale.ts              # TypeScript type definitions
│
├── Dockerfile                   # Container image definition
├── package.json                 # Dependencies and scripts
├── tsconfig.json               # TypeScript configuration
├── next.config.ts              # Next.js configuration
├── postcss.config.mjs          # PostCSS configuration
├── eslint.config.mjs           # ESLint configuration
└── .gitignore                  # Git ignore rules
```

## Technology Stack

- **Framework**: Next.js 15 (App Router)
- **Runtime**: Node.js 20
- **Language**: TypeScript 5
- **UI Library**: React 19
- **Styling**: Tailwind CSS 3
- **Data Fetching**: TanStack Query (React Query) v5
- **HTTP Client**: Native fetch API

## Environment Variables

Create a `.env.local` file in the root directory:

```env
NEXT_PUBLIC_API_URL=http://localhost:3000
```

## Getting Started

### Install Dependencies

```bash
npm install
```

### Run Development Server

```bash
npm run dev
```

Open [http://localhost:3001](http://localhost:3001) in your browser.

**Note**: The app expects the API to be running on port 3000.

### Build for Production

```bash
# Create optimized production build
npm run build

# Start production server
npm start
```

## User Flow

### 1. Sales List Page (`/`)
- Displays all available sales
- Shows sale status (ACTIVE, UPCOMING, ENDED)
- Displays remaining stock and total sold
- Click on a sale to view details

### 2. Sale Detail Page (`/sale/[saleId]`)
- Shows sale name and description
- Displays remaining stock in real-time
- Input field for user ID
- "Buy Now" button (disabled if sold out or inactive)
- Real-time status updates every 5 seconds

### 3. Purchase Flow
1. User enters their ID
2. Clicks "Buy Now"
3. Instant feedback:
   - ✅ Success: Green alert with confirmation
   - ❌ Sold Out: Red alert
   - ⚠️ Already Purchased: Yellow alert
   - 🔄 Loading: Button shows spinner

## Key Features Explained

### TanStack Query (React Query) Data Fetching
Uses `useQuery` and `useMutation` for intelligent data fetching:
- Automatic revalidation on focus and interval
- Optimistic UI updates
- Built-in caching and deduplication
- Error retry logic with exponential backoff
- Query invalidation after mutations

**Example**:
```typescript
// Automatic refetch every 3 seconds for real-time stock updates
const { data, isLoading } = useQuery({
  queryKey: ['sale', saleId],
  queryFn: () => getSaleStatus(saleId),
  refetchInterval: 3000,
  staleTime: 1000,
});
```

### Real-time Updates
- Sale list refreshes when window regains focus
- Detail page polls every 5 seconds for stock updates
- Purchase button reflects current availability

### Error Handling
- Network errors show user-friendly messages
- Failed purchases can be retried
- API errors display specific feedback

### Responsive Design
- Mobile-first approach
- Tailwind CSS utility classes
- Responsive grid layout
- Touch-friendly buttons

## API Integration

The frontend communicates with the backend API:

### Endpoints Used
- `GET /api/v1/sales` - Fetch all sales
- `GET /api/v1/sale/:saleId/status` - Get sale details
- `POST /api/v1/sale/purchase` - Attempt purchase

### Example API Call

```typescript
import { apiClient } from '@/lib/api';

// Fetch all sales
const sales = await apiClient.getAllSales();

// Attempt purchase
const result = await apiClient.attemptPurchase({
  saleId: 'sale_1',
  userId: 'user123'
});
```

## Available Scripts

```bash
# Development
npm run dev              # Start development server (port 3001)

# Production
npm run build           # Create optimized build
npm start               # Start production server

# Code Quality
npm run lint            # Run ESLint
```

## Docker Usage

```bash
# Build image
docker build -t flashsale-frontend .

# Run container
docker run -p 3001:3000 \
  -e NEXT_PUBLIC_API_URL=http://localhost:3000 \
  flashsale-frontend
```

**Note**: Inside Docker, the app runs on port 3000 but is mapped to 3001 on the host.

## Development Tips

### Hot Reload
- Changes to React components reload instantly
- API changes require restarting the dev server
- CSS changes update without refresh

### Debugging
- Use React DevTools browser extension
- Check browser console for errors
- Network tab shows API requests

### Adding New Features

**To add a new page:**
```bash
# Create a new route
touch src/app/my-page/page.tsx
```

**To add a new API function:**
```typescript
// In src/lib/api.ts
export const apiClient = {
  // ... existing methods
  newMethod: async () => {
    const res = await fetch(`${API_URL}/new-endpoint`);
    return res.json();
  }
};
```

## Architecture Notes

This frontend follows Next.js 15 best practices:
- **App Router** for file-based routing
- **Server Components** by default (with Client Components where needed)
- **TypeScript** for type safety
- **SWR** for smart data synchronization
- **Tailwind CSS** for utility-first styling

The app is optimized for:
- **Performance** (automatic code splitting, image optimization)
- **SEO** (server-side rendering, metadata)
- **UX** (instant feedback, loading states, error boundaries)
- **Accessibility** (semantic HTML, ARIA labels)

## Related Services

- **flashsale-api**: Backend REST API service
- **flashsale-worker**: Background job processor
