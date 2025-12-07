import { Controller, Get, Post, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiSecurity } from '@nestjs/swagger';
import { RakutenService } from './rakuten.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('rakuten')
@Controller('rakuten')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@ApiSecurity('tenant-id')
export class RakutenController {
  constructor(private readonly rakutenService: RakutenService) {}

  @Post('sync')
  @ApiOperation({ summary: '楽天注文同期', description: '楽天RMS APIから注文を同期' })
  async syncOrders(
    @Request() req: any,
    @Body() body: { since?: string; status?: number[] },
  ) {
    return this.rakutenService.syncOrders(req.tenantId, {
      since: body.since ? new Date(body.since) : undefined,
      status: body.status,
    });
  }

  @Post('confirm-shipment/:orderId')
  @ApiOperation({ summary: '出荷確認', description: '楽天に出荷完了を通知' })
  async confirmShipment(
    @Param('orderId') orderId: string,
    @Body() body: { trackingNumber: string; carrier: string },
  ) {
    return this.rakutenService.confirmShipment(orderId, body.trackingNumber, body.carrier);
  }

  @Get('credentials')
  @ApiOperation({ summary: '認証情報確認', description: '楽天連携設定の状態を確認' })
  async getCredentials(@Request() req: any) {
    try {
      const credential = await this.rakutenService.getCredentials(req.tenantId);
      return {
        configured: true,
        sellerId: credential.sellerId,
        lastSyncAt: credential.lastSyncAt,
        isActive: credential.isActive,
      };
    } catch {
      return {
        configured: false,
      };
    }
  }
}

