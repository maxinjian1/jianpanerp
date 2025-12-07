import { Module } from '@nestjs/common';
import { LogisticsController } from './logistics.controller';
import { LogisticsService } from './logistics.service';
import { RoutingService } from './routing.service';
import { CsvExporterService } from './csv-exporter.service';

@Module({
  controllers: [LogisticsController],
  providers: [LogisticsService, RoutingService, CsvExporterService],
  exports: [LogisticsService, RoutingService, CsvExporterService],
})
export class LogisticsModule {}

