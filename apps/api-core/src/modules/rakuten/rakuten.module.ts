import { Module } from '@nestjs/common';
import { RakutenController } from './rakuten.controller';
import { RakutenService } from './rakuten.service';

@Module({
  controllers: [RakutenController],
  providers: [RakutenService],
  exports: [RakutenService],
})
export class RakutenModule {}

