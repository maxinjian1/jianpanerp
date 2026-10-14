import { Module } from '@nestjs/common';
import { LlmGatewayController } from './llm-gateway.controller';
import { LlmGatewayService } from './llm-gateway.service';

@Module({
  controllers: [LlmGatewayController],
  providers: [LlmGatewayService],
  exports: [LlmGatewayService],
})
export class LlmGatewayModule {}
