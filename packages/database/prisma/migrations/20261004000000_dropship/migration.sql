-- CreateEnum
CREATE TYPE "tenant"."DropshipPurchaseStatus" AS ENUM ('PENDING', 'ORDERED', 'SHIPPED', 'CANCELLED');

-- CreateTable
CREATE TABLE "tenant"."Supplier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "websiteUrl" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "senderName" TEXT,
    "supportsBlindShip" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant"."SupplierProduct" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "supplierSku" TEXT,
    "supplierUrl" TEXT NOT NULL,
    "costPrice" DECIMAL(12,2) NOT NULL,
    "shippingCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "priority" INTEGER NOT NULL DEFAULT 1,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "lastCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant"."DropshipPurchase" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "status" "tenant"."DropshipPurchaseStatus" NOT NULL DEFAULT 'PENDING',
    "supplierOrderNo" TEXT,
    "actualCost" DECIMAL(12,2),
    "carrier" "tenant"."CarrierCode",
    "trackingNumber" TEXT,
    "orderedAt" TIMESTAMP(3),
    "shippedAt" TIMESTAMP(3),
    "marketplaceNotifiedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DropshipPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupplierProduct_productId_idx" ON "tenant"."SupplierProduct"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierProduct_supplierId_productId_key" ON "tenant"."SupplierProduct"("supplierId", "productId");

-- CreateIndex
CREATE INDEX "DropshipPurchase_status_idx" ON "tenant"."DropshipPurchase"("status");

-- CreateIndex
CREATE UNIQUE INDEX "DropshipPurchase_orderId_supplierId_key" ON "tenant"."DropshipPurchase"("orderId", "supplierId");

-- AddForeignKey
ALTER TABLE "tenant"."SupplierProduct" ADD CONSTRAINT "SupplierProduct_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "tenant"."Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant"."SupplierProduct" ADD CONSTRAINT "SupplierProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "tenant"."Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant"."DropshipPurchase" ADD CONSTRAINT "DropshipPurchase_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "tenant"."Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant"."DropshipPurchase" ADD CONSTRAINT "DropshipPurchase_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "tenant"."Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

