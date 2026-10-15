-- CreateTable
CREATE TABLE "public"."SupplierProduct" (
    "id" TEXT NOT NULL,
    "supplier" TEXT NOT NULL DEFAULT 'kjyf',
    "externalId" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "titleZh" TEXT NOT NULL,
    "titleJa" TEXT,
    "descriptionZh" TEXT,
    "descriptionJa" TEXT,
    "bulletsJa" JSONB,
    "tags" JSONB,
    "images" JSONB NOT NULL,
    "variants" JSONB NOT NULL,
    "wholesalePrice" DECIMAL(12,2) NOT NULL,
    "retailPrice" DECIMAL(12,2),
    "stock" INTEGER NOT NULL DEFAULT 0,
    "category" TEXT,
    "raw" JSONB,
    "shopifyProductId" TEXT,
    "shopifyHandle" TEXT,
    "status" TEXT NOT NULL DEFAULT 'scraped',
    "lastError" TEXT,
    "scrapedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SupplierProduct_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SupplierProduct_supplier_externalId_key" ON "public"."SupplierProduct"("supplier", "externalId");
CREATE INDEX "SupplierProduct_status_idx" ON "public"."SupplierProduct"("status");

-- CreateTable
CREATE TABLE "public"."DropshipOrder" (
    "id" TEXT NOT NULL,
    "shopifyOrderId" TEXT NOT NULL,
    "shopifyOrderName" TEXT NOT NULL,
    "totalPrice" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'JPY',
    "lineItems" JSONB NOT NULL,
    "shipping" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending_confirm',
    "supplierOrderNo" TEXT,
    "trackingNumber" TEXT,
    "trackingCarrier" TEXT,
    "log" JSONB,
    "confirmedBy" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "placedAt" TIMESTAMP(3),
    "shippedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DropshipOrder_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DropshipOrder_shopifyOrderId_key" ON "public"."DropshipOrder"("shopifyOrderId");
CREATE INDEX "DropshipOrder_status_idx" ON "public"."DropshipOrder"("status");
