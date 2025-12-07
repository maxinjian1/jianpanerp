// Multi-tenant SaaS Types

export interface Tenant {
  id: string;
  name: string;
  schemaName: string;
  subscriptionPlan: SubscriptionPlan;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  settings: TenantSettings;
  status: TenantStatus;
  createdAt: Date;
  updatedAt: Date;
}

export enum SubscriptionPlan {
  STARTER = 'STARTER',       // 月額 ¥29,800 - 1店舗、1000SKU
  GROWTH = 'GROWTH',         // 月額 ¥79,800 - 3店舗、5000SKU
  ENTERPRISE = 'ENTERPRISE', // 月額 ¥198,000 - 無制限
}

export enum TenantStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  TRIAL = 'TRIAL',
  CANCELLED = 'CANCELLED',
}

export interface TenantSettings {
  // General
  timezone: string; // 'Asia/Tokyo'
  locale: string;   // 'ja-JP'
  currency: string; // 'JPY'
  
  // Tax settings (Invoice制度対応)
  taxRegistrationNumber?: string; // T1234567890123
  enableReducedTaxRate: boolean;  // 軽減税率対応
  
  // Marketplace connections
  amazonEnabled: boolean;
  rakutenEnabled: boolean;
  yahooEnabled: boolean;
  
  // Logistics preferences
  defaultCarrier: CarrierCode;
  enableAutoRouting: boolean;
}

export type CarrierCode = 'YAMATO' | 'SAGAWA' | 'FUKUYAMA' | 'JAPAN_POST';

export interface User {
  id: string;
  tenantId: string;
  email: string;
  passwordHash: string;
  name: string;
  role: UserRole;
  permissions: Permission[];
  isActive: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export enum UserRole {
  ADMIN = 'ADMIN',       // 管理者
  MANAGER = 'MANAGER',   // マネージャー
  OPERATOR = 'OPERATOR', // オペレーター
  VIEWER = 'VIEWER',     // 閲覧のみ
}

export enum Permission {
  // Orders
  ORDER_VIEW = 'ORDER_VIEW',
  ORDER_EDIT = 'ORDER_EDIT',
  ORDER_CANCEL = 'ORDER_CANCEL',
  
  // Inventory
  INVENTORY_VIEW = 'INVENTORY_VIEW',
  INVENTORY_ADJUST = 'INVENTORY_ADJUST',
  
  // Products
  PRODUCT_VIEW = 'PRODUCT_VIEW',
  PRODUCT_EDIT = 'PRODUCT_EDIT',
  
  // Logistics
  LOGISTICS_VIEW = 'LOGISTICS_VIEW',
  LOGISTICS_SHIP = 'LOGISTICS_SHIP',
  
  // Reports
  REPORT_VIEW = 'REPORT_VIEW',
  REPORT_EXPORT = 'REPORT_EXPORT',
  
  // Settings
  SETTINGS_VIEW = 'SETTINGS_VIEW',
  SETTINGS_EDIT = 'SETTINGS_EDIT',
  
  // Users
  USER_MANAGE = 'USER_MANAGE',
}

export interface AuthTokenPayload {
  userId: string;
  tenantId: string;
  role: UserRole;
  permissions: Permission[];
}

