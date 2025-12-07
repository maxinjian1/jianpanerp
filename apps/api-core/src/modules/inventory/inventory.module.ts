import { Module } from '@nestjs/common';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { WarehouseController } from './warehouse.controller';
import { WarehouseService } from './warehouse.service';

@Module({
  controllers: [InventoryController, WarehouseController],
  providers: [InventoryService, WarehouseService],
  exports: [InventoryService, WarehouseService],
})
export class InventoryModule {}

