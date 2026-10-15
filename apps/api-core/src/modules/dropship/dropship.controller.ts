import { Body, Controller, Get, Param, Post, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DropshipService, ScrapedProduct } from './dropship.service';
import { prisma } from '@japan-erp/database';

@ApiTags('dropship')
@Controller('dropship')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@ApiSecurity('tenant-id')
export class DropshipController {
  constructor(private readonly svc: DropshipService) {}

  @Post('import')
  @ApiOperation({ summary: '採集データ取り込み', description: 'tools/kjyf-scraper の出力（JSON 配列）を登録/更新' })
  import(@Body() body: { items: ScrapedProduct[]; supplier?: string }) {
    return this.svc.importScraped(body.items, body.supplier);
  }

  @Get('products')
  @ApiOperation({ summary: '卸商品一覧' })
  products(@Query('status') status?: string) {
    return prisma.supplierProduct.findMany({ where: status ? { status } : {}, orderBy: { scrapedAt: 'desc' }, take: 200 });
  }

  @Post('products/:id/translate')
  @ApiOperation({ summary: '日本語化（GLM）' })
  translate(@Param('id') id: string) {
    return this.svc.translate(id);
  }

  @Post('products/:id/publish')
  @ApiOperation({ summary: 'Shopify 出品（卸価格×1.15）' })
  publish(@Param('id') id: string, @Query('status') status?: 'ACTIVE' | 'DRAFT') {
    return this.svc.publish(id, status ?? 'DRAFT');
  }

  @Post('publish-batch')
  @ApiOperation({ summary: '一括出品', description: '未出品を limit 件まで翻訳→出品' })
  publishBatch(@Query('limit') limit?: string, @Query('status') status?: 'ACTIVE' | 'DRAFT') {
    return this.svc.publishBatch(Number(limit ?? 10), status ?? 'DRAFT');
  }

  @Get('orders')
  @ApiOperation({ summary: '代発注文一覧（確認待ち等）' })
  orders(@Query('status') status?: string) {
    return this.svc.listOrders(status);
  }

  @Post('orders/:id/confirm')
  @ApiOperation({ summary: '人が確認 → 発注キューへ' })
  confirm(@Param('id') id: string, @Request() req: any) {
    return this.svc.confirm(id, req.user?.email ?? req.user?.id ?? 'unknown');
  }

  @Post('orders/:id/placement')
  @ApiOperation({ summary: '発注ワーカーからの結果報告' })
  placement(@Param('id') id: string, @Body() body: { supplierOrderNo?: string; status: 'placed' | 'paid' | 'failed'; message?: string }) {
    return this.svc.reportPlacement(id, body);
  }

  @Post('orders/:id/ship')
  @ApiOperation({ summary: '追跡番号登録 → Shopify 発送通知' })
  ship(@Param('id') id: string, @Body() body: { number: string; company?: string; url?: string }) {
    return this.svc.ship(id, body);
  }
}
