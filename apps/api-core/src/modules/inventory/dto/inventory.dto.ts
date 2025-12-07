import {
  IsString,
  IsNumber,
  IsOptional,
  IsBoolean,
  IsDateString,
  Min,
  Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ReceiveInventoryDto {
  @ApiProperty({ description: '倉庫ID' })
  @IsString()
  warehouseId: string;

  @ApiProperty({ description: '商品ID' })
  @IsString()
  productId: string;

  @ApiPropertyOptional({ description: 'ロケーションID' })
  @IsOptional()
  @IsString()
  locationId?: string;

  @ApiProperty({ example: 100, description: '入荷数量' })
  @IsNumber()
  @Min(1)
  quantity: number;

  @ApiPropertyOptional({ example: 'LOT-20231201', description: 'ロット番号' })
  @IsOptional()
  @IsString()
  lotNumber?: string;

  @ApiPropertyOptional({ example: '2024-12-31', description: '賞味期限' })
  @IsOptional()
  @IsDateString()
  expiryDate?: string;

  @ApiPropertyOptional({ example: '発注番号: PO-001', description: '備考' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class AdjustInventoryDto {
  @ApiProperty({ description: '倉庫ID' })
  @IsString()
  warehouseId: string;

  @ApiProperty({ description: '商品ID' })
  @IsString()
  productId: string;

  @ApiProperty({ example: -5, description: '調整数量（正: 増加、負: 減少）' })
  @IsNumber()
  quantity: number;

  @ApiProperty({ example: '棚卸差異', description: '調整理由' })
  @IsString()
  reason: string;

  @ApiPropertyOptional({ example: 'LOT-20231201', description: 'ロット番号' })
  @IsOptional()
  @IsString()
  lotNumber?: string;
}

export class InventoryFilterDto {
  @ApiPropertyOptional({ description: '倉庫ID' })
  @IsOptional()
  @IsString()
  warehouseId?: string;

  @ApiPropertyOptional({ description: '商品ID' })
  @IsOptional()
  @IsString()
  productId?: string;

  @ApiPropertyOptional({ example: true, description: '在庫少のみ' })
  @IsOptional()
  @IsBoolean()
  lowStock?: boolean;

  @ApiPropertyOptional({ example: 30, description: 'N日以内に期限切れ' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  expiringWithinDays?: number;

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

