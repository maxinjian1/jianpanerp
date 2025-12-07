// Product/MDM Types - 日本EC市場向けマスタデータ管理

export interface Product {
  id: string;
  tenantId: string;
  
  // Core identifiers
  sku: string;              // 社内管理コード
  janCode?: string;         // JANコード (13桁)
  asin?: string;            // Amazon ASIN
  rakutenItemCode?: string; // 楽天商品管理番号
  
  // Basic info
  name: string;
  nameKana?: string;        // フリガナ
  nameEnglish?: string;     // 英語名 (輸出用)
  description?: string;
  
  // Categorization
  category: string;
  subcategory?: string;
  brand?: string;
  manufacturer?: string;
  
  // Variants
  hasVariants: boolean;
  parentProductId?: string;
  variantAttributes?: VariantAttribute[];
  
  // Pricing
  costPrice: number;        // 原価
  wholesalePrice?: number;  // 卸価格
  retailPrice: number;      // 販売価格
  taxRate: TaxRate;
  
  // Physical attributes
  weight: number;           // grams
  length?: number;          // mm
  width?: number;           // mm
  height?: number;          // mm
  sizeCode: SizeCode;
  
  // Inventory settings
  reorderPoint: number;     // 発注点
  reorderQuantity: number;  // 発注数量
  safetyStock: number;      // 安全在庫
  leadTimeDays: number;     // リードタイム
  
  // Expiry management
  hasExpiry: boolean;
  expiryWarningDays?: number;
  
  // Status
  status: ProductStatus;
  isActive: boolean;
  
  // Images
  images: ProductImage[];
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductImage {
  id: string;
  url: string;
  altText?: string;
  isPrimary: boolean;
  sortOrder: number;
}

export interface VariantAttribute {
  name: string;      // 'Color', 'Size'
  value: string;     // 'Red', 'XL'
  nameJa?: string;   // '色', 'サイズ'
  valueJa?: string;  // '赤', 'XL'
}

export enum ProductStatus {
  ACTIVE = 'ACTIVE',
  DISCONTINUED = 'DISCONTINUED',
  OUT_OF_STOCK = 'OUT_OF_STOCK',
  DRAFT = 'DRAFT',
}

// 日本特有の税率
export enum TaxRate {
  STANDARD = 10,   // 標準税率
  REDUCED = 8,     // 軽減税率 (食品・飲料等)
  EXEMPT = 0,      // 非課税
}

export enum SizeCode {
  SIZE_60 = 60,
  SIZE_80 = 80,
  SIZE_100 = 100,
  SIZE_120 = 120,
  SIZE_140 = 140,
  SIZE_160 = 160,
  SIZE_180 = 180,
}

// セット商品 (組み合わせ商品)
export interface BundleProduct {
  id: string;
  tenantId: string;
  sku: string;
  name: string;
  components: BundleComponent[];
  totalCost: number;
  retailPrice: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface BundleComponent {
  productId: string;
  quantity: number;
}

// DTOs
export interface CreateProductDto {
  sku: string;
  janCode?: string;
  name: string;
  nameKana?: string;
  category: string;
  costPrice: number;
  retailPrice: number;
  taxRate: TaxRate;
  weight: number;
  reorderPoint: number;
  reorderQuantity: number;
}

export interface UpdateProductDto {
  name?: string;
  description?: string;
  retailPrice?: number;
  status?: ProductStatus;
  isActive?: boolean;
}

export interface ProductFilterDto {
  category?: string;
  status?: ProductStatus;
  search?: string;
  hasLowStock?: boolean;
  page?: number;
  limit?: number;
}

