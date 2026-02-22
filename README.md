# Flash Sale System

A scalable, high-performance flash sale platform built with Node.js, designed to handle thousands of concurrent purchase requests with strict inventory control and fairness guarantees.

## 📋 Table of Contents

- [System Overview](#-system-overview)
- [Technology Stack](#️-technology-stack)
- [Architecture & Design Choices](#️-architecture--design-choices)
- [System Diagram](#-system-diagram)
- [Getting Started](#-getting-started)
- [Running Tests](#-running-tests)
- [Stress Testing](#-stress-testing)
- [API Documentation](#-api-documentation)

## 🎯 System Overview

This system implements a high-throughput flash sale platform with the following features:

- **Time-bound Sales**: Configurable start and end times for flash sales
- **Limited Inventory**: Accurate stock management preventing overselling
- **One Purchase Per User**: Enforced at multiple layers (Redis, Database)
- **High Concurrency**: Handles 2000+ requests/second with sub-500ms latency
- **Async Processing**: Non-blocking order confirmation via message queue
- **Audit Trail**: Complete event tracking for debugging and analytics

## 🛠️ Technology Stack

### Backend (API & Worker)
- **Framework**: NestJS 11 (Node.js 20)
- **Language**: TypeScript 5
- **Database**: PostgreSQL 15 (with connection pooling)
- **ORM**: Prisma 6
- **Cache**: Redis 7 (with Lua scripting)
- **Queue**: RabbitMQ 3.12 (with management UI)
- **Testing**: Jest 30 (with coverage reporting)

### Frontend
- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript 5
- **UI Library**: React 19
- **Styling**: Tailwind CSS 3
- **Data Fetching**: SWR (stale-while-revalidate)

### Infrastructure
- **Container**: Docker & Docker Compose
- **Database Admin**: Adminer (web-based)
- **Stress Testing**: k6

## 🏗️ Architecture & Design Choices

### Core Design Principles

#### 1. Redis For Purchase Logic **
   
**Decision**: Use Redis with scripts for purchase attempts.

**Rationale**: 
- The scripts execute atomically in Redis, eliminating race conditions
- Single Redis operation for stock check + user validation + inventory decrement
- Sub-millisecond latency for purchase decisions
- Prevents overselling without database locks

**Implementation**: See [purchase.lua](flashsale-api/src/modules/redis/script/purchase.lua)

```lua
-- Atomic operations in single Redis transaction:
1. Check if user already purchased (Redis SET)
2. Check remaining stock (Redis counter)
3. Decrement stock if available
4. Add user to purchased set
5. Return result code (1=SUCCESS, 0=SOLD_OUT, 2=DUPLICATE)
```

#### 2. **Event-Driven Architecture with RabbitMQ**

**Decision**: Separate purchase reservation (fast path) from order persistence (slow path).

**Rationale**:
- API responds in <100ms while database writes happen asynchronously
- Database failures don't block user experience
- Worker can retry failed confirmations
- Scales horizontally (multiple worker instances)

**Flow**:
```
User Request → Redis (reserve) → Queue → Worker (persist) → Database
     ↓
  Response (immediate)
```

#### 3. **Idempotent Order Processing**

**Decision**: Workers handle duplicate messages gracefully using database constraints.

**Rationale**:
- RabbitMQ provides at-least-once delivery semantics
- Duplicate processing is possible (restarts, network issues)
- Database UNIQUE constraint on (sale_id, user_id) prevents double orders
- Workers catch Prisma P2002 error and treat as success

**Implementation**: [orders.service.ts](flashsale-worker/src/modules/orders/orders.service.ts#L46-L58)

#### 4. **Batch Audit Logging**

**Decision**: Queue audit events in memory and flush in batches to database.

**Rationale**:
- Reduces database write operations by 100x
- Does not block critical purchase path
- 1-second flush interval ensures near real-time visibility
- Automatic flush on shutdown prevents data loss

**Configuration**:
- Max batch size: 100 events
- Flush interval: 1 second
- Non-blocking: Errors logged but don't fail purchases

#### 5. **Multi-Layer Caching**

**Decision**: Cache sale data at multiple levels.

**Layers**:
1. **Application Cache**: In-memory sale objects (1-minute TTL)
2. **Redis**: Stock counters and user purchase sets (persistent)
3. **Database**: Source of truth, reconciled on startup

**Rationale**:
- Reduces database load by ~95%
- Maintains consistency via cache invalidation
- Reconciliation on startup handles crashes/restarts

#### 6. **Three-Worker Deployment**

**Decision**: Deploy 3 worker instances via Docker Compose.

**Rationale**:
- Parallel processing of queue messages
- Built-in redundancy (one worker crash doesn't stop processing)
- Matches typical cloud deployment patterns
- Balances throughput vs resource usage

## 🎨 System Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                          CLIENT LAYER                               │
│  ┌──────────────────┐               ┌─────────────────────────┐     │
│  │  Next.js Frontend│               │  Load Testing (k6)      │     │
│  │  (React)         │               │  2000 req/s             │     │
│  └────────┬─────────┘               └───────────┬─────────────┘     │
│           │                                     │                   │
└───────────┼─────────────────────────────────────┼───────────────────┘
            │                                     │
            │ HTTP/REST                           │ HTTP
            ▼                                     ▼
┌────────────────────────────────────────────────────────────────────┐
│                        API LAYER (NestJS)                          │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  SaleController                                             │   │
│  │  - GET  /api/v1/sales                (list all sales)       │   │
│  │  - POST /api/v1/sale/purchase        (attempt purchase)     │   │
│  │  - GET  /api/v1/sale/:id/status      (check status)         │   │
│  │  - GET  /api/v1/sale/:id/user/:uid   (check user purchase)  │   │
│  │  - POST /api/v1/admin/reset          (reset sale - testing) │   │
│  └─────────────────────────────┬───────────────────────────────┘   │
│                                │                                   │
│  ┌─────────────────────────────▼─────────────────────────────┐     │
│  │  SaleService                                              │     │
│  │  - Validate time window                                   │     │
│  │  - Cache sale objects (1min TTL)                          │     │
│  │  - Coordinate purchase flow                               │     │
│  └───┬─────────────┬──────────────┬────────────────┬─────────┘     │
│      │             │              │                │               │
└──────┼─────────────┼──────────────┼────────────────┼───────────────┘
       │             │              │                │
       │             │              │                │
   ┌───▼────┐   ┌────▼─────┐   ┌────▼─────┐   ┌──────▼────┐
   │ Redis  │   │ RabbitMQ │   │PostgreSQL│   │  Audit    │
   │ Service│   │ Publisher│   │  (Prisma)│   │  Service  │
   └───┬────┘   └────┬─────┘   └─────┬────┘   └──────┬────┘
       │             │               │               │
       │             │               │               │
┌──────▼─────────────▼───────────────▼───────────────▼───────────────┐
│                      DATA LAYER                                    │
│  ┌──────────────┐  ┌─────────────┐  ┌────────────────────────┐     │
│  │   Redis      │  │  RabbitMQ   │  │   PostgreSQL.          │     │
│  │              │  │             │  │                        │     │
│  │ • Stock      │  │ • purchase  │  │ Tables:                │     │
│  │   counters   │  │   queue     │  │  - sales               │     │
│  │ • User sets  │  │             │  │  - orders              │     │
│  │ • Lua script │  │ 3 workers   │  │  - order_audit_trail   │     │ 
│  └──────────────┘  └──────┬──────┘  └────────────────────────┘     │
│                           │                                        │
└───────────────────────────┼────────────────────────────────────────┘
                            │ consume
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    WORKER LAYER (NestJS)                            │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  QueueConsumer (3 replicas)                                  │   │
│  │  - Consumes purchase events from RabbitMQ                    │   │
│  │  - Processes messages in parallel                            │   │
│  └────────────────────────┬─────────────────────────────────────┘   │
│                           │                                         │
│  ┌────────────────────────▼────────────────────────────────────┐    │
│  │  OrdersService                                              │    │
│  │  - Persist order to database                                │    │
│  │  - Idempotent (handles duplicate messages)                  │    │
│  │  - Logs to audit trail                                      │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘

DATA FLOW - PURCHASE REQUEST:
════════════════════════════════════════════════════════════════════════

1. User clicks "Buy Now" → Frontend sends POST request
                                                    
2. API validates sale time window ────────────┐      
                                              │      
3. API executes Lua script in Redis ◄─────────┘      
   ┌─────────────────────────────────┐             
   │ ATOMIC REDIS OPERATIONS:        │             
   │ 1. Check user not in set        │             
   │ 2. Check stock > 0              │             
   │ 3. Decrement stock              │             
   │ 4. Add user to set              │             
   │ 5. Return result (1/0/2)        │             
   └─────────────────────────────────┘             
                                                    
4. API publishes to RabbitMQ ────────────────┐      
                                             │      
5. API returns response to user ◄────────────┘      
   (total time: ~50-100ms)                          
                                                    
6. Worker consumes message ──────────────────┐      
                                             │      
7. Worker writes to PostgreSQL ◄─────────────┘      
   - Order record (CONFIRMED)                       
   - Audit trail entry                              
   (happens asynchronously)                         

REDIS DATA STRUCTURES:
════════════════════════════════════════════════════════════════
Key Pattern                    Type    Purpose
────────────────────────────────────────────────────────────────
sale:{saleId}:stock           String  Remaining inventory count
sale:{saleId}:users           Set     User IDs who purchased
```


## 🚀 Getting Started

### Prerequisites

- **Docker Desktop** (or Docker + Docker Compose)
- **Node.js 20+** (for local development only)
- **macOS, Linux, or Windows with WSL2**

### Installation & Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd bookipi
   ```

2. **Start all services with Docker Compose**
   ```bash
   docker-compose up -d
   ```

   This command will:
   - Start PostgreSQL on port 5432
   - Start Redis on port 6379
   - Start RabbitMQ on ports 5672 (AMQP) and 15672 (UI)
   - Start API service on port 3000
   - Start 3 worker instances
   - Start frontend on port 3001

3. **Run Prisma migrations and seed data** (inside the API container)
   ```bash
   docker exec flashsale-api npm run prisma:migrate
   docker exec flashsale-api npm run prisma:seed
   ```

4. **Wait for services to be healthy** (~30-60 seconds)
   ```bash
   docker-compose ps
   ```
   
   All services should show "Up" or "Up (healthy)" status.

5. **Verify the system is running**
   
   - **Frontend**: http://localhost:3001
   - **API Health**: http://localhost:3000/health
   - **Database Admin**: http://localhost:8080 (Adminer)
     - System: PostgreSQL
     - Server: db
     - Username: flashsale
     - Password: flashsale_password
     - Database: flashsale
   - **RabbitMQ Management**: http://localhost:15672
     - Username: flashsale
     - Password: flashsale_password

6. **Check initial data**
   
   The system seeds 3 sales automatically:
   - `sale_1`: Active now (100 stock)
   - `sale_2`: Starting in 10 minutes (50 stock)
   - `sale_3`: Ended 1 hour ago (200 stock)

### Using the Frontend

1. Open http://localhost:3001 in your browser
2. You'll see the list of available sales
3. Click on an active sale
4. Enter your user ID (any string, e.g., "user123")
5. Click "Buy Now"
6. Receive instant feedback:
   - ✅ **Success**: "Purchase reserved successfully"
   - ⚠️ **Already Purchased**: "You have already purchased"
   - ❌ **Sold Out**: "Sale is sold out"
   - ❌ **Inactive**: "Sale is not currently active"

### Stopping the System

```bash
# Stop all services (preserves data)
docker-compose stop

# Stop and remove containers (preserves volumes)
docker-compose down

# Stop and remove everything including data
docker-compose down -v
```

## 🧪 Running Tests

### API Service Tests

```bash
# Run all tests
cd flashsale-api
npm install
npm run test

# Run with coverage report
npm run test -- --coverage

# Watch mode (for development)
npm run test:watch
```

**Test Coverage**:
- **sale.service.spec.ts**: 26 tests - Business logic, caching, reconciliation
- **sale.controller.spec.ts**: 23 tests - All REST endpoints, validation, errors
- **audit.service.spec.ts**: 16 tests - Batch processing, timers, flush logic

**Total**: 66 tests with 96%+ coverage on core modules

### Worker Service Tests

```bash
# Run all tests
cd flashsale-worker
npm install
npm run test

# Run with coverage report
npm run test -- --coverage
```

**Test Coverage**:
- **orders.service.spec.ts**: 10 tests - Idempotent processing, error handling
- **audit.service.spec.ts**: 7 tests - Logging, fire-and-forget pattern

**Total**: 17 tests with 100% coverage on order processing logic

### Running All Tests

```bash
# From project root
cd flashsale-api && npm install && npm test && cd ..
cd flashsale-worker && npm install && npm test && cd ..
```

**Expected Output**: All 83 tests passing ✅

## 🔥 Stress Testing

The stress test simulates a realistic flash sale scenario with thousands of concurrent users.

### Prerequisites

Install k6 (load testing tool):

```bash
# macOS
brew install k6

# Linux
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6

# Windows (via Chocolatey)
choco install k6

# Or download binary from: https://k6.io/docs/getting-started/installation/
```

### Running the Stress Test

1. **Ensure system is running**
   ```bash
   docker-compose up -d
   docker-compose ps  # Verify all services are healthy
   ```

2. **Get a sale ID from the database**
   ```bash
   # Option 1: Using psql
   docker exec -it flashsale-db psql -U flashsale -d flashsale -c "SELECT id, name, total_stock FROM sales WHERE ends_at > NOW();"
   
   # Option 2: Via API
   curl http://localhost:3000/api/v1/sales
   
   # Use Limited Edition Product - Flash Sale name for testing (it has 100 stock and is active)
   ```

3. **Run the stress test**
   ```bash
   k6 run -e API_URL=http://localhost:3000 -e SALE_ID=b2cdfea1-689c-45ed-9381-aeb5d76c59ab stress-test/k6-purchase.js
   ```

### Stress Test Configuration

- **Request Rate**: 2,000 requests/second
- **Duration**: 5 seconds
- **Total Requests**: ~10,000
- **Virtual Users**: Up to 10,000 (dynamically allocated)
- **Expected Latency**: p95 < 500ms

### Expected Results

```
================================================================================
                    FLASH SALE STRESS TEST RESULTS
================================================================================

📊 REQUEST STATISTICS:
   Total Requests: 10000
   Failed Requests: 0 (0.00%)

⏱️  RESPONSE TIME:
   Average: 45.23ms
   Median (p50): 38.12ms
   p95: 124.50ms
   p99: 287.34ms
   Max: 450.23ms

🛒 PURCHASE RESULTS:
   SUCCESS: 100 (1.00%)           ← Exactly the available stock
   ALREADY_PURCHASED: 0 (0.00%)   ← No duplicates
   SOLD_OUT: 9900 (99.00%)        ← All others correctly rejected

================================================================================
```

### What the Test Proves

✅ **No Overselling**: Exactly 100 orders created (matching stock)
✅ **No Duplicate Purchases**: Each user can only buy once
✅ **High Throughput**: Handles 2000 req/s without errors
✅ **Low Latency**: 95% of requests complete in <500ms
✅ **Fairness**: First 100 valid requests succeed, rest get sold out

### Validation After Stress Testing

After running the stress test, it's critical to validate that the system maintained data integrity under load.

#### Manual SQL Queries

For detailed investigation, run individual queries:

```bash
# Connect to database
docker exec -it flashsale-db psql -U flashsale -d flashsale

# Check order count (should equal stock)
SELECT COUNT(*) as confirmed_orders 
FROM orders 
WHERE sale_id = <sale_id> AND status = 'CONFIRMED';
-- Expected: 100

# Check for duplicate users (should be 0)
SELECT user_id, COUNT(*) as purchase_count 
FROM orders 
WHERE sale_id = <sale_id>
GROUP BY user_id 
HAVING COUNT(*) > 1;
-- Expected: 0 rows

# Verify no overselling
SELECT 
    s.total_stock,
    COUNT(o.id) as total_orders,
    s.total_stock - COUNT(o.id) as remaining,
    CASE 
        WHEN COUNT(o.id) > s.total_stock THEN '❌ OVERSOLD!'
        ELSE '✅ OK'
    END as status
FROM sales s
LEFT JOIN orders o ON s.id = o.sale_id
WHERE s.id = <sale_id>
GROUP BY s.id, s.total_stock;

# Check audit trail
SELECT event_type, COUNT(*) 
FROM order_audit_trail 
WHERE sale_id = <sale_id> 
GROUP BY event_type 
ORDER BY COUNT(*) DESC;
-- Expected: ATTEMPTED (10000), RESERVED (100), REJECTED_SOLD_OUT (9900), CONFIRMED (100)

# Verify Redis consistency
# (Run in separate terminal)
docker exec flashsale-redis redis-cli GET sale:sale_1:stock
docker exec flashsale-redis redis-cli SCARD sale:sale_1:users
```

## �📚 API Documentation

### Base URL
```
http://localhost:3000/api/v1
```

### Endpoints

#### 1. Get All Sales
```http
GET /sales
```

**Response**:
```json
[
  {
    "saleId": "sale_1",
    "name": "Limited Edition Product - Flash Sale",
    "remainingStock": 100,
    "totalSold": 0,
    "saleActive": true,
    "startsAt": "2026-02-23T03:00:00.000Z",
    "endsAt": "2026-02-23T04:00:00.000Z",
    "status": "ACTIVE"
  }
]
```

#### 2. Attempt Purchase
```http
POST /sale/purchase
Content-Type: application/json

{
  "saleId": "sale_1",
  "userId": "user123"
}
```

**Success Response** (200 OK):
```json
{
  "success": true,
  "status": "SUCCESS",
  "message": "Purchase reserved successfully"
}
```

**Already Purchased** (200 OK):
```json
{
  "success": false,
  "status": "ALREADY_PURCHASED",
  "message": "You have already purchased from this sale"
}
```

**Sold Out** (200 OK):
```json
{
  "success": false,
  "status": "SOLD_OUT",
  "message": "Sale is sold out"
}
```

**Sale Inactive** (400 Bad Request):
```json
{
  "statusCode": 400,
  "message": "Sale is not currently active",
  "error": "Bad Request"
}
```

#### 3. Get Sale Status
```http
GET /sale/:saleId/status
```

**Response**:
```json
{
  "saleId": "sale_1",
  "name": "Limited Edition Product - Flash Sale",
  "remainingStock": 95,
  "totalSold": 5,
  "saleActive": true,
  "startsAt": "2026-02-23T03:00:00.000Z",
  "endsAt": "2026-02-23T04:00:00.000Z",
  "status": "ACTIVE"
}
```

#### 4. Check User Purchase
```http
GET /sale/:saleId/user/:userId/purchase
```

**Response** (Has Purchased):
```json
{
  "purchased": true,
  "orderId": "123e4567-e89b-12d3-a456-426614174000",
  "status": "CONFIRMED"
}
```

**Response** (Not Purchased):
```json
{
  "purchased": false,
  "orderId": null,
  "status": "NOT_PURCHASED"
}
```

#### 5. Reset Sale (Admin/Testing)
```http
POST /admin/reset
Content-Type: application/json

{
  "saleId": "sale_1"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Sale sale_1 has been reset"
}
```

This endpoint:
- Deletes all orders for the sale
- Resets Redis stock to original value
- Clears user purchase records
- Useful for running multiple stress tests

## 👤 Author

##### Adi Tiatama
