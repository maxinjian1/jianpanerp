// Common Types - 共通型定義

// API Response wrapper
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta?: ResponseMeta;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  stack?: string;           // dev環境のみ
}

export interface ResponseMeta {
  timestamp: Date;
  requestId: string;
  version: string;
}

// Pagination
export interface PaginatedResponse<T> {
  items: T[];
  pagination: PaginationInfo;
}

export interface PaginationInfo {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// Date Range
export interface DateRange {
  startDate: Date;
  endDate: Date;
}

// Address (日本形式)
export interface JapaneseAddress {
  zipCode: string;              // 123-4567
  prefecture: string;           // 都道府県
  city: string;                 // 市区町村
  address1: string;             // 番地
  address2?: string;            // 建物名・部屋番号
}

// 都道府県コード (JIS X 0401)
export const PREFECTURES = {
  '01': '北海道',
  '02': '青森県',
  '03': '岩手県',
  '04': '宮城県',
  '05': '秋田県',
  '06': '山形県',
  '07': '福島県',
  '08': '茨城県',
  '09': '栃木県',
  '10': '群馬県',
  '11': '埼玉県',
  '12': '千葉県',
  '13': '東京都',
  '14': '神奈川県',
  '15': '新潟県',
  '16': '富山県',
  '17': '石川県',
  '18': '福井県',
  '19': '山梨県',
  '20': '長野県',
  '21': '岐阜県',
  '22': '静岡県',
  '23': '愛知県',
  '24': '三重県',
  '25': '滋賀県',
  '26': '京都府',
  '27': '大阪府',
  '28': '兵庫県',
  '29': '奈良県',
  '30': '和歌山県',
  '31': '鳥取県',
  '32': '島根県',
  '33': '岡山県',
  '34': '広島県',
  '35': '山口県',
  '36': '徳島県',
  '37': '香川県',
  '38': '愛媛県',
  '39': '高知県',
  '40': '福岡県',
  '41': '佐賀県',
  '42': '長崎県',
  '43': '熊本県',
  '44': '大分県',
  '45': '宮崎県',
  '46': '鹿児島県',
  '47': '沖縄県',
} as const;

export type PrefectureCode = keyof typeof PREFECTURES;
export type PrefectureName = typeof PREFECTURES[PrefectureCode];

// Money
export interface Money {
  amount: number;
  currency: 'JPY' | 'USD' | 'EUR';
}

// File upload
export interface FileUpload {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  url: string;
  uploadedAt: Date;
}

// Audit log
export interface AuditLog {
  id: string;
  tenantId: string;
  userId: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  previousValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  timestamp: Date;
}

export enum AuditAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  VIEW = 'VIEW',
  EXPORT = 'EXPORT',
  LOGIN = 'LOGIN',
  LOGOUT = 'LOGOUT',
}

// Notification
export interface Notification {
  id: string;
  tenantId: string;
  userId?: string;
  type: NotificationType;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  isRead: boolean;
  readAt?: Date;
  createdAt: Date;
}

export enum NotificationType {
  INFO = 'INFO',
  SUCCESS = 'SUCCESS',
  WARNING = 'WARNING',
  ERROR = 'ERROR',
  ORDER_NEW = 'ORDER_NEW',
  ORDER_SHIPPED = 'ORDER_SHIPPED',
  INVENTORY_LOW = 'INVENTORY_LOW',
  RESTOCK_SUGGESTION = 'RESTOCK_SUGGESTION',
}

// Job Queue
export interface QueueJob {
  id: string;
  tenantId: string;
  type: JobType;
  status: JobStatus;
  payload: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: string;
  attempts: number;
  maxAttempts: number;
  scheduledAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
}

export enum JobType {
  SYNC_ORDERS = 'SYNC_ORDERS',
  GENERATE_CSV = 'GENERATE_CSV',
  FORECAST = 'FORECAST',
  SEND_EMAIL = 'SEND_EMAIL',
  EXPORT_REPORT = 'EXPORT_REPORT',
}

export enum JobStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

// API Rate Limiting (Amazon/Rakuten用)
export interface RateLimitConfig {
  requestsPerSecond: number;
  burstLimit: number;
  retryAfterSeconds: number;
}

export interface RateLimitStatus {
  remainingRequests: number;
  resetAt: Date;
  isLimited: boolean;
}

// Encryption (APPI準拠)
export interface EncryptedField {
  ciphertext: string;
  iv: string;
  tag: string;
  algorithm: 'aes-256-gcm';
}

// Health check
export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  uptime: number;
  services: ServiceHealth[];
}

export interface ServiceHealth {
  name: string;
  status: 'up' | 'down';
  latency?: number;
  lastChecked: Date;
  error?: string;
}

// Feature flags
export interface FeatureFlag {
  key: string;
  enabled: boolean;
  tenantOverrides?: Record<string, boolean>;
}

// Search
export interface SearchParams {
  query: string;
  filters?: Record<string, unknown>;
  page?: number;
  limit?: number;
}

export interface SearchResult<T> {
  items: T[];
  totalCount: number;
  facets?: Record<string, FacetCount[]>;
}

export interface FacetCount {
  value: string;
  count: number;
}

