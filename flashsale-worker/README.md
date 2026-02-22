# Flash Sale Worker Service

The background worker service for the high-throughput flash sale system, built with NestJS and TypeScript.

## Overview

This service consumes purchase events from RabbitMQ and persists confirmed orders to the database. It operates asynchronously from the API service, ensuring database operations don't block user-facing requests.

**Key Responsibilities:**
- Consume purchase events from RabbitMQ
- Persist confirmed orders to PostgreSQL database
- Handle duplicate messages idempotently
- Log order confirmations to audit trail
- Process messages in parallel (3 worker replicas)

## Folder Structure

```
flashsale-worker/
├── prisma/
│   └── schema.prisma                   # Database schema definition
│
├── src/
│   ├── main.ts                         # Application entry point
│   ├── app.module.ts                   # Root module
│   │
│   └── modules/                        # Feature modules
│       │
│       ├── audit/                      # Audit logging module
│       │   ├── audit.module.ts
│       │   ├── audit.service.ts        # Batch audit logging
│       │   ├── audit.types.ts          # Audit event types
│       │   └── index.ts
│       │
│       ├── database/                   # Database module
│       │   ├── database.module.ts
│       │   ├── prisma.service.ts       # Prisma client service
│       │   └── index.ts
│       │
│       ├── orders/                     # Order processing module
│       │   ├── orders.module.ts
│       │   ├── orders.service.ts       # Order persistence logic
│       │   └── orders.service.spec.ts  # Service tests
│       │
│       └── queue/                      # RabbitMQ module
│           ├── queue.module.ts
│           └── queue.consumer.ts       # Message consumer
│
├── Dockerfile                          # Container image definition
├── package.json                        # Dependencies and scripts
├── tsconfig.json                       # TypeScript configuration
├── tsconfig.build.json                 # Build-specific TS config
├── nest-cli.json                       # NestJS CLI configuration
└── eslint.config.mjs                   # ESLint configuration
```

## Technology Stack

- **Framework**: NestJS 11
- **Runtime**: Node.js 20
- **Language**: TypeScript 5
- **Database**: PostgreSQL 15 (Prisma ORM)
- **Queue**: RabbitMQ 3.12
- **Testing**: Jest 30

## Environment Variables

```env
NODE_ENV=development
DATABASE_URL=postgresql://user:password@localhost:5432/flashsale?connection_limit=30&pool_timeout=20
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
```

**Note**: The worker uses the same database schema as the API service. Migrations should be run from the API service.

### Run the Application

```bash
# Development mode (with hot reload)
npm run start:dev

# Production mode
npm run build
npm run start:prod
```

The worker will start consuming messages from the `purchase` queue.

## Running Tests

```bash
# Unit tests
npm run test

# Unit tests with coverage
npm run test:cov

# Watch mode (for development)
npm run test:watch
```

**Test Coverage:**
- `orders.service.spec.ts`: 10 tests covering idempotent processing and error handling
- `audit.service.spec.ts`: 7 tests covering batch logging and fire-and-forget pattern

## Key Features

### 1. Idempotent Message Processing
The worker handles duplicate messages gracefully:
- Database UNIQUE constraint on `(sale_id, user_id)` prevents duplicate orders
- Catches Prisma `P2002` error (unique constraint violation) and treats as success
- Safe to process the same message multiple times

### 2. Automatic Message Acknowledgment
- Messages are acknowledged only after successful database write
- Failed messages are redelivered by RabbitMQ
- Ensures no message loss even if worker crashes

### 3. Parallel Processing
- Deployed as 3 replicas via Docker Compose
- Each replica processes messages independently
- Horizontal scaling for higher throughput

### 4. Batch Audit Logging
Audit events are queued in memory and flushed to database in batches (every 1 second or 100 events) to reduce database load.

### 5. Graceful Shutdown
On termination signal (SIGTERM), the worker:
- Stops accepting new messages
- Completes in-flight message processing
- Flushes pending audit logs
- Closes database and queue connections

## Message Format

The worker consumes messages with this structure:

```typescript
{
  saleId: string;      // UUID of the sale
  userId: string;      // User identifier
  timestamp: Date;     // Purchase timestamp
}
```

## Processing Flow

```
1. Receive message from RabbitMQ
   ↓
2. Extract saleId and userId
   ↓
3. Insert order into database (status: CONFIRMED)
   ↓
4. Log CONFIRMED event to audit trail
   ↓
5. Acknowledge message to RabbitMQ
   ↓
6. (If duplicate) Catch P2002 error, treat as success
```

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

# Testing
npm run test               # Run unit tests
npm run test:cov           # Run with coverage

# Code Quality
npm run lint               # Run ESLint
npm run format             # Format code with Prettier
```

## Docker Usage

```bash
# Build image
docker build -t flashsale-worker .

# Run container
docker run \
  -e DATABASE_URL=postgresql://... \
  -e RABBITMQ_URL=amqp://... \
  flashsale-worker
```

## Deployment Considerations

### Scaling
- Deploy multiple replicas for higher throughput
- RabbitMQ automatically distributes messages across workers
- Each worker should have its own Prisma connection pool

### Connection Pooling
- Each worker instance uses 30 database connections (configured in DATABASE_URL)
- With 3 replicas: 3 × 30 = 90 total connections
- Ensure PostgreSQL `max_connections` is sufficient

### Monitoring
Key metrics to monitor:
- **Queue depth**: Number of pending messages in RabbitMQ
- **Processing rate**: Messages consumed per second
- **Error rate**: Failed message processing attempts
- **Database latency**: Time to persist each order

### Error Handling
- **Database errors**: Message is not acknowledged, RabbitMQ redelivers
- **Connection failures**: Worker attempts to reconnect automatically
- **Duplicate orders**: Handled gracefully via unique constraints

## Architecture Notes

This worker service follows NestJS best practices:
- **Module-based architecture** for separation of concerns
- **Dependency injection** for testability
- **Service layer** for business logic
- **Repository pattern** via Prisma

The worker is designed for:
- **Reliability** (at-least-once delivery, idempotency)
- **High throughput** (parallel processing, bulk inserts)
- **Fault tolerance** (auto-reconnect, graceful shutdown)
- **Observability** (comprehensive audit trail)

## Related Services

- **flashsale-api**: Receives user requests and publishes messages to RabbitMQ
- **flashsale-frontend**: Next.js web interface for users
