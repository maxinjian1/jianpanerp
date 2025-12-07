import { IsString, IsNumber, IsOptional, IsBoolean, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum ZoneType {
  RECEIVING = 'RECEIVING',
  STORAGE = 'STORAGE',
  PICKING = 'PICKING',
  PACKING = 'PACKING',
  SHIPPING = 'SHIPPING',
  RETURNS = 'RETURNS',
  COLD = 'COLD',
}

export enum LocationType {
  PALLET = 'PALLET',
  SHELF = 'SHELF',
  BIN = 'BIN',
  FLOOR = 'FLOOR',
}

export class CreateWarehouseDto {
  @ApiProperty({ example: '東京倉庫', description: '倉庫名' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'TKY-01', description: '倉庫コード' })
  @IsString()
  code: string;

  @ApiProperty({ example: '135-0061', description: '郵便番号' })
  @IsString()
  zipCode: string;

  @ApiProperty({ example: '東京都', description: '都道府県' })
  @IsString()
  prefecture: string;

  @ApiProperty({ example: '江東区', description: '市区町村' })
  @IsString()
  city: string;

  @ApiProperty({ example: '豊洲1-2-3', description: '番地' })
  @IsString()
  address: string;

  @ApiPropertyOptional({ example: '03-1234-5678', description: '電話番号' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'warehouse@example.com', description: 'メールアドレス' })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional({ example: '田中一郎', description: '責任者名' })
  @IsOptional()
  @IsString()
  manager?: string;

  @ApiPropertyOptional({ example: true, description: 'デフォルト倉庫' })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class CreateZoneDto {
  @ApiProperty({ example: '保管エリアA', description: 'ゾーン名' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'STORAGE-A', description: 'ゾーンコード' })
  @IsString()
  code: string;

  @ApiProperty({ enum: ZoneType, example: 'STORAGE', description: 'ゾーンタイプ' })
  @IsEnum(ZoneType)
  type: ZoneType;
}

export class CreateLocationDto {
  @ApiProperty({ example: 'A-01-01-1', description: 'ロケーションコード（列-棚-段-位置）' })
  @IsString()
  code: string;

  @ApiProperty({ enum: LocationType, example: 'SHELF', description: 'ロケーションタイプ' })
  @IsEnum(LocationType)
  type: LocationType;

  @ApiPropertyOptional({ example: 100, description: '最大収容数' })
  @IsOptional()
  @IsNumber()
  capacity?: number;
}

