import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ChatRequest, LlmGatewayService } from './llm-gateway.service';

@ApiTags('ai-gateway')
@Controller('ai/gateway')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@ApiSecurity('tenant-id')
export class LlmGatewayController {
  constructor(private readonly gateway: LlmGatewayService) {}

  @Get('providers')
  @ApiOperation({ summary: 'Provider 一覧', description: '設定済み LLM Provider とルーティング' })
  listProviders() {
    return this.gateway.listProviders();
  }

  @Get('providers/:name/health')
  @ApiOperation({ summary: 'Provider 疎通確認', description: 'GET /models で応答を確認' })
  health(@Param('name') name: string) {
    return this.gateway.healthCheck(name);
  }

  @Post('chat')
  @ApiOperation({
    summary: 'Chat（データ分類ルーティング）',
    description: 'dataClass=pii は本地 or 假名化して送信。監査ログを自動記録',
  })
  chat(@Body() body: ChatRequest) {
    return this.gateway.chat(body);
  }
}
