import {
  IsString,
  IsNumber,
  IsArray,
  IsOptional,
  IsEnum,
  ValidateNested,
  Min,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum Platform {
  AMAZON_JP = 'AMAZON_JP',
  RAKUTEN = 'RAKUTEN',
  YAHOO_SHOPPING = 'YAHOO_SHOPPING',
  BASE = 'BASE',
  SHOPIFY = 'SHOPIFY',
  MANUAL = 'MANUAL',
}

export enum OrderStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  PROCESSING = 'PROCESSING',
  PICKING = 'PICKING',
  PACKED = 'PACKED',
  SHIPPED = 'SHIPPED',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
  RETURNED = 'RETURNED',
  ON_HOLD = 'ON_HOLD',
}

export enum PaymentMethod {
  CREDIT_CARD = 'CREDIT_CARD',
  CONVENIENCE_STORE = 'CONVENIENCE_STORE',
  BANK_TRANSFER = 'BANK_TRANSFER',
  COD = 'COD',
  AMAZON_PAY = 'AMAZON_PAY',
  RAKUTEN_PAY = 'RAKUTEN_PAY',
  PAYPAY = 'PAYPAY',
}

export class CreateOrderItemDto {
  @ApiProperty({ example: 'SKU-001', description: 'SKUコード' })
  @IsString()
  sku: string;

  @ApiProperty({ example: 'サンプル商品', description: '商品名' })
  @IsString()
  name: string;

  @ApiProperty({ example: 2, description: '数量' })
  @IsNumber()
  @Min(1)
  quantity: number;

  @ApiProperty({ example: 1000, description: '単価（税抜）' })
  @IsNumber()
  @Min(0)
  unitPrice: number;

  @ApiProperty({ example: 10, description: '税率（10 or 8）' })
  @IsNumber()
  taxRate: number;
}

export class CreateOrderDto {
  @ApiProperty({ enum: Platform, example: 'MANUAL', description: '注文元プラットフォーム' })
  @IsEnum(Platform)
  platform: Platform;

  @ApiProperty({ example: 'ORD-20231201-001', description: '外部注文番号' })
  @IsString()
  externalOrderId: string;

  @ApiProperty({ example: '山田太郎', description: '顧客名' })
  @IsString()
  customerName: string;

  @ApiProperty({ example: '090-1234-5678', description: '電話番号' })
  @IsString()
  customerPhone: string;

  @ApiProperty({ example: '123-4567', description: '郵便番号' })
  @IsString()
  shippingZipCode: string;

  @ApiProperty({ example: '東京都', description: '都道府県' })
  @IsString()
  shippingPrefecture: string;

  @ApiProperty({ example: '渋谷区', description: '市区町村' })
  @IsString()
  shippingCity: string;

  @ApiProperty({ example: '道玄坂1-2-3', description: '番地' })
  @IsString()
  shippingAddress1: string;

  @ApiPropertyOptional({ example: 'サンプルビル101', description: '建物名・部屋番号' })
  @IsOptional()
  @IsString()
  shippingAddress2?: string;

  @ApiPropertyOptional({ enum: PaymentMethod, description: '支払方法' })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @ApiProperty({ type: [CreateOrderItemDto], description: '注文明細' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items: CreateOrderItemDto[];
}

export class UpdateOrderStatusDto {
  @ApiProperty({ enum: OrderStatus, description: '新しいステータス' })
  @IsEnum(OrderStatus)
  status: OrderStatus;

  @ApiPropertyOptional({ example: '1234-5678-9012', description: '追跡番号' })
  @IsOptional()
  @IsString()
  trackingNumber?: string;

  @ApiPropertyOptional({ example: 'SAGAWA', description: '配送会社' })
  @IsOptional()
  @IsString()
  carrier?: string;
}

export class OrderFilterDto {
  @ApiPropertyOptional({ enum: OrderStatus, isArray: true, description: 'ステータスフィルタ' })
  @IsOptional()
  @IsArray()
  @IsEnum(OrderStatus, { each: true })
  status?: OrderStatus[];

  @ApiPropertyOptional({ enum: Platform, isArray: true, description: 'プラットフォームフィルタ' })
  @IsOptional()
  @IsArray()
  @IsEnum(Platform, { each: true })
  platform?: Platform[];

  @ApiPropertyOptional({ example: '2023-12-01', description: '開始日' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ example: '2023-12-31', description: '終了日' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ example: 'ORD-001', description: '検索キーワード' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ example: 1, description: 'ページ番号' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 20, description: '取得件数' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  limit?: number;
}

