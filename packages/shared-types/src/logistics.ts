// Logistics/TMS Types - 日本物流会社対応
import { SizeCode } from './product';

export interface Shipment {
  id: string;
  tenantId: string;
  orderId: string;
  
  // Carrier info
  carrier: CarrierCode;
  serviceType: ServiceType;
  trackingNumber: string;
  
  // Shipping info
  shippingDate: Date;
  estimatedDeliveryDate?: Date;
  actualDeliveryDate?: Date;
  
  // Package details
  packages: Package[];
  totalWeight: number;
  totalSize: SizeCode;
  
  // Delivery preferences
  deliveryDate?: Date;
  deliveryTimeSlot?: DeliveryTimeSlot;
  
  // Status tracking
  status: ShipmentStatus;
  events: TrackingEvent[];
  
  // Financial
  shippingCost: number;
  codAmount?: number;     // 代引き金額
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

export interface Package {
  id: string;
  shipmentId: string;
  packageNumber: number;
  weight: number;
  sizeCode: SizeCode;
  items: PackageItem[];
}

export interface PackageItem {
  productId: string;
  sku: string;
  quantity: number;
}

export interface TrackingEvent {
  timestamp: Date;
  status: string;
  location: string;
  description: string;
}

export enum CarrierCode {
  YAMATO = 'YAMATO',               // ヤマト運輸
  SAGAWA = 'SAGAWA',               // 佐川急便
  FUKUYAMA = 'FUKUYAMA',           // 福山通運
  JAPAN_POST = 'JAPAN_POST',       // 日本郵便
  SEINO = 'SEINO',                 // 西濃運輸
  NITTSU = 'NITTSU',               // 日通
}

export enum ServiceType {
  // Yamato
  YAMATO_TAKKYUBIN = 'YAMATO_TAKKYUBIN',       // 宅急便
  YAMATO_COMPACT = 'YAMATO_COMPACT',           // 宅急便コンパクト
  YAMATO_NEKOPOS = 'YAMATO_NEKOPOS',           // ネコポス
  YAMATO_COOL = 'YAMATO_COOL',                 // クール宅急便
  
  // Sagawa
  SAGAWA_HIKYAKU = 'SAGAWA_HIKYAKU',           // 飛脚宅配便
  SAGAWA_LARGE = 'SAGAWA_LARGE',               // 飛脚ラージサイズ宅配便
  SAGAWA_COOL = 'SAGAWA_COOL',                 // 飛脚クール便
  
  // Fukuyama (B2B)
  FUKUYAMA_CARGO = 'FUKUYAMA_CARGO',           // カーゴ便
  FUKUYAMA_PALETTE = 'FUKUYAMA_PALETTE',       // パレット便
  
  // Japan Post
  JAPANPOST_YUPACK = 'JAPANPOST_YUPACK',       // ゆうパック
  JAPANPOST_YUMAIL = 'JAPANPOST_YUMAIL',       // ゆうメール
  JAPANPOST_CLICKPOST = 'JAPANPOST_CLICKPOST', // クリックポスト
}

export enum ShipmentStatus {
  PENDING = 'PENDING',           // 出荷準備中
  LABEL_PRINTED = 'LABEL_PRINTED', // 送り状印刷済
  PICKED_UP = 'PICKED_UP',       // 集荷完了
  IN_TRANSIT = 'IN_TRANSIT',     // 輸送中
  OUT_FOR_DELIVERY = 'OUT_FOR_DELIVERY', // 配達中
  DELIVERED = 'DELIVERED',       // 配達完了
  FAILED_DELIVERY = 'FAILED_DELIVERY',   // 配達失敗
  RETURNED = 'RETURNED',         // 返送
}

// SizeCode is imported from product

export enum DeliveryTimeSlot {
  MORNING = '0812',
  SLOT_1214 = '1214',
  SLOT_1416 = '1416',
  SLOT_1618 = '1618',
  SLOT_1820 = '1820',
  SLOT_1921 = '1921',
  ANYTIME = '0000',
}

// Carrier-specific CSV formats
export interface SagawaCsvRow {
  住所録コード: string;
  お届け先電話番号: string;
  お届け先郵便番号: string;
  お届け先住所1: string;
  お届け先住所2: string;
  お届け先住所3: string;
  お届け先名: string;
  依頼主電話番号: string;
  依頼主郵便番号: string;
  依頼主住所1: string;
  依頼主住所2: string;
  依頼主名: string;
  品名: string;
  個数: string;
  重量: string;
  配達日: string;
  配達時間帯: string;
  代引き金額: string;
  お届け先コード: string;
  お客様管理番号: string;
}

export interface YamatoCsvRow {
  お届け先電話番号: string;
  お届け先郵便番号: string;
  お届け先住所: string;
  お届け先会社・部門１: string;
  お届け先会社・部門２: string;
  お届け先名: string;
  お届け先名略称カナ: string;
  ご依頼主電話番号: string;
  ご依頼主郵便番号: string;
  ご依頼主住所: string;
  ご依頼主名: string;
  品名１: string;
  品名２: string;
  荷扱い１: string;
  荷扱い２: string;
  お届け予定日: string;
  配達時間帯: string;
  送り状種類: string;
  コレクト代金引換額: string;
  クロネコＤＭ便: string;
}

export interface FukuyamaCsvRow {
  荷送人コード: string;
  届先コード: string;
  届先電話番号: string;
  届先郵便番号: string;
  届先住所1: string;
  届先住所2: string;
  届先会社名: string;
  届先担当者: string;
  個数: string;
  重量: string;
  配達指定日: string;
  配達時間: string;
  運賃区分: string;
  荷札メッセージ: string;
}

// Routing rules
export interface RoutingRule {
  id: string;
  tenantId: string;
  name: string;
  priority: number;
  conditions: RoutingCondition[];
  carrier: CarrierCode;
  serviceType: ServiceType;
  isActive: boolean;
}

export interface RoutingCondition {
  field: RoutingConditionField;
  operator: RoutingOperator;
  value: string | number;
}

export enum RoutingConditionField {
  TOTAL_WEIGHT = 'TOTAL_WEIGHT',
  TOTAL_SIZE = 'TOTAL_SIZE',
  PREFECTURE = 'PREFECTURE',
  HAS_COMPANY_NAME = 'HAS_COMPANY_NAME',
  ORDER_VALUE = 'ORDER_VALUE',
  IS_COD = 'IS_COD',
  DELIVERY_DATE = 'DELIVERY_DATE',
}

export enum RoutingOperator {
  EQUALS = 'EQUALS',
  NOT_EQUALS = 'NOT_EQUALS',
  GREATER_THAN = 'GREATER_THAN',
  LESS_THAN = 'LESS_THAN',
  CONTAINS = 'CONTAINS',
  IS_TRUE = 'IS_TRUE',
  IS_FALSE = 'IS_FALSE',
}

// DTOs
export interface CreateShipmentDto {
  orderId: string;
  carrier?: CarrierCode;
  serviceType?: ServiceType;
  packages: CreatePackageDto[];
}

export interface CreatePackageDto {
  weight: number;
  sizeCode: SizeCode;
  items: { productId: string; quantity: number }[];
}

export interface ShipmentFilterDto {
  status?: ShipmentStatus[];
  carrier?: CarrierCode[];
  startDate?: Date;
  endDate?: Date;
  page?: number;
  limit?: number;
}

