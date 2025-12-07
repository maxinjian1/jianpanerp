import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { prisma } from '@japan-erp/database';
import { LoginDto, RegisterDto, AuthResponse } from './dto/auth.dto';

@Injectable()
export class AuthService {
  constructor(private readonly jwtService: JwtService) {}

  async login(dto: LoginDto): Promise<AuthResponse> {
    // Find user by email (across all tenants for login)
    const user = await prisma.user.findFirst({
      where: {
        email: dto.email,
        isActive: true,
      },
      include: {
        tenant: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Check tenant status
    if (user.tenant.status !== 'ACTIVE' && user.tenant.status !== 'TRIAL') {
      throw new UnauthorizedException('Your account has been suspended');
    }

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // Generate JWT token
    const payload = {
      sub: user.id,
      email: user.email,
      tenantId: user.tenantId,
      role: user.role,
      permissions: user.permissions,
    };

    const accessToken = this.jwtService.sign(payload);

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        tenantId: user.tenantId,
        tenantName: user.tenant.name,
      },
    };
  }

  async register(dto: RegisterDto): Promise<AuthResponse> {
    // Check if email already exists
    const existingUser = await prisma.user.findFirst({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    // Create tenant
    const schemaName = `tenant_${Date.now()}`;
    const tenant = await prisma.tenant.create({
      data: {
        name: dto.companyName,
        schemaName,
        subscriptionPlan: 'TRIAL',
        status: 'TRIAL',
        trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days
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

    // Hash password
    const passwordHash = await bcrypt.hash(dto.password, 10);

    // Create admin user
    const user = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: dto.email,
        passwordHash,
        name: dto.name,
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
      },
    });

    // TODO: Create tenant schema in PostgreSQL
    // await createTenantSchema(tenant.id);

    // Generate JWT token
    const payload = {
      sub: user.id,
      email: user.email,
      tenantId: user.tenantId,
      role: user.role,
      permissions: user.permissions,
    };

    const accessToken = this.jwtService.sign(payload);

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        tenantId: user.tenantId,
        tenantName: tenant.name,
      },
    };
  }

  async validateUser(userId: string): Promise<any> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { tenant: true },
    });

    if (!user || !user.isActive) {
      return null;
    }

    return user;
  }
}

