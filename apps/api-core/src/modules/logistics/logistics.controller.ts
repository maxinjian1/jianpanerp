import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiSecurity } from '@nestjs/swagger';
import { LogisticsService } from './logistics.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CarrierCode } from './routing.service';

@ApiTags('logistics')
@Controller('logistics')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@ApiSecurity('tenant-id')
export class LogisticsController {
  constructor(private readonly logisticsService: LogisticsService) {}

  @Get('shipments')
  @ApiOperation({ summary: '出荷一覧', description: '出荷一覧を取得' })
  async getShipments(
    @Query('status') status?: string,
    @Query('carrier') carrier?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.logisticsService.getShipments({
      status: status?.split(','),
      carrier: carrier?.split(','),
      page,
      limit,
    });
  }

  @Get('stats')
  @ApiOperation({ summary: '物流統計', description: 'キャリア別の出荷統計' })
  async getStats() {
    return this.logisticsService.getCarrierStats();
  }

  @Post('route/:orderId')
  @ApiOperation({ summary: '配送ルーティング', description: '注文に最適なキャリアを自動判定' })
  async routeOrder(@Param('orderId') orderId: string) {
    return this.logisticsService.routeOrder(orderId);
  }

  @Post('route-batch')
  @ApiOperation({ summary: '一括ルーティング', description: '複数注文を一括でルーティング' })
  async routeOrders(@Body() body: { orderIds: string[] }) {
    return this.logisticsService.routeOrders(body.orderIds);
  }

  @Post('shipments')
  @ApiOperation({ summary: '出荷作成', description: '出荷データを作成（自動ルーティング）' })
  async createShipment(
    @Body() body: { orderId: string; carrier?: CarrierCode },
  ) {
    return this.logisticsService.createShipment(body.orderId, body.carrier);
  }

  @Post('export-csv')
  @ApiOperation({ summary: 'CSV出力', description: 'キャリア別にShift-JIS形式のCSVを生成' })
  async exportCsv(
    @Body() body: { carrier: CarrierCode; orderIds: string[] },
    @Res() res: Response,
  ) {
    const result = await this.logisticsService.generateCsv(body.carrier, body.orderIds);

    res.setHeader('Content-Type', 'text/csv; charset=Shift_JIS');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(result.buffer);
  }

  @Patch('shipments/:id/tracking')
  @ApiOperation({ summary: '追跡番号設定', description: '出荷に追跡番号を設定' })
  async updateTracking(
    @Param('id') id: string,
    @Body() body: { trackingNumber: string },
  ) {
    return this.logisticsService.updateTrackingNumber(id, body.trackingNumber);
  }
}

