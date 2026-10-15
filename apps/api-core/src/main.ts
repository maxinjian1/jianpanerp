import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap() {
  // rawBody: Shopify webhook の HMAC 検証に必要
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  // 採集データ取り込み（/dropship/import）は 1 バッチ数百 KB → 既定 100KB では 413 になる
  app.useBodyParser('json', { limit: '20mb' });
  app.useBodyParser('urlencoded', { limit: '20mb', extended: true });

  // Global prefix
  app.setGlobalPrefix('api/v1');

  // CORS
  app.enableCors({
    origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
    credentials: true,
  });

  // Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Swagger API Documentation
  const config = new DocumentBuilder()
    .setTitle('Japan Omni-EC ERP API')
    .setDescription('AI-Driven SaaS ERP for Japan E-commerce')
    .setVersion('1.0')
    .addBearerAuth()
    .addApiKey({ type: 'apiKey', name: 'x-tenant-id', in: 'header' }, 'tenant-id')
    .addTag('auth', '認証・認可')
    .addTag('orders', '受注管理 (OMS)')
    .addTag('products', '商品マスタ (MDM)')
    .addTag('inventory', '在庫管理 (WMS)')
    .addTag('logistics', '物流管理 (TMS)')
    .addTag('ai', 'AI機能')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const port = process.env.PORT || 4000;
  await app.listen(port);

  console.log(`🚀 Japan ERP API running on http://localhost:${port}`);
  console.log(`📚 API Documentation: http://localhost:${port}/docs`);
}

bootstrap();

