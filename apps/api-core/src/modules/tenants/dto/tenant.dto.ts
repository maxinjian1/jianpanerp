import { IsString, IsBoolean, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateTenantSettingsDto {
  @ApiPropertyOptional({ example: 'Asia/Tokyo', description: 'タイムゾーン' })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({ example: 'ja-JP', description: 'ロケール' })
  @IsOptional()
  @IsString()
  locale?: string;

  @ApiPropertyOptional({ example: 'T1234567890123', description: '適格請求書発行事業者登録番号' })
  @IsOptional()
  @IsString()
  taxRegistrationNumber?: string;

  @ApiPropertyOptional({ example: true, description: '軽減税率対応' })
  @IsOptional()
  @IsBoolean()
  enableReducedTaxRate?: boolean;

  @ApiPropertyOptional({ example: true, description: 'Amazon連携' })
  @IsOptional()
  @IsBoolean()
  amazonEnabled?: boolean;

  @ApiPropertyOptional({ example: true, description: '楽天連携' })
  @IsOptional()
  @IsBoolean()
  rakutenEnabled?: boolean;

  @ApiPropertyOptional({ example: 'SAGAWA', description: 'デフォルト配送会社' })
  @IsOptional()
  @IsString()
  defaultCarrier?: string;

  @ApiPropertyOptional({ example: true, description: '自動配送ルーティング' })
  @IsOptional()
  @IsBoolean()
  enableAutoRouting?: boolean;
}

