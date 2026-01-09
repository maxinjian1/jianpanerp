/**
 * 创建演示用户脚本
 * 运行: npx ts-node src/scripts/create-demo-user.ts
 */

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function createDemoUser() {
  try {
    console.log('🔍 检查演示用户是否存在...');

    // 检查是否已存在演示租户
    let tenant = await prisma.tenant.findFirst({
      where: {
        name: 'Demo Company',
      },
    });

    if (!tenant) {
      console.log('📦 创建演示租户...');
      tenant = await prisma.tenant.create({
        data: {
          name: 'Demo Company',
          schemaName: `tenant_demo_${Date.now()}`,
          subscriptionPlan: 'STARTER',
          status: 'TRIAL',
          trialEndsAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
          settings: {
            timezone: 'Asia/Tokyo',
            locale: 'ja-JP',
            currency: 'JPY',
            enableReducedTaxRate: true,
            amazonEnabled: false,
            rakutenEnabled: false,
            yahooEnabled: false,
            defaultCarrier: 'SAGAWA',
            enableAutoRouting: true,
          },
        },
      });
      console.log(`✅ 租户创建成功: ${tenant.id}`);
    } else {
      console.log(`✅ 租户已存在: ${tenant.id}`);
    }

    // 检查是否已存在演示用户
    const existingUser = await prisma.user.findFirst({
      where: {
        email: 'demo@japan-erp.com',
        tenantId: tenant.id,
      },
    });

    if (existingUser) {
      console.log('✅ 演示用户已存在');
      console.log(`   邮箱: demo@japan-erp.com`);
      console.log(`   密码: admin123456`);
      return;
    }

    console.log('👤 创建演示用户...');
    const passwordHash = await bcrypt.hash('admin123456', 10);

    const user = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: 'demo@japan-erp.com',
        passwordHash,
        name: 'Demo Admin',
        role: 'ADMIN',
        permissions: JSON.stringify([
          'ORDER_VIEW', 'ORDER_EDIT', 'ORDER_CANCEL',
          'INVENTORY_VIEW', 'INVENTORY_ADJUST',
          'PRODUCT_VIEW', 'PRODUCT_EDIT',
          'LOGISTICS_VIEW', 'LOGISTICS_SHIP',
          'REPORT_VIEW', 'REPORT_EXPORT',
          'SETTINGS_VIEW', 'SETTINGS_EDIT',
          'USER_MANAGE',
        ]),
        isActive: true,
      },
    });

    console.log('✅ 演示用户创建成功！');
    console.log('');
    console.log('═══════════════════════════════════════════════════════');
    console.log('📧 登录信息:');
    console.log('   邮箱: demo@japan-erp.com');
    console.log('   密码: admin123456');
    console.log('═══════════════════════════════════════════════════════');
  } catch (error) {
    console.error('❌ 创建演示用户失败:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

createDemoUser();

