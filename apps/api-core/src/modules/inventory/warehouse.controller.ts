import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiSecurity } from '@nestjs/swagger';
import { WarehouseService } from './warehouse.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateWarehouseDto, CreateZoneDto, CreateLocationDto } from './dto/warehouse.dto';

@ApiTags('warehouses')
@Controller('warehouses')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@ApiSecurity('tenant-id')
export class WarehouseController {
  constructor(private readonly warehouseService: WarehouseService) {}

  @Get()
  @ApiOperation({ summary: '倉庫一覧', description: '倉庫一覧を取得' })
  async findAll() {
    return this.warehouseService.findAll();
  }

  @Get('default')
  @ApiOperation({ summary: 'デフォルト倉庫', description: 'デフォルト倉庫を取得' })
  async getDefault() {
    return this.warehouseService.getDefaultWarehouse();
  }

  @Get(':id')
  @ApiOperation({ summary: '倉庫詳細', description: '倉庫の詳細（ゾーン・ロケーション含む）' })
  async findOne(@Param('id') id: string) {
    return this.warehouseService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: '倉庫作成', description: '新規倉庫を作成' })
  async create(@Body() dto: CreateWarehouseDto) {
    return this.warehouseService.create(dto);
  }

  @Post(':id/zones')
  @ApiOperation({ summary: 'ゾーン作成', description: '倉庫内にゾーンを作成' })
  async createZone(@Param('id') id: string, @Body() dto: CreateZoneDto) {
    return this.warehouseService.createZone(id, dto);
  }

  @Post('zones/:zoneId/locations')
  @ApiOperation({ summary: 'ロケーション作成', description: 'ゾーン内にロケーションを作成' })
  async createLocation(@Param('zoneId') zoneId: string, @Body() dto: CreateLocationDto) {
    return this.warehouseService.createLocation(zoneId, dto);
  }

  @Patch(':id/set-default')
  @ApiOperation({ summary: 'デフォルト設定', description: 'デフォルト倉庫を設定' })
  async setDefault(@Param('id') id: string) {
    return this.warehouseService.setDefault(id);
  }
}

