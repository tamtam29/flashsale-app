-- CreateTable
CREATE TABLE "sales" (
    "id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "total_stock" INTEGER NOT NULL,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "sale_id" UUID NOT NULL,
    "user_id" VARCHAR(255) NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'CONFIRMED',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_audit_trail" (
    "id" UUID NOT NULL,
    "sale_id" UUID NOT NULL,
    "user_id" VARCHAR(255) NOT NULL,
    "event_type" VARCHAR(100) NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_audit_trail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_sales_time_range" ON "sales"("starts_at", "ends_at");

-- CreateIndex
CREATE INDEX "idx_sales_created_at" ON "sales"("created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_orders_sale_id" ON "orders"("sale_id");

-- CreateIndex
CREATE INDEX "idx_orders_user_id" ON "orders"("user_id");

-- CreateIndex
CREATE INDEX "idx_orders_created_at" ON "orders"("created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "orders_sale_id_user_id_key" ON "orders"("sale_id", "user_id");

-- CreateIndex
CREATE INDEX "idx_audit_sale_user" ON "order_audit_trail"("sale_id", "user_id");

-- CreateIndex
CREATE INDEX "idx_audit_event_type" ON "order_audit_trail"("event_type");

-- CreateIndex
CREATE INDEX "idx_audit_created_at" ON "order_audit_trail"("created_at" DESC);

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_audit_trail" ADD CONSTRAINT "order_audit_trail_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;
