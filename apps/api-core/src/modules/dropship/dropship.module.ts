import { Module } from '@nestjs/common';
import { DropshipController } from './dropship.controller';
import { DropshipService } from './dropship.service';
import { RakutenModule } from '../rakuten/rakuten.module';

@Module({
  imports: [RakutenModule],
  controllers: [DropshipController],
  providers: [DropshipService],
  exports: [DropshipService],
})
export class DropshipModule {}
