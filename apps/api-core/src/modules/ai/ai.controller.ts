import { Controller, Get, Post, Param, Body, Query, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiSecurity } from '@nestjs/swagger';
import { AiService } from './ai.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('ai')
@Controller('ai')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@ApiSecurity('tenant-id')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Get('forecast/:productId')
  @ApiOperation({ summary: '売上予測', description: '商品の売上予測を取得（Prophet/LGBM）' })
  async getForecast(
    @Param('productId') productId: string,
    @Query('days') days?: number,
  ): Promise<any> {
    return this.aiService.getForecast(productId, days || 30);
  }

  @Post('restock/generate')
  @ApiOperation({ summary: '補充提案生成', description: 'AI分析に基づく補充提案を生成' })
  async generateRestockSuggestions() {
    return this.aiService.generateRestockSuggestions();
  }

  @Get('restock/suggestions')
  @ApiOperation({ summary: '補充提案一覧', description: '補充提案一覧を取得' })
  async getRestockSuggestions(@Query('urgency') urgency?: string) {
    return this.aiService.getRestockSuggestions(urgency);
  }

  @Post('restock/approve/:suggestionId')
  @ApiOperation({ summary: '補充提案承認', description: '補充提案を承認' })
  async approveSuggestion(
    @Param('suggestionId') suggestionId: string,
    @Request() req: any,
  ) {
    return this.aiService.approveSuggestion(suggestionId, req.user.sub);
  }
}

