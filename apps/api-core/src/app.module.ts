import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TenancyMiddleware } from './common/middleware/tenancy.middleware';

// Feature Modules
import { AuthModule } from './modules/auth/auth.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { OrdersModule } from './modules/orders/orders.module';
import { ProductsModule } from './modules/products/products.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { LogisticsModule } from './modules/logistics/logistics.module';
import { AmazonModule } from './modules/amazon/amazon.module';
import { RakutenModule } from './modules/rakuten/rakuten.module';
import { AiModule } from './modules/ai/ai.module';
import { HealthModule } from './modules/health/health.module';
import { MarketResearchModule } from './modules/market-research/market-research.module';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),

    // Core modules
    HealthModule,
    AuthModule,
    TenantsModule,

    // Business modules
    OrdersModule,
    ProductsModule,
    InventoryModule,
    LogisticsModule,
    MarketResearchModule,

    // Marketplace integrations
    AmazonModule,
    RakutenModule,

    // AI module
    AiModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Apply tenancy middleware to all routes except auth and health
    consumer
      .apply(TenancyMiddleware)
      .exclude('api/v1/auth/(.*)', 'api/v1/health', 'docs(.*)')
      .forRoutes('*');
  }
}

