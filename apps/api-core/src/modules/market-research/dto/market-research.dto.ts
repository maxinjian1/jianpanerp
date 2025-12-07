import { IsString, IsNumber, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AnalyzeCategoryDto {
  @ApiProperty({ description: 'Category ID or Keyword' })
  @IsString()
  categoryId: string;

  @ApiProperty({ enum: ['AMAZON_JP', 'RAKUTEN'], description: 'Target Platform' })
  @IsEnum(['AMAZON_JP', 'RAKUTEN'])
  platform: 'AMAZON_JP' | 'RAKUTEN';
}

export class KeywordTrendDto {
  @ApiProperty({ description: 'Keyword to analyze on Social Media' })
  @IsString()
  keyword: string;
}

export class ProfitCalcDto {
  @ApiProperty({ example: 1000, description: 'Product Cost (JPY)' })
  @IsNumber()
  cost: number;

  @ApiProperty({ example: 3500, description: 'Target Selling Price (JPY)' })
  @IsNumber()
  price: number;

  @ApiProperty({ enum: ['small', 'standard', 'large'], description: 'Product Size' })
  @IsEnum(['small', 'standard', 'large'])
  size: 'small' | 'standard' | 'large';
}

