/**
 * 简化版后端启动文件 - 用于本地开发测试
 * Simplified backend for local development
 */
import { NestFactory } from '@nestjs/core';
import { Module, Controller, Get, Post, Body } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

// Simple health controller
@Controller()
class AppController {
  @Get()
  getHello() {
    return {
      message: '🇯🇵 Japan Omni-EC ERP API',
      status: 'running',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('health')
  getHealth() {
    return {
      status: 'healthy',
      version: '1.0.0',
      uptime: process.uptime(),
    };
  }

  @Post('api/v1/auth/login')
  login(@Body() body: any) {
    return {
      accessToken: 'mock-jwt-token-12345',
      user: {
        id: 'user-1',
        email: body.email,
        name: 'Demo User',
        role: 'ADMIN',
        tenantId: 'tenant-1',
        tenantName: 'Demo Company',
      },
    };
  }

  @Post('api/v1/auth/register')
  register(@Body() body: any) {
    return {
      accessToken: 'mock-jwt-token-new-user',
      user: {
        id: 'user-new',
        email: body.email,
        name: body.name,
        role: 'ADMIN',
        tenantId: 'tenant-new',
        tenantName: body.companyName,
      },
    };
  }

  @Get('api/v1/orders')
  getOrders() {
    return {
      items: [
        {
          id: 'ORD-2024-001234',
          platform: 'Amazon',
          customer: '山田太郎',
          amount: 12800,
          status: '出荷待ち',
        },
        {
          id: 'ORD-2024-001233',
          platform: '楽天',
          customer: '鈴木花子',
          amount: 8500,
          status: '出荷完了',
        },
      ],
      pagination: {
        page: 1,
        limit: 20,
        totalItems: 2,
      },
    };
  }

  @Get('api/v1/products')
  getProducts() {
    return {
      items: [
        {
          id: '1',
          sku: 'SKU-001',
          name: 'プレミアム緑茶 100g',
          price: 1500,
          stock: 120,
        },
        {
          id: '2',
          sku: 'SKU-002',
          name: '抹茶パウダー 50g',
          price: 2800,
          stock: 45,
        },
      ],
    };
  }

  @Get('api/v1/inventory/low-stock')
  getLowStock() {
    return [
      { sku: 'SKU-001', name: 'プレミアム緑茶 100g', stock: 12, reorderPoint: 20 },
      { sku: 'SKU-023', name: '抹茶パウダー 50g', stock: 5, reorderPoint: 15 },
    ];
  }
}

@Module({
  controllers: [AppController],
})
class AppModule {}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // CORS
  app.enableCors({
    origin: true, // Allow all origins for local sharing
    credentials: true,
  });

  // Swagger
  const config = new DocumentBuilder()
    .setTitle('Japan Omni-EC ERP API')
    .setDescription('AI-Driven SaaS ERP for Japan E-commerce')
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const port = process.env.PORT || 4000;
  await app.listen(port, '0.0.0.0');

  console.log('');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  🇯🇵 Japan Omni-EC ERP API 启动成功!                      ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`  🚀 API服务:    http://localhost:${port}`);
  console.log(`  📚 API文档:    http://localhost:${port}/docs`);
  console.log('');
}

bootstrap();
