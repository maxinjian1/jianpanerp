import { Controller, Get, Patch, Body, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiSecurity } from '@nestjs/swagger';
import { TenantsService } from './tenants.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UpdateTenantSettingsDto } from './dto/tenant.dto';

@ApiTags('tenants')
@Controller('tenants')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@ApiSecurity('tenant-id')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get('current')
  @ApiOperation({ summary: '現在のテナント情報', description: '現在のテナント情報を取得' })
  async getCurrentTenant(@Request() req: any) {
    return this.tenantsService.getTenant(req.tenantId);
  }

  @Patch('settings')
  @ApiOperation({ summary: 'テナント設定更新', description: 'テナントの設定を更新' })
  async updateSettings(@Request() req: any, @Body() dto: UpdateTenantSettingsDto) {
    return this.tenantsService.updateSettings(req.tenantId, dto);
  }

  @Get('users')
  @ApiOperation({ summary: 'ユーザー一覧', description: 'テナント内のユーザー一覧を取得' })
  async getUsers(@Request() req: any) {
    return this.tenantsService.getUsers(req.tenantId);
  }
}

