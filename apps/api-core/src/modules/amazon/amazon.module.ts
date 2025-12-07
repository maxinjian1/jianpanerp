import { Module } from '@nestjs/common';
import { AmazonController } from './amazon.controller';
import { AmazonService } from './amazon.service';

@Module({
  controllers: [AmazonController],
  providers: [AmazonService],
  exports: [AmazonService],
})
export class AmazonModule {}

