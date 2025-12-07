import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { MarketResearchService } from './market-research.service';
import { AnalyzeCategoryDto, KeywordTrendDto, ProfitCalcDto } from './dto/market-research.dto';
// In a real app, use AuthGuard. Skipping for dev convenience if needed, but keeping for consistency.
// import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('market-research')
@Controller('market-research')
export class MarketResearchController {
  constructor(private readonly marketResearchService: MarketResearchService) {}

  @Post('category-analysis')
  @ApiOperation({ summary: 'カテゴリ分析', description: 'Amazon/楽天のカテゴリ市場分析（Sorftime風）' })
  async analyzeCategory(@Body() dto: AnalyzeCategoryDto) {
    return this.marketResearchService.analyzeCategory(dto);
  }

  @Get('social-trends')
  @ApiOperation({ summary: 'SNSトレンド分析', description: 'キーワードのSNS熱量とセンチメント分析' })
  async getSocialTrends(@Query() dto: KeywordTrendDto) {
    return this.marketResearchService.getSocialTrends(dto);
  }

  @Post('profitability')
  @ApiOperation({ summary: '利益シミュレーション', description: '日本市場向け物流コストを含めた利益計算' })
  async calculateProfitability(@Body() dto: ProfitCalcDto) {
    return this.marketResearchService.calculateProfitability(dto.cost, dto.price, dto.size);
  }
}

