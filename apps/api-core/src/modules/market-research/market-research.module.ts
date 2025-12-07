import { Module } from '@nestjs/common';
import { MarketResearchController } from './market-research.controller';
import { MarketResearchService } from './market-research.service';

@Module({
  controllers: [MarketResearchController],
  providers: [MarketResearchService],
  exports: [MarketResearchService],
})
export class MarketResearchModule {}

