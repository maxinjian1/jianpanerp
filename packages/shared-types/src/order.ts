// Order Management Types - 日本EC市場向け
import { TaxRate, SizeCode } from './product';
import { DeliveryTimeSlot } from './logistics';

export interface Order {
  id: string;
  tenantId: string;
  
  // Platform info
  platform: Platform;
  externalOrderId: string; // 各プラットフォームの注文番号
  externalStatus: string;
  
  // Customer info (APPI準拠のため暗号化必須)
  customerName: string;
  customerNameKana?: string;
  customerEmail?: string;
  customerPhone: string;
  companyName?: string; // B2B用
  
  // Shipping address (日本形式)
  shippingZipCode: string;       // 123-4567
  shippingPrefecture: string;    // 都道府県
  shippingCity: string;          // 市区町村
  shippingAddress1: string;      // 番地
  shippingAddress2?: string;     // 建物名・部屋番号
  
  // Delivery preferences
  deliveryDate?: Date;
  deliveryTimeSlot?: DeliveryTimeSlot;
  
  // Items
  items: OrderItem[];
  
  // Financial (Invoice制度対応)
  subtotal: number;
  shippingFee: number;
  discount: number;
  taxStandard: number;      // 10%対象額
  taxReduced: number;       // 8%対象額 (軽減税率)
  taxAmount: number;        // 消費税合計
  totalAmount: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  
  // Internal status
  status: OrderStatus;
  assignedCarrier?: string;
  trackingNumber?: string;
  
  // Timestamps
  orderedAt: Date;
  paidAt?: Date;
  shippedAt?: Date;
  deliveredAt?: Date;
  cancelledAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrderItem {
  id: string;
  orderId: string;
  
  // Product reference
  productId?: string;
  sku: string;
  janCode?: string;
  
  // Display info
  name: string;
  nameKana?: string;
  imageUrl?: string;
  
  // Quantity & pricing
  quantity: number;
  unitPrice: number;
  taxRate: TaxRate;
  subtotal: number;
  
  // Physical attributes (物流計算用)
  weight?: number;       // grams
  sizeCode?: SizeCode;   // 60/80/100/120/140/160
  
  // Lot/batch tracking
  lotNumber?: string;
  expiryDate?: Date;
}

export enum Platform {
  AMAZON_JP = 'AMAZON_JP',
  RAKUTEN = 'RAKUTEN',
  YAHOO_SHOPPING = 'YAHOO_SHOPPING',
  BASE = 'BASE',
  SHOPIFY = 'SHOPIFY',
  MANUAL = 'MANUAL',
}

export enum OrderStatus {
  PENDING = 'PENDING',           // 新規受注
  CONFIRMED = 'CONFIRMED',       // 確認済み
  PROCESSING = 'PROCESSING',     // 処理中
  PICKING = 'PICKING',           // ピッキング中
  PACKED = 'PACKED',             // 梱包完了
  SHIPPED = 'SHIPPED',           // 出荷済み
  DELIVERED = 'DELIVERED',       // 配達完了
  CANCELLED = 'CANCELLED',       // キャンセル
  RETURNED = 'RETURNED',         // 返品
  ON_HOLD = 'ON_HOLD',           // 保留
}

export enum PaymentStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  REFUNDED = 'REFUNDED',
  FAILED = 'FAILED',
}

export enum PaymentMethod {
  CREDIT_CARD = 'CREDIT_CARD',
  CONVENIENCE_STORE = 'CONVENIENCE_STORE', // コンビニ払い
  BANK_TRANSFER = 'BANK_TRANSFER',         // 銀行振込
  COD = 'COD',                             // 代引き
  AMAZON_PAY = 'AMAZON_PAY',
  RAKUTEN_PAY = 'RAKUTEN_PAY',
  PAYPAY = 'PAYPAY',
}

// TaxRate is imported from product
// SizeCode is imported from product
// DeliveryTimeSlot is imported from logistics

// DTOs
export interface CreateOrderDto {
  platform: Platform;
  externalOrderId: string;
  customerName: string;
  customerPhone: string;
  shippingZipCode: string;
  shippingPrefecture: string;
  shippingCity: string;
  shippingAddress1: string;
  shippingAddress2?: string;
  items: CreateOrderItemDto[];
}

export interface CreateOrderItemDto {
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number;
  taxRate: TaxRate;
}

export interface OrderFilterDto {
  status?: OrderStatus[];
  platform?: Platform[];
  startDate?: Date;
  endDate?: Date;
  search?: string;
  page?: number;
  limit?: number;
}

