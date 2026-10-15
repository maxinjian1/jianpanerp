import { Module, forwardRef } from '@nestjs/common';
import { ShopifyService } from './shopify.service';
import { ShopifyWebhookController } from './shopify-webhook.controller';
import { DropshipModule } from '../dropship/dropship.module';

@Module({
  imports: [forwardRef(() => DropshipModule)],
  controllers: [ShopifyWebhookController],
  providers: [ShopifyService],
  exports: [ShopifyService],
})
export class ShopifyModule {}
