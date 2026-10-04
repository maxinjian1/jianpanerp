import {
  IsString,
  IsNumber,
  IsOptional,
  IsBoolean,
  IsEnum,
  IsUrl,
  IsEmail,
  IsInt,
  Min,
  Max,
  Length,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export enum CarrierCode {
  YAMATO = 'YAMATO',
  SAGAWA = 'SAGAWA',
  FUKUYAMA = 'FUKUYAMA',
  JAPAN_POST = 'JAPAN_POST',
  SEINO = 'SEINO',
  NITTSU = 'NITTSU',
}

// --- Supplier ---

export class CreateSupplierDto {
  @ApiProperty({ example: '跨境一帆', description: '卸業者名' })
  @IsString()
  @Length(1, 100)
  name: string;

  @ApiPropertyOptional({ example: 'https://www.kuajingyifan.com', description: '卸サイトURL' })
  @IsOptional()
  @IsUrl()
  websiteUrl?: string;

  @ApiPropertyOptional({ description: '担当者メール' })
  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @ApiPropertyOptional({ description: '担当者電話番号' })
  @IsOptional()
  @IsString()
  contactPhone?: string;

  @ApiPropertyOptional({ example: '○○ショップ 楽天市場店', description: '発送元名義 (楽天店舗名)' })
  @IsOptional()
  @IsString()
  senderName?: string;

  @ApiPropertyOptional({ default: true, description: '店舗名義での匿名配送に対応' })
  @IsOptional()
  @IsBoolean()
  supportsBlindShip?: boolean;

  @ApiPropertyOptional({ description: 'メモ (直送契約の条件など)' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateSupplierDto extends PartialType(CreateSupplierDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

// --- Supplier Product ---

export class LinkSupplierProductDto {
  @ApiProperty({ description: '卸業者ID' })
  @IsString()
  supplierId: string;

  @ApiProperty({ description: '自社商品ID' })
  @IsString()
  productId: string;

  @ApiProperty({ example: 'https://www.kuajingyifan.com/goods/12345', description: '卸サイトの商品ページURL' })
  @IsUrl()
  supplierUrl: string;

  @ApiPropertyOptional({ description: '卸業者側の商品コード' })
  @IsOptional()
  @IsString()
  supplierSku?: string;

  @ApiProperty({ example: 1200, description: '卸価格 (税込)' })
  @IsNumber()
  @Min(0)
  costPrice: number;

  @ApiPropertyOptional({ example: 0, description: '卸業者に支払う送料 (税込)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  shippingCost?: number;

  @ApiPropertyOptional({ example: 1, description: '優先順位 (小さいほど優先)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  priority?: number;
}

export class UpdateSupplierProductDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  supplierUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  supplierSku?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  costPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  shippingCost?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  priority?: number;

  @ApiPropertyOptional({ description: '卸業者で欠品・販売終了の場合 false' })
  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;
}

// --- Profit ---

export class RakutenFeeSettingsDto {
  @ApiProperty({ example: 3.5 })
  @IsNumber()
  @Min(0)
  @Max(100)
  systemFeeRate: number;

  @ApiProperty({ example: 3.0 })
  @IsNumber()
  @Min(0)
  @Max(100)
  paymentFeeRate: number;

  @ApiProperty({ example: 1.0 })
  @IsNumber()
  @Min(0)
  @Max(100)
  pointCostRate: number;

  @ApiProperty({ example: 0 })
  @IsNumber()
  @Min(0)
  @Max(100)
  affiliateRate: number;

  @ApiProperty({ example: 0.1 })
  @IsNumber()
  @Min(0)
  @Max(100)
  otherFeeRate: number;
}

export class ProfitCalculationDto {
  @ApiProperty({ example: 1200, description: '卸価格 (税込) × 数量' })
  @IsNumber()
  @Min(0)
  costPrice: number;

  @ApiProperty({ example: 0, description: '卸業者に支払う送料 (税込)' })
  @IsNumber()
  @Min(0)
  shippingCost: number;

  @ApiPropertyOptional({ example: 2980, description: '楽天販売価格 (税込)。省略時は推奨価格のみ計算' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  sellingPrice?: number;

  @ApiPropertyOptional({ example: 300, description: '1注文あたり広告費 (RPP)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  adCostPerOrder?: number;

  @ApiPropertyOptional({ example: 25, description: '目標利益率 (%)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(99)
  targetMarginPercent?: number;

  @ApiPropertyOptional({ description: '手数料率。省略時は店舗設定 → デフォルト' })
  @IsOptional()
  @ValidateNested()
  @Type(() => RakutenFeeSettingsDto)
  fees?: RakutenFeeSettingsDto;

  @ApiPropertyOptional({ description: '課税事業者。省略時は店舗設定' })
  @IsOptional()
  @IsBoolean()
  isTaxableBusiness?: boolean;
}

// --- Purchase queue ---

export class MarkOrderedDto {
  @ApiProperty({ description: '卸業者ID' })
  @IsString()
  supplierId: string;

  @ApiPropertyOptional({ description: '卸業者側の注文番号' })
  @IsOptional()
  @IsString()
  supplierOrderNo?: string;

  @ApiPropertyOptional({ description: '実際に支払った金額 (税込、送料込)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  actualCost?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class MarkShippedDto {
  @ApiProperty({ description: '卸業者ID' })
  @IsString()
  supplierId: string;

  @ApiProperty({ enum: CarrierCode, example: CarrierCode.YAMATO })
  @IsEnum(CarrierCode)
  carrier: CarrierCode;

  @ApiProperty({ example: '1234-5678-9012', description: '追跡番号' })
  @IsString()
  @Length(1, 50)
  trackingNumber: string;
}

export class CancelPurchaseDto {
  @ApiProperty({ description: '卸業者ID' })
  @IsString()
  supplierId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
