import { Controller, Headers, HttpCode, Logger, Post, Req, UnauthorizedException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { ShopifyService } from './shopify.service';
import { DropshipService } from '../dropship/dropship.service';

/**
 * Shopify Webhook 受信口。認証はテナントヘッダではなく HMAC 署名。
 * Dev Dashboard のアプリ設定で orders/create を https://japanerp.com/api/v1/webhooks/shopify/orders に向ける。
 */
@ApiTags('webhooks')
@Controller('webhooks/shopify')
export class ShopifyWebhookController {
  private readonly logger = new Logger(ShopifyWebhookController.name);

  constructor(
    private readonly shopify: ShopifyService,
    private readonly dropship: DropshipService,
  ) {}

  @Post('orders')
  @HttpCode(200)
  async ordersCreate(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('x-shopify-hmac-sha256') hmac: string,
    @Headers('x-shopify-topic') topic: string,
  ) {
    if (!this.shopify.verifyWebhook(req.rawBody, hmac)) {
      this.logger.warn(`webhook rejected: bad HMAC (topic=${topic})`);
      throw new UnauthorizedException('bad hmac');
    }
    // 200 を即返しつつ処理（Shopify は 5 秒以内の応答を要求）
    const order = req.body;
    this.dropship
      .intakeShopifyOrder(order)
      .catch((e) => this.logger.error(`intake failed for order ${order?.id}: ${String(e)}`));
    return { ok: true };
  }
}
