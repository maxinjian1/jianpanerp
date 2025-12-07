import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiSecurity } from '@nestjs/swagger';
import { InventoryService } from './inventory.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdjustInventoryDto, InventoryFilterDto, ReceiveInventoryDto } from './dto/inventory.dto';

@ApiTags('inventory')
@Controller('inventory')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@ApiSecurity('tenant-id')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  @ApiOperation({ summary: '在庫一覧', description: '在庫一覧を取得' })
  async findAll(@Query() filters: InventoryFilterDto) {
    return this.inventoryService.findAll(filters);
  }

  @Get('low-stock')
  @ApiOperation({ summary: '在庫少アラート', description: '発注点以下の商品一覧' })
  async getLowStockAlerts() {
    return this.inventoryService.getLowStockAlerts();
  }

  @Get('product/:productId')
  @ApiOperation({ summary: '商品別在庫', description: '特定商品の在庫状況を取得' })
  async getByProduct(@Param('productId') productId: string) {
    return this.inventoryService.getByProduct(productId);
  }

  @Get('product/:productId/transactions')
  @ApiOperation({ summary: '在庫履歴', description: '商品の在庫変動履歴を取得' })
  async getTransactions(@Param('productId') productId: string) {
    return this.inventoryService.getTransactions(productId);
  }

  @Post('receive')
  @ApiOperation({ summary: '入荷', description: '在庫を入荷処理' })
  async receive(@Body() dto: ReceiveInventoryDto, @Request() req: any) {
    return this.inventoryService.receive(dto, req.user.sub);
  }

  @Post('adjust')
  @ApiOperation({ summary: '在庫調整', description: '在庫数量を調整' })
  async adjust(@Body() dto: AdjustInventoryDto, @Request() req: any) {
    return this.inventoryService.adjust(dto, req.user.sub);
  }
}

