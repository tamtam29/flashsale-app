# Flash Sale API Service

The main API service for the high-throughput flash sale system, built with NestJS and TypeScript.

## Overview

This service handles HTTP requests from clients and coordinates the flash sale purchase flow. It uses Redis for atomic purchase validation, RabbitMQ for async order processing, and PostgreSQL for persistent storage.

**Key Responsibilities:**
- Process purchase requests with sub-100ms latency
- Validate sale time windows and stock availability
- Execute atomic operations in Redis using Lua scripts
- Publish purchase events to message queue
- Manage sale status and user purchase history
- Provide health check and monitoring endpoints

## Folder Structure

```
flashsale-api/
├── prisma/
│   ├── schema.prisma                     # Database schema definition
│   ├── seed.ts                           # Database seeding script
│   └── migrations/                       # Database migration files
│       ├── migration_lock.toml
│       └── 20260222193201_initial_database/
│           └── migration.sql
├── src/
│   ├── main.ts                           # Application entry point
│   ├── app.module.ts                     # Root module
│   ├── app.controller.ts                 # Root controller
│   ├── app.service.ts                    # Root service
│   │
│   ├── common/                           # Shared utilities
│   │   └── guards/
│   │       └── user-rate-limit.guard.ts  # Rate limiting guard
│   │
│   └── modules/                          # Feature modules
│       │
│       ├── audit/                        # Audit logging module
│       │   ├── audit.module.ts
│       │   ├── audit.service.ts          # Batch audit logging
│       │   ├── audit.types.ts            # Audit event types
│       │   └── index.ts
│       │
│       ├── database/                     # Database module
│       │   ├── database.module.ts
│       │   ├── prisma.service.ts         # Prisma client service
│       │   └── index.ts
│       │
│       ├── health/                       # Health check module
│       │   ├── health.module.ts
│       │   ├── health.controller.ts      # /health endpoint
│       │   └── health.service.ts
│       │
│       ├── queue/                        # RabbitMQ module
│       │   ├── queue.module.ts
│       │   └── queue.service.ts          # Message publishing
│       │
│       ├── redis/                        # Redis module
│       │   ├── redis.module.ts
│       │   ├── redis.service.ts          # Redis client & Lua scripts
│       │   └── script/
│       │       └── purchase.lua          # Atomic purchase logic
│       │
│       └── sale/                         # Sale module (core business logic)
│           ├── sale.module.ts
│           ├── sale.controller.ts        # REST API endpoints
│           ├── sale.service.ts           # Business logic
│           ├── sale.controller.spec.ts   # Controller tests
│           ├── sale.service.spec.ts      # Service tests
│           ├── index.ts
│           └── dto/                      # Data transfer objects
│               ├── purchase.dto.ts
│               ├── sale-status.dto.ts
│               └── user-purchase.dto.ts
│
├── test/
│   ├── app.e2e-spec.ts                   # End-to-end tests
│   └── jest-e2e.json                     # E2E test configuration
│
├── Dockerfile                            # Container image definition
├── package.json                          # Dependencies and scripts
├── tsconfig.json                         # TypeScript configuration
├── tsconfig.build.json                   # Build-specific TS config
├── nest-cli.json                         # NestJS CLI configuration
└── eslint.config.mjs                     # ESLint configuration
```

## Technology Stack

- **Framework**: NestJS 11
- **Runtime**: Node.js 20
- **Language**: TypeScript 5
- **Database**: PostgreSQL 15 (Prisma ORM)
- **Cache**: Redis 7 (with Lua scripting)
- **Queue**: RabbitMQ 3.12
- **Testing**: Jest 30

## API Endpoints

### Sales Management
- `GET /api/v1/sales` - List all sales
- `GET /api/v1/sale/:saleId/status` - Get sale status and stock
- `GET /api/v1/sale/:saleId/user/:userId/purchase` - Check if user purchased

### Purchase Flow
- `POST /api/v1/sale/purchase` - Attempt to purchase (main endpoint)

### Admin/Testing
- `POST /api/v1/admin/reset` - Reset sale data (testing only)

### Health
- `GET /health` - Health check endpoint

## Environment Variables

```env
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://user:password@localhost:5432/flashsale?connection_limit=50&pool_timeout=20
REDIS_HOST=localhost
REDIS_PORT=6379
RABBITMQ_URL=amqp://user:password@localhost:5672
```

## Getting Started

### Install Dependencies

```bash
npm install
```

### Database Setup

```bash
# Generate Prisma Client
npm run prisma:generate

# Run migrations
npm run prisma:migrate

# Seed database with sample sales
npm run prisma:seed
```

### Run the Application

```bash
# Development mode (with hot reload)
npm run start:dev

# Production mode
npm run build
npm run start:prod
```

The API will be available at `http://localhost:3000`

## Running Tests

```bash
# Unit tests
npm run test

# Unit tests with coverage
npm run test:cov

# Watch mode (for development)
npm run test:watch

# E2E tests
npm run test:e2e
```

**Test Coverage:**
- `sale.service.spec.ts`: 26 tests covering business logic, caching, and reconciliation
- `sale.controller.spec.ts`: 23 tests covering REST endpoints and validation
- Additional tests for audit service and other modules

## Key Features

### 1. Atomic Purchase Logic
Uses Redis Lua scripts to ensure atomic operations:
- Check if user already purchased
- Validate stock availability
- Decrement stock counter
- Add user to purchased set

All in a single atomic operation to prevent race conditions.

### 2. Asynchronous Order Processing
- Purchase requests return immediately after Redis validation
- Order persistence happens asynchronously via RabbitMQ
- Database failures don't block user experience

### 3. Multi-Layer Caching
- **In-memory**: Sale objects cached for 1 minute
- **Redis**: Stock counters and user sets (persistent)
- **Database**: Source of truth

### 4. Startup Reconciliation
On startup, the service reconciles Redis state with the database to handle crashes or restarts gracefully.

### 5. Batch Audit Logging
Audit events are queued in memory and flushed to database in batches (every 1 second or 100 events) to reduce database load.

## Available Scripts

```bash
# Development
npm run start:dev          # Start with hot reload

# Build
npm run build              # Compile TypeScript

# Production
npm run start:prod         # Run production build

# Prisma
npm run prisma:generate    # Generate Prisma Client
npm run prisma:migrate     # Run migrations
npm run prisma:seed        # Seed database
npm run prisma:studio      # Open Prisma Studio

# Testing
npm run test               # Run unit tests
npm run test:cov           # Run with coverage
npm run test:e2e           # Run E2E tests

# Code Quality
npm run lint               # Run ESLint
npm run format             # Format code with Prettier
```

## Docker Usage

```bash
# Build image
docker build -t flashsale-api .

# Run container
docker run -p 3000:3000 \
  -e DATABASE_URL=postgresql://... \
  -e REDIS_HOST=redis \
  -e RABBITMQ_URL=amqp://... \
  flashsale-api
```

## Architecture Notes

This API service follows NestJS best practices:
- **Module-based architecture** for separation of concerns
- **Dependency injection** for testability
- **Guards** for rate limiting and authentication
- **DTOs** for request/response validation
- **Service layer** for business logic
- **Repository pattern** via Prisma

The purchase flow is optimized for:
- **High throughput** (2000+ req/s)
- **Low latency** (p95 < 100ms)
- **No overselling** (atomic Redis operations)
- **No duplicates** (user validation in Redis + DB constraints)

## Related Services

- **flashsale-worker**: Consumes messages from RabbitMQ and persists orders to database
- **flashsale-frontend**: Next.js web interface for users
