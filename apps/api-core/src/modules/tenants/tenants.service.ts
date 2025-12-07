import { Injectable, NotFoundException } from '@nestjs/common';
import { prisma } from '@japan-erp/database';
import { UpdateTenantSettingsDto } from './dto/tenant.dto';

@Injectable()
export class TenantsService {
  async getTenant(tenantId: string) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    return tenant;
  }

  async updateSettings(tenantId: string, dto: UpdateTenantSettingsDto) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const currentSettings = tenant.settings as Record<string, any>;
    const updatedSettings = {
      ...currentSettings,
      ...dto,
    };

    return prisma.tenant.update({
      where: { id: tenantId },
      data: {
        settings: updatedSettings,
      },
    });
  }

  async getUsers(tenantId: string) {
    return prisma.user.findMany({
      where: { tenantId },
      select: {
        id: true,
        email: true,
        name: true,
        nameKana: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });
  }

  async updateSubscription(tenantId: string, plan: 'STARTER' | 'GROWTH' | 'ENTERPRISE') {
    return prisma.tenant.update({
      where: { id: tenantId },
      data: {
        subscriptionPlan: plan,
        status: 'ACTIVE',
        trialEndsAt: null,
      },
    });
  }
}

