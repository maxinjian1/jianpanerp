import { Module, forwardRef } from '@nestjs/common';
import { DropshipController } from './dropship.controller';
import { DropshipService } from './dropship.service';
import { LlmGatewayModule } from '../llm-gateway/llm-gateway.module';
import { ShopifyModule } from '../shopify/shopify.module';

@Module({
  imports: [LlmGatewayModule, forwardRef(() => ShopifyModule)],
  controllers: [DropshipController],
  providers: [DropshipService],
  exports: [DropshipService],
})
export class DropshipModule {}
