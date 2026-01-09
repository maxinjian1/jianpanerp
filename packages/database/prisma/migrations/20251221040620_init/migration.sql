-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "tenant";

-- CreateEnum
CREATE TYPE "public"."SubscriptionPlan" AS ENUM ('STARTER', 'GROWTH', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "public"."TenantStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'TRIAL', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."UserRole" AS ENUM ('ADMIN', 'MANAGER', 'OPERATOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "tenant"."ProductStatus" AS ENUM ('ACTIVE', 'DISCONTINUED', 'OUT_OF_STOCK', 'DRAFT');

-- CreateEnum
CREATE TYPE "tenant"."Platform" AS ENUM ('AMAZON_JP', 'RAKUTEN', 'YAHOO_SHOPPING', 'BASE', 'SHOPIFY', 'MANUAL');

-- CreateEnum
CREATE TYPE "tenant"."OrderStatus" AS ENUM ('PENDING', 'CONFIRMED', 'PROCESSING', 'PICKING', 'PACKED', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURNED', 'ON_HOLD');

-- CreateEnum
CREATE TYPE "tenant"."PaymentStatus" AS ENUM ('PENDING', 'PAID', 'REFUNDED', 'FAILED');

-- CreateEnum
CREATE TYPE "tenant"."PaymentMethod" AS ENUM ('CREDIT_CARD', 'CONVENIENCE_STORE', 'BANK_TRANSFER', 'COD', 'AMAZON_PAY', 'RAKUTEN_PAY', 'PAYPAY');

-- CreateEnum
CREATE TYPE "tenant"."CarrierCode" AS ENUM ('YAMATO', 'SAGAWA', 'FUKUYAMA', 'JAPAN_POST', 'SEINO', 'NITTSU');

-- CreateEnum
CREATE TYPE "tenant"."ShipmentStatus" AS ENUM ('PENDING', 'LABEL_PRINTED', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED_DELIVERY', 'RETURNED');

-- CreateEnum
CREATE TYPE "tenant"."ZoneType" AS ENUM ('RECEIVING', 'STORAGE', 'PICKING', 'PACKING', 'SHIPPING', 'RETURNS', 'COLD');

-- CreateEnum
CREATE TYPE "tenant"."LocationType" AS ENUM ('PALLET', 'SHELF', 'BIN', 'FLOOR');

-- CreateEnum
CREATE TYPE "tenant"."TransactionType" AS ENUM ('RECEIVE', 'SHIP', 'ADJUST_PLUS', 'ADJUST_MINUS', 'TRANSFER', 'RETURN', 'DAMAGED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "tenant"."ReceivingStatus" AS ENUM ('PENDING', 'PARTIAL', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "tenant"."PickingStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "tenant"."PickingPriority" AS ENUM ('URGENT', 'HIGH', 'NORMAL', 'LOW');

-- CreateEnum
CREATE TYPE "tenant"."PickingItemStatus" AS ENUM ('PENDING', 'PICKED', 'SHORT', 'SKIPPED');

-- CreateEnum
CREATE TYPE "tenant"."RestockUrgency" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "tenant"."SuggestionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'ORDERED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "tenant"."NotificationType" AS ENUM ('INFO', 'SUCCESS', 'WARNING', 'ERROR', 'ORDER_NEW', 'ORDER_SHIPPED', 'INVENTORY_LOW', 'RESTOCK_SUGGESTION');

-- CreateTable
CREATE TABLE "public"."Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "schemaName" TEXT NOT NULL,
    "subscriptionPlan" "public"."SubscriptionPlan" NOT NULL DEFAULT 'STARTER',
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "status" "public"."TenantStatus" NOT NULL DEFAULT 'TRIAL',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "trialEndsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameKana" TEXT,
    "role" "public"."UserRole" NOT NULL DEFAULT 'OPERATOR',
    "permissions" JSONB NOT NULL DEFAULT '[]',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant"."Product" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "janCode" TEXT,
    "asin" TEXT,
    "rakutenItemCode" TEXT,
    "name" TEXT NOT NULL,
    "nameKana" TEXT,
    "nameEnglish" TEXT,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "subcategory" TEXT,
    "brand" TEXT,
    "manufacturer" TEXT,
    "hasVariants" BOOLEAN NOT NULL DEFAULT false,
    "parentProductId" TEXT,
    "costPrice" DECIMAL(12,2) NOT NULL,
    "wholesalePrice" DECIMAL(12,2),
    "retailPrice" DECIMAL(12,2) NOT NULL,
    "taxRate" INTEGER NOT NULL DEFAULT 10,
    "weight" INTEGER NOT NULL DEFAULT 0,
    "length" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "sizeCode" INTEGER NOT NULL DEFAULT 60,
    "reorderPoint" INTEGER NOT NULL DEFAULT 10,
    "reorderQuantity" INTEGER NOT NULL DEFAULT 50,
    "safetyStock" INTEGER NOT NULL DEFAULT 5,
    "leadTimeDays" INTEGER NOT NULL DEFAULT 7,
    "hasExpiry" BOOLEAN NOT NULL DEFAULT false,
    "expiryWarningDays" INTEGER,
    "status" "tenant"."ProductStatus" NOT NULL DEFAULT 'ACTIVE',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "images" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant"."BundleProduct" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "totalCost" DECIMAL(12,2) NOT NULL,
    "retailPrice" DECIMAL(12,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BundleProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant"."BundleComponent" (
    "id" TEXT NOT NULL,
    "bundleProductId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "BundleComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant"."Order" (
    "id" TEXT NOT NULL,
    "platform" "tenant"."Platform" NOT NULL,
    "externalOrderId" TEXT NOT NULL,
    "externalStatus" TEXT,
    "customerName" TEXT NOT NULL,
    "customerNameKana" TEXT,
    "customerEmail" TEXT,
    "customerPhone" TEXT NOT NULL,
    "companyName" TEXT,
    "shippingZipCode" TEXT NOT NULL,
    "shippingPrefecture" TEXT NOT NULL,
    "shippingCity" TEXT NOT NULL,
    "shippingAddress1" TEXT NOT NULL,
    "shippingAddress2" TEXT,
    "deliveryDate" TIMESTAMP(3),
    "deliveryTimeSlot" TEXT,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "shippingFee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "taxStandard" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "taxReduced" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(12,2) NOT NULL,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "paymentMethod" "tenant"."PaymentMethod" NOT NULL,
    "paymentStatus" "tenant"."PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "status" "tenant"."OrderStatus" NOT NULL DEFAULT 'PENDING',
    "assignedCarrier" TEXT,
    "trackingNumber" TEXT,
    "orderedAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "shippedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant"."OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT,
    "sku" TEXT NOT NULL,
    "janCode" TEXT,
    "name" TEXT NOT NULL,
    "nameKana" TEXT,
    "imageUrl" TEXT,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "taxRate" INTEGER NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "weight" INTEGER,
    "sizeCode" INTEGER,
    "lotNumber" TEXT,
    "expiryDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant"."Shipment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "carrier" "tenant"."CarrierCode" NOT NULL,
    "serviceType" TEXT NOT NULL,
    "trackingNumber" TEXT,
    "shippingDate" TIMESTAMP(3),
    "estimatedDeliveryDate" TIMESTAMP(3),
    "actualDeliveryDate" TIMESTAMP(3),
    "totalWeight" INTEGER NOT NULL,
    "totalSize" INTEGER NOT NULL,
    "deliveryDate" TIMESTAMP(3),
    "deliveryTimeSlot" TEXT,
    "status" "tenant"."ShipmentStatus" NOT NULL DEFAULT 'PENDING',
    "events" JSONB NOT NULL DEFAULT '[]',
    "shippingCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "codAmount" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant"."ShipmentPackage" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "packageNumber" INTEGER NOT NULL,
    "weight" INTEGER NOT NULL,
    "sizeCode" INTEGER NOT NULL,
    "items" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "ShipmentPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant"."RoutingRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "conditions" JSONB NOT NULL DEFAULT '[]',
    "carrier" "tenant"."CarrierCode" NOT NULL,
    "serviceType" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoutingRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant"."Warehouse" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "zipCode" TEXT NOT NULL,
    "prefecture" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "manager" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant"."Zone" (
    "id" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" "tenant"."ZoneType" NOT NULL DEFAULT 'STORAGE',

    CONSTRAINT "Zone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant"."Location" (
    "id" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" "tenant"."LocationType" NOT NULL DEFAULT 'SHELF',
    "capacity" INTEGER,
    "isOccupied" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant"."Inventory" (
    "id" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "locationId" TEXT,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "reservedQty" INTEGER NOT NULL DEFAULT 0,
    "lotNumber" TEXT,
    "expiryDate" TIMESTAMP(3),
    "manufacturingDate" TIMESTAMP(3),
    "lastReceivedAt" TIMESTAMP(3),
    "lastPickedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Inventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant"."InventoryTransaction" (
    "id" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "type" "tenant"."TransactionType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "beforeQty" INTEGER NOT NULL,
    "afterQty" INTEGER NOT NULL,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "lotNumber" TEXT,
    "userId" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant"."ReceivingOrder" (
    "id" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "purchaseOrderId" TEXT,
    "supplierName" TEXT,
    "status" "tenant"."ReceivingStatus" NOT NULL DEFAULT 'PENDING',
    "receivedAt" TIMESTAMP(3),
    "receivedBy" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReceivingOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant"."ReceivingItem" (
    "id" TEXT NOT NULL,
    "receivingOrderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "expectedQty" INTEGER NOT NULL,
    "receivedQty" INTEGER NOT NULL DEFAULT 0,
    "lotNumber" TEXT,
    "expiryDate" TIMESTAMP(3),
    "locationId" TEXT,

    CONSTRAINT "ReceivingItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant"."PickingOrder" (
    "id" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" "tenant"."PickingStatus" NOT NULL DEFAULT 'PENDING',
    "priority" "tenant"."PickingPriority" NOT NULL DEFAULT 'NORMAL',
    "assignedTo" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PickingOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant"."PickingItem" (
    "id" TEXT NOT NULL,
    "pickingOrderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "requiredQty" INTEGER NOT NULL,
    "pickedQty" INTEGER NOT NULL DEFAULT 0,
    "lotNumber" TEXT,
    "status" "tenant"."PickingItemStatus" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "PickingItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant"."MarketplaceCredential" (
    "id" TEXT NOT NULL,
    "platform" "tenant"."Platform" NOT NULL,
    "name" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "accessToken" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "sellerId" TEXT,
    "marketplaceId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant"."ForecastResult" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "forecastDate" TIMESTAMP(3) NOT NULL,
    "predictions" JSONB NOT NULL DEFAULT '[]',
    "metrics" JSONB NOT NULL DEFAULT '{}',
    "modelUsed" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ForecastResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant"."RestockSuggestion" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "currentStock" INTEGER NOT NULL,
    "forecastedDemand" INTEGER NOT NULL,
    "daysUntilStockout" INTEGER NOT NULL,
    "suggestedOrderQty" INTEGER NOT NULL,
    "suggestedOrderDate" TIMESTAMP(3) NOT NULL,
    "urgency" "tenant"."RestockUrgency" NOT NULL,
    "estimatedCost" DECIMAL(12,2) NOT NULL,
    "potentialLostSales" DECIMAL(12,2) NOT NULL,
    "status" "tenant"."SuggestionStatus" NOT NULL DEFAULT 'PENDING',
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RestockSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant"."AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "previousValue" JSONB,
    "newValue" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant"."Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "type" "tenant"."NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "data" JSONB,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_schemaName_key" ON "public"."Tenant"("schemaName");

-- CreateIndex
CREATE INDEX "User_tenantId_idx" ON "public"."User"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "User_tenantId_email_key" ON "public"."User"("tenantId", "email");

-- CreateIndex
CREATE INDEX "Product_janCode_idx" ON "tenant"."Product"("janCode");

-- CreateIndex
CREATE INDEX "Product_asin_idx" ON "tenant"."Product"("asin");

-- CreateIndex
CREATE INDEX "Product_category_idx" ON "tenant"."Product"("category");

-- CreateIndex
CREATE INDEX "Product_status_idx" ON "tenant"."Product"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Product_sku_key" ON "tenant"."Product"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "BundleProduct_sku_key" ON "tenant"."BundleProduct"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "BundleComponent_bundleProductId_productId_key" ON "tenant"."BundleComponent"("bundleProductId", "productId");

-- CreateIndex
CREATE INDEX "Order_status_idx" ON "tenant"."Order"("status");

-- CreateIndex
CREATE INDEX "Order_orderedAt_idx" ON "tenant"."Order"("orderedAt");

-- CreateIndex
CREATE INDEX "Order_platform_idx" ON "tenant"."Order"("platform");

-- CreateIndex
CREATE UNIQUE INDEX "Order_platform_externalOrderId_key" ON "tenant"."Order"("platform", "externalOrderId");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "tenant"."OrderItem"("orderId");

-- CreateIndex
CREATE INDEX "OrderItem_productId_idx" ON "tenant"."OrderItem"("productId");

-- CreateIndex
CREATE INDEX "Shipment_orderId_idx" ON "tenant"."Shipment"("orderId");

-- CreateIndex
CREATE INDEX "Shipment_trackingNumber_idx" ON "tenant"."Shipment"("trackingNumber");

-- CreateIndex
CREATE INDEX "Shipment_status_idx" ON "tenant"."Shipment"("status");

-- CreateIndex
CREATE INDEX "ShipmentPackage_shipmentId_idx" ON "tenant"."ShipmentPackage"("shipmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Warehouse_code_key" ON "tenant"."Warehouse"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Zone_warehouseId_code_key" ON "tenant"."Zone"("warehouseId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Location_zoneId_code_key" ON "tenant"."Location"("zoneId", "code");

-- CreateIndex
CREATE INDEX "Inventory_productId_idx" ON "tenant"."Inventory"("productId");

-- CreateIndex
CREATE INDEX "Inventory_expiryDate_idx" ON "tenant"."Inventory"("expiryDate");

-- CreateIndex
CREATE UNIQUE INDEX "Inventory_warehouseId_productId_lotNumber_key" ON "tenant"."Inventory"("warehouseId", "productId", "lotNumber");

-- CreateIndex
CREATE INDEX "InventoryTransaction_productId_idx" ON "tenant"."InventoryTransaction"("productId");

-- CreateIndex
CREATE INDEX "InventoryTransaction_warehouseId_idx" ON "tenant"."InventoryTransaction"("warehouseId");

-- CreateIndex
CREATE INDEX "InventoryTransaction_createdAt_idx" ON "tenant"."InventoryTransaction"("createdAt");

-- CreateIndex
CREATE INDEX "ReceivingOrder_warehouseId_idx" ON "tenant"."ReceivingOrder"("warehouseId");

-- CreateIndex
CREATE INDEX "ReceivingOrder_status_idx" ON "tenant"."ReceivingOrder"("status");

-- CreateIndex
CREATE INDEX "ReceivingItem_receivingOrderId_idx" ON "tenant"."ReceivingItem"("receivingOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "PickingOrder_orderId_key" ON "tenant"."PickingOrder"("orderId");

-- CreateIndex
CREATE INDEX "PickingOrder_warehouseId_idx" ON "tenant"."PickingOrder"("warehouseId");

-- CreateIndex
CREATE INDEX "PickingOrder_status_idx" ON "tenant"."PickingOrder"("status");

-- CreateIndex
CREATE INDEX "PickingItem_pickingOrderId_idx" ON "tenant"."PickingItem"("pickingOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceCredential_platform_sellerId_key" ON "tenant"."MarketplaceCredential"("platform", "sellerId");

-- CreateIndex
CREATE INDEX "ForecastResult_productId_idx" ON "tenant"."ForecastResult"("productId");

-- CreateIndex
CREATE INDEX "ForecastResult_forecastDate_idx" ON "tenant"."ForecastResult"("forecastDate");

-- CreateIndex
CREATE INDEX "RestockSuggestion_productId_idx" ON "tenant"."RestockSuggestion"("productId");

-- CreateIndex
CREATE INDEX "RestockSuggestion_urgency_idx" ON "tenant"."RestockSuggestion"("urgency");

-- CreateIndex
CREATE INDEX "RestockSuggestion_status_idx" ON "tenant"."RestockSuggestion"("status");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "tenant"."AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "tenant"."AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_timestamp_idx" ON "tenant"."AuditLog"("timestamp");

-- CreateIndex
CREATE INDEX "Notification_userId_idx" ON "tenant"."Notification"("userId");

-- CreateIndex
CREATE INDEX "Notification_isRead_idx" ON "tenant"."Notification"("isRead");

-- AddForeignKey
ALTER TABLE "public"."User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant"."Product" ADD CONSTRAINT "Product_parentProductId_fkey" FOREIGN KEY ("parentProductId") REFERENCES "tenant"."Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant"."BundleComponent" ADD CONSTRAINT "BundleComponent_bundleProductId_fkey" FOREIGN KEY ("bundleProductId") REFERENCES "tenant"."BundleProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant"."BundleComponent" ADD CONSTRAINT "BundleComponent_productId_fkey" FOREIGN KEY ("productId") REFERENCES "tenant"."Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant"."OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "tenant"."Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant"."OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "tenant"."Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant"."Shipment" ADD CONSTRAINT "Shipment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "tenant"."Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant"."ShipmentPackage" ADD CONSTRAINT "ShipmentPackage_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "tenant"."Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant"."Zone" ADD CONSTRAINT "Zone_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "tenant"."Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant"."Location" ADD CONSTRAINT "Location_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "tenant"."Zone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant"."Inventory" ADD CONSTRAINT "Inventory_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "tenant"."Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant"."Inventory" ADD CONSTRAINT "Inventory_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "tenant"."Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant"."Inventory" ADD CONSTRAINT "Inventory_productId_fkey" FOREIGN KEY ("productId") REFERENCES "tenant"."Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant"."InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "tenant"."Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant"."ReceivingOrder" ADD CONSTRAINT "ReceivingOrder_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "tenant"."Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant"."ReceivingItem" ADD CONSTRAINT "ReceivingItem_receivingOrderId_fkey" FOREIGN KEY ("receivingOrderId") REFERENCES "tenant"."ReceivingOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant"."PickingOrder" ADD CONSTRAINT "PickingOrder_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "tenant"."Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant"."PickingOrder" ADD CONSTRAINT "PickingOrder_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "tenant"."Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant"."PickingItem" ADD CONSTRAINT "PickingItem_pickingOrderId_fkey" FOREIGN KEY ("pickingOrderId") REFERENCES "tenant"."PickingOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
