import {
  Injectable,
  NestMiddleware,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { prisma } from '@japan-erp/database';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      tenantId: string;
      tenantSchema: string;
    }
  }
}

@Injectable()
export class TenancyMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TenancyMiddleware.name);

  async use(req: Request, res: Response, next: NextFunction) {
    // 1. Extract Tenant ID from header
    const tenantId = req.headers['x-tenant-id'] as string;

    if (!tenantId) {
      throw new UnauthorizedException('Tenant ID is required (x-tenant-id header)');
    }

    // 2. Validate tenant exists and is active
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new UnauthorizedException(`Tenant not found: ${tenantId}`);
    }

    if (tenant.status === 'SUSPENDED' || tenant.status === 'CANCELLED') {
      throw new UnauthorizedException(`Tenant is ${tenant.status.toLowerCase()}`);
    }

    // 3. Set tenant context on request
    req.tenantId = tenantId;
    req.tenantSchema = tenant.schemaName;

    // 4. Set PostgreSQL search_path for this request
    // This ensures all queries go to the tenant's schema
    try {
      await prisma.$executeRawUnsafe(
        `SET search_path TO "${tenant.schemaName}", "public"`,
      );
    } catch (error) {
      this.logger.error(`Failed to set schema for tenant ${tenantId}`, error);
      throw new UnauthorizedException('Failed to initialize tenant context');
    }

    this.logger.debug(`Tenant context set: ${tenantId} -> ${tenant.schemaName}`);

    next();
  }
}

