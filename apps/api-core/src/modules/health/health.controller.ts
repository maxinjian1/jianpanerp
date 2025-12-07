import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { prisma } from '@japan-erp/database';

@ApiTags('health')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'ヘルスチェック', description: 'API サーバーの状態確認' })
  async check() {
    const startTime = Date.now();
    
    // Check database connection
    let dbStatus = 'up';
    let dbLatency = 0;
    try {
      const dbStart = Date.now();
      await prisma.$queryRaw`SELECT 1`;
      dbLatency = Date.now() - dbStart;
    } catch (error) {
      dbStatus = 'down';
    }

    return {
      status: dbStatus === 'up' ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      uptime: process.uptime(),
      services: [
        {
          name: 'database',
          status: dbStatus,
          latency: dbLatency,
        },
      ],
      responseTime: Date.now() - startTime,
    };
  }
}

