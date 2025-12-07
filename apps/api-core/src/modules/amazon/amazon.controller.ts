import { Controller, Get, Post, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiSecurity } from '@nestjs/swagger';
import { AmazonService } from './amazon.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('amazon')
@Controller('amazon')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@ApiSecurity('tenant-id')
export class AmazonController {
  constructor(private readonly amazonService: AmazonService) {}

  @Post('sync')
  @ApiOperation({ summary: 'Amazon注文同期', description: 'Amazon SP-APIから注文を同期' })
  async syncOrders(
    @Request() req: any,
    @Body() body: { since?: string; status?: string[] },
  ) {
    return this.amazonService.syncOrders(req.tenantId, {
      since: body.since ? new Date(body.since) : undefined,
      status: body.status,
    });
  }

  @Post('confirm-shipment/:orderId')
  @ApiOperation({ summary: '出荷確認', description: 'Amazonに出荷完了を通知' })
  async confirmShipment(
    @Param('orderId') orderId: string,
    @Body() body: { trackingNumber: string; carrier: string },
  ) {
    return this.amazonService.confirmShipment(orderId, body.trackingNumber, body.carrier);
  }

  @Get('credentials')
  @ApiOperation({ summary: '認証情報確認', description: 'Amazon連携設定の状態を確認' })
  async getCredentials(@Request() req: any) {
    try {
      const credential = await this.amazonService.getCredentials(req.tenantId);
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

