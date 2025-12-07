// Warehouse/WMS Types - 倉庫管理システム

export interface Warehouse {
  id: string;
  tenantId: string;
  name: string;
  code: string;
  
  // Address
  zipCode: string;
  prefecture: string;
  city: string;
  address: string;
  
  // Contact
  phone?: string;
  email?: string;
  manager?: string;
  
  // Settings
  isDefault: boolean;
  isActive: boolean;
  
  // Zones
  zones: Zone[];
  
  createdAt: Date;
  updatedAt: Date;
}

export interface Zone {
  id: string;
  warehouseId: string;
  name: string;
  code: string;
  type: ZoneType;
  locations: Location[];
}

export enum ZoneType {
  RECEIVING = 'RECEIVING',     // 入荷エリア
  STORAGE = 'STORAGE',         // 保管エリア
  PICKING = 'PICKING',         // ピッキングエリア
  PACKING = 'PACKING',         // 梱包エリア
  SHIPPING = 'SHIPPING',       // 出荷エリア
  RETURNS = 'RETURNS',         // 返品エリア
  COLD = 'COLD',               // 冷蔵・冷凍
}

export interface Location {
  id: string;
  zoneId: string;
  code: string;              // A-01-01-1 (列-棚-段-位置)
  type: LocationType;
  capacity?: number;
  currentQty?: number;
  isOccupied: boolean;
  isActive: boolean;
}

export enum LocationType {
  PALLET = 'PALLET',         // パレット
  SHELF = 'SHELF',           // 棚
  BIN = 'BIN',               // ビン
  FLOOR = 'FLOOR',           // 床置き
}

// Inventory
export interface Inventory {
  id: string;
  tenantId: string;
  warehouseId: string;
  locationId?: string;
  productId: string;
  
  // Quantities
  quantity: number;
  reservedQty: number;        // 受注引当数
  availableQty: number;       // 利用可能数 (quantity - reservedQty)
  
  // Lot/Batch tracking
  lotNumber?: string;
  expiryDate?: Date;
  manufacturingDate?: Date;
  
  // Timestamps
  lastReceivedAt?: Date;
  lastPickedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// Inventory Transactions
export interface InventoryTransaction {
  id: string;
  tenantId: string;
  warehouseId: string;
  productId: string;
  
  type: TransactionType;
  quantity: number;           // positive or negative
  beforeQty: number;
  afterQty: number;
  
  // Reference
  referenceType?: ReferenceType;
  referenceId?: string;
  
  // Lot info
  lotNumber?: string;
  
  // Audit
  userId: string;
  notes?: string;
  createdAt: Date;
}

export enum TransactionType {
  RECEIVE = 'RECEIVE',               // 入荷
  SHIP = 'SHIP',                     // 出荷
  ADJUST_PLUS = 'ADJUST_PLUS',       // 在庫調整（増）
  ADJUST_MINUS = 'ADJUST_MINUS',     // 在庫調整（減）
  TRANSFER = 'TRANSFER',             // 倉庫間移動
  RETURN = 'RETURN',                 // 返品入荷
  DAMAGED = 'DAMAGED',               // 破損廃棄
  EXPIRED = 'EXPIRED',               // 期限切れ廃棄
}

export enum ReferenceType {
  ORDER = 'ORDER',
  PURCHASE_ORDER = 'PURCHASE_ORDER',
  TRANSFER_ORDER = 'TRANSFER_ORDER',
  ADJUSTMENT = 'ADJUSTMENT',
}

// Receiving (入荷)
export interface ReceivingOrder {
  id: string;
  tenantId: string;
  warehouseId: string;
  
  // Reference
  purchaseOrderId?: string;
  supplierName?: string;
  
  // Items
  items: ReceivingItem[];
  
  // Status
  status: ReceivingStatus;
  receivedAt?: Date;
  receivedBy?: string;
  
  // Notes
  notes?: string;
  
  createdAt: Date;
  updatedAt: Date;
}

export interface ReceivingItem {
  id: string;
  receivingOrderId: string;
  productId: string;
  expectedQty: number;
  receivedQty: number;
  lotNumber?: string;
  expiryDate?: Date;
  locationId?: string;
}

export enum ReceivingStatus {
  PENDING = 'PENDING',           // 入荷待ち
  PARTIAL = 'PARTIAL',           // 一部入荷
  COMPLETED = 'COMPLETED',       // 入荷完了
  CANCELLED = 'CANCELLED',       // キャンセル
}

// Picking (ピッキング)
export interface PickingOrder {
  id: string;
  tenantId: string;
  warehouseId: string;
  orderId: string;
  
  // Items
  items: PickingItem[];
  
  // Status
  status: PickingStatus;
  priority: PickingPriority;
  
  // Assignment
  assignedTo?: string;
  startedAt?: Date;
  completedAt?: Date;
  
  createdAt: Date;
  updatedAt: Date;
}

export interface PickingItem {
  id: string;
  pickingOrderId: string;
  productId: string;
  locationId: string;
  requiredQty: number;
  pickedQty: number;
  lotNumber?: string;
  status: PickingItemStatus;
}

export enum PickingStatus {
  PENDING = 'PENDING',           // 未開始
  IN_PROGRESS = 'IN_PROGRESS',   // 作業中
  COMPLETED = 'COMPLETED',       // 完了
  CANCELLED = 'CANCELLED',       // キャンセル
}

export enum PickingPriority {
  URGENT = 'URGENT',             // 至急
  HIGH = 'HIGH',                 // 高
  NORMAL = 'NORMAL',             // 普通
  LOW = 'LOW',                   // 低
}

export enum PickingItemStatus {
  PENDING = 'PENDING',
  PICKED = 'PICKED',
  SHORT = 'SHORT',               // 欠品
  SKIPPED = 'SKIPPED',
}

// PDA Scanner operations
export interface ScanOperation {
  id: string;
  tenantId: string;
  warehouseId: string;
  userId: string;
  
  type: ScanOperationType;
  scannedCode: string;
  codeType: CodeType;
  
  // Result
  productId?: string;
  locationId?: string;
  quantity?: number;
  
  // Reference
  referenceType?: string;
  referenceId?: string;
  
  timestamp: Date;
}

export enum ScanOperationType {
  RECEIVE = 'RECEIVE',           // 入荷検品
  PICK = 'PICK',                 // ピッキング
  PUT_AWAY = 'PUT_AWAY',         // 棚入れ
  CYCLE_COUNT = 'CYCLE_COUNT',   // 棚卸
  LOCATE = 'LOCATE',             // ロケーション確認
}

export enum CodeType {
  JAN = 'JAN',                   // JANコード
  SKU = 'SKU',                   // SKUコード
  LOCATION = 'LOCATION',         // ロケーションコード
  LOT = 'LOT',                   // ロット番号
}

// DTOs
export interface CreateInventoryDto {
  warehouseId: string;
  locationId?: string;
  productId: string;
  quantity: number;
  lotNumber?: string;
  expiryDate?: Date;
}

export interface AdjustInventoryDto {
  productId: string;
  warehouseId: string;
  quantity: number;           // positive or negative adjustment
  reason: string;
  lotNumber?: string;
}

export interface InventoryFilterDto {
  warehouseId?: string;
  productId?: string;
  lowStock?: boolean;
  expiringWithinDays?: number;
  page?: number;
  limit?: number;
}

// WebSocket events for real-time updates
export interface InventoryUpdateEvent {
  type: 'INVENTORY_UPDATE';
  tenantId: string;
  warehouseId: string;
  productId: string;
  previousQty: number;
  currentQty: number;
  availableQty: number;
  timestamp: Date;
}

export interface PickingUpdateEvent {
  type: 'PICKING_UPDATE';
  tenantId: string;
  pickingOrderId: string;
  status: PickingStatus;
  progress: number;           // 0-100
  timestamp: Date;
}

