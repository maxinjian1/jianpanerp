import {
  IsString,
  IsNumber,
  IsOptional,
  IsBoolean,
  IsEnum,
  Min,
  Max,
  Length,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum ProductStatus {
  ACTIVE = 'ACTIVE',
  DISCONTINUED = 'DISCONTINUED',
  OUT_OF_STOCK = 'OUT_OF_STOCK',
  DRAFT = 'DRAFT',
}

export class CreateProductDto {
  @ApiProperty({ example: 'SKU-001', description: 'SKUコード' })
  @IsString()
  @Length(1, 50)
  sku: string;

  @ApiPropertyOptional({ example: '4901234567890', description: 'JANコード（13桁）' })
  @IsOptional()
  @IsString()
  @Length(13, 13)
  janCode?: string;

  @ApiProperty({ example: 'サンプル商品A', description: '商品名' })
  @IsString()
  @Length(1, 200)
  name: string;

  @ApiPropertyOptional({ example: 'サンプルショウヒンエー', description: '商品名フリガナ' })
  @IsOptional()
  @IsString()
  nameKana?: string;

  @ApiPropertyOptional({ example: '商品の説明文', description: '商品説明' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: '食品', description: 'カテゴリ' })
  @IsString()
  category: string;

  @ApiPropertyOptional({ example: '菓子', description: 'サブカテゴリ' })
  @IsOptional()
  @IsString()
  subcategory?: string;

  @ApiPropertyOptional({ example: 'ブランドA', description: 'ブランド' })
  @IsOptional()
  @IsString()
  brand?: string;

  @ApiPropertyOptional({ example: 'メーカーA', description: 'メーカー' })
  @IsOptional()
  @IsString()
  manufacturer?: string;

  @ApiProperty({ example: 500, description: '原価' })
  @IsNumber()
  @Min(0)
  costPrice: number;

  @ApiPropertyOptional({ example: 800, description: '卸価格' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  wholesalePrice?: number;

  @ApiProperty({ example: 1000, description: '販売価格' })
  @IsNumber()
  @Min(0)
  retailPrice: number;

  @ApiProperty({ example: 10, description: '税率（10 or 8）' })
  @IsNumber()
  taxRate: number;

  @ApiProperty({ example: 500, description: '重量（g）' })
  @IsNumber()
  @Min(0)
  weight: number;

  @ApiPropertyOptional({ example: 200, description: '長さ（mm）' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  length?: number;

  @ApiPropertyOptional({ example: 150, description: '幅（mm）' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  width?: number;

  @ApiPropertyOptional({ example: 100, description: '高さ（mm）' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  height?: number;

  @ApiPropertyOptional({ example: 60, description: 'サイズコード（60/80/100/120/140/160）' })
  @IsOptional()
  @IsNumber()
  sizeCode?: number;

  @ApiPropertyOptional({ example: 10, description: '発注点' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  reorderPoint?: number;

  @ApiPropertyOptional({ example: 50, description: '発注数量' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  reorderQuantity?: number;

  @ApiPropertyOptional({ example: 5, description: '安全在庫' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  safetyStock?: number;

  @ApiPropertyOptional({ example: 7, description: 'リードタイム（日）' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  leadTimeDays?: number;

  @ApiPropertyOptional({ example: true, description: '賞味期限管理' })
  @IsOptional()
  @IsBoolean()
  hasExpiry?: boolean;

  @ApiPropertyOptional({ example: 30, description: '賞味期限警告日数' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  expiryWarningDays?: number;
}

export class UpdateProductDto {
  @ApiPropertyOptional({ example: 'サンプル商品A（改）', description: '商品名' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: '商品の説明文（更新）', description: '商品説明' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 1200, description: '販売価格' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  retailPrice?: number;

  @ApiPropertyOptional({ example: 600, description: '原価' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  costPrice?: number;

  @ApiPropertyOptional({ enum: ProductStatus, description: 'ステータス' })
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @ApiPropertyOptional({ example: true, description: '有効/無効' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ example: 15, description: '発注点' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  reorderPoint?: number;

  @ApiPropertyOptional({ example: 100, description: '発注数量' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  reorderQuantity?: number;
}

export class ProductFilterDto {
  @ApiPropertyOptional({ example: '食品', description: 'カテゴリフィルタ' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ enum: ProductStatus, description: 'ステータスフィルタ' })
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @ApiPropertyOptional({ example: 'サンプル', description: '検索キーワード' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ example: true, description: '在庫少商品のみ' })
  @IsOptional()
  @IsBoolean()
  hasLowStock?: boolean;

  @ApiPropertyOptional({ example: 1, description: 'ページ番号' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 20, description: '取得件数' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number;
}

