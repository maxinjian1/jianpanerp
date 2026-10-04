import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiSecurity, ApiQuery } from '@nestjs/swagger';
import { DropshipService } from './dropship.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CreateSupplierDto,
  UpdateSupplierDto,
  LinkSupplierProductDto,
  UpdateSupplierProductDto,
  ProfitCalculationDto,
  MarkOrderedDto,
  MarkShippedDto,
  CancelPurchaseDto,
} from './dto/dropship.dto';

@ApiTags('dropship')
@Controller('dropship')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@ApiSecurity('tenant-id')
export class DropshipController {
  constructor(private readonly dropshipService: DropshipService) {}

  // --- Suppliers ---

  @Get('suppliers')
  @ApiOperation({ summary: '卸業者一覧', description: '直送契約を結んだ卸業者の一覧' })
  async findSuppliers() {
    return this.dropshipService.findSuppliers();
  }

  @Post('suppliers')
  @ApiOperation({ summary: '卸業者登録' })
  async createSupplier(@Body() dto: CreateSupplierDto) {
    return this.dropshipService.createSupplier(dto);
  }

  @Patch('suppliers/:id')
  @ApiOperation({ summary: '卸業者更新' })
  async updateSupplier(@Param('id') id: string, @Body() dto: UpdateSupplierDto) {
    return this.dropshipService.updateSupplier(id, dto);
  }

  // --- Supplier products ---

  @Get('supplier-products')
  @ApiOperation({ summary: '仕入先商品一覧', description: '商品と卸サイトの紐付け (現在の販売価格での利益付き)' })
  @ApiQuery({ name: 'supplierId', required: false })
  @ApiQuery({ name: 'productId', required: false })
  async findSupplierProducts(
    @Request() req: any,
    @Query('supplierId') supplierId?: string,
    @Query('productId') productId?: string,
  ) {
    return this.dropshipService.findSupplierProducts(req.tenantId, { supplierId, productId });
  }

  @Post('supplier-products')
  @ApiOperation({ summary: '仕入先商品紐付け', description: '自社商品に卸サイトの商品ページ・卸価格を紐付け' })
  async linkSupplierProduct(@Body() dto: LinkSupplierProductDto) {
    return this.dropshipService.linkSupplierProduct(dto);
  }

  @Patch('supplier-products/:id')
  @ApiOperation({ summary: '仕入先商品更新', description: '卸価格の変更・欠品の記録' })
  async updateSupplierProduct(@Param('id') id: string, @Body() dto: UpdateSupplierProductDto) {
    return this.dropshipService.updateSupplierProduct(id, dto);
  }

  @Delete('supplier-products/:id')
  @ApiOperation({ summary: '仕入先商品紐付け解除' })
  async unlinkSupplierProduct(@Param('id') id: string) {
    return this.dropshipService.unlinkSupplierProduct(id);
  }

  // --- Profit ---

  @Post('profit/calculate')
  @ApiOperation({ summary: '利益計算', description: '卸価格・楽天手数料・広告費から利益と推奨販売価格を計算' })
  async calculateProfit(@Request() req: any, @Body() dto: ProfitCalculationDto) {
    return this.dropshipService.calculateProfit(req.tenantId, dto);
  }

  // --- Purchase queue ---

  @Get('queue')
  @ApiOperation({ summary: '発注待ち一覧', description: '卸業者へ発注が必要な楽天注文 (お届け先・卸サイトURL付き)' })
  async getQueue(@Request() req: any) {
    return this.dropshipService.getQueue(req.tenantId);
  }

  @Post('queue/:orderId/ordered')
  @ApiOperation({ summary: '発注済みにする', description: '卸サイトで発注した後に記録' })
  async markOrdered(@Param('orderId') orderId: string, @Body() dto: MarkOrderedDto) {
    return this.dropshipService.markOrdered(orderId, dto);
  }

  @Post('queue/:orderId/shipped')
  @ApiOperation({ summary: '発送済みにする', description: '追跡番号を記録し、楽天へ発送通知' })
  async markShipped(
    @Request() req: any,
    @Param('orderId') orderId: string,
    @Body() dto: MarkShippedDto,
  ) {
    return this.dropshipService.markShipped(req.tenantId, orderId, dto);
  }

  @Post('queue/:orderId/cancel')
  @ApiOperation({ summary: '発注キャンセル', description: '卸業者で欠品の場合など。次の優先順位の卸業者が候補になる' })
  async cancelPurchase(@Param('orderId') orderId: string, @Body() dto: CancelPurchaseDto) {
    return this.dropshipService.cancelPurchase(orderId, dto);
  }
}
