// AI Service Types - 売上予測・自動補充

// Forecasting
export interface ForecastRequest {
  sku: string;
  productId: string;
  historicalData: SalesDataPoint[];
  forecastDays: number;
  includeSeasonality?: boolean;
  includeHolidays?: boolean;
}

export interface SalesDataPoint {
  date: string;           // ISO date string
  quantity: number;
  revenue?: number;
}

export interface ForecastResponse {
  sku: string;
  productId: string;
  predictions: ForecastPrediction[];
  metrics: ForecastMetrics;
  confidence: number;     // 0-1
  modelUsed: ForecastModel;
  generatedAt: Date;
}

export interface ForecastPrediction {
  date: string;
  predictedQty: number;
  lowerBound: number;     // 下限 (95% CI)
  upperBound: number;     // 上限 (95% CI)
  trend: TrendDirection;
}

export interface ForecastMetrics {
  mae: number;            // Mean Absolute Error
  rmse: number;           // Root Mean Square Error
  mape: number;           // Mean Absolute Percentage Error
}

export enum ForecastModel {
  PROPHET = 'PROPHET',
  LGBM = 'LGBM',
  ARIMA = 'ARIMA',
  ENSEMBLE = 'ENSEMBLE',
}

export enum TrendDirection {
  INCREASING = 'INCREASING',
  DECREASING = 'DECREASING',
  STABLE = 'STABLE',
}

// Restock Suggestions
export interface RestockSuggestion {
  id: string;
  tenantId: string;
  productId: string;
  sku: string;
  productName: string;
  
  // Current status
  currentStock: number;
  reservedQty: number;
  availableQty: number;
  
  // Forecast
  forecastedDemand: number;       // 予測需要 (次の補充リードタイム期間)
  daysUntilStockout: number;      // 在庫切れまでの日数
  
  // Suggestion
  suggestedOrderQty: number;
  suggestedOrderDate: Date;
  urgency: RestockUrgency;
  
  // Economics
  estimatedCost: number;
  potentialLostSales: number;     // 機会損失予測
  
  // Audit
  generatedAt: Date;
  status: SuggestionStatus;
  approvedBy?: string;
  approvedAt?: Date;
}

export enum RestockUrgency {
  CRITICAL = 'CRITICAL',         // 即時対応必要
  HIGH = 'HIGH',                 // 今週中
  MEDIUM = 'MEDIUM',             // 来週
  LOW = 'LOW',                   // 計画的に
}

export enum SuggestionStatus {
  PENDING = 'PENDING',           // レビュー待ち
  APPROVED = 'APPROVED',         // 承認済み
  REJECTED = 'REJECTED',         // 却下
  ORDERED = 'ORDERED',           // 発注済み
  EXPIRED = 'EXPIRED',           // 期限切れ
}

// Demand Analysis
export interface DemandAnalysis {
  productId: string;
  sku: string;
  period: AnalysisPeriod;
  
  // Statistics
  totalSold: number;
  averageDailySales: number;
  standardDeviation: number;
  coefficientOfVariation: number;
  
  // Patterns
  seasonalityIndex: SeasonalityIndex[];
  dayOfWeekPattern: DayOfWeekPattern[];
  
  // Insights
  isHighDemand: boolean;
  isStable: boolean;
  isSeasonal: boolean;
  peakSeasons: string[];          // ['12', '01'] for winter
}

export interface SeasonalityIndex {
  month: number;                  // 1-12
  index: number;                  // relative to average (1.0 = average)
}

export interface DayOfWeekPattern {
  dayOfWeek: number;              // 0-6 (Sunday = 0)
  averageSales: number;
  percentageOfTotal: number;
}

export enum AnalysisPeriod {
  LAST_30_DAYS = 'LAST_30_DAYS',
  LAST_90_DAYS = 'LAST_90_DAYS',
  LAST_180_DAYS = 'LAST_180_DAYS',
  LAST_365_DAYS = 'LAST_365_DAYS',
}

// NLP - Customer Service
export interface CustomerServiceRequest {
  tenantId: string;
  orderId?: string;
  customerId?: string;
  inputText: string;
  language: 'ja' | 'en';
  context?: CustomerServiceContext;
}

export interface CustomerServiceContext {
  previousMessages?: string[];
  orderStatus?: string;
  productInfo?: string;
}

export interface CustomerServiceResponse {
  outputText: string;
  confidence: number;
  suggestedActions: SuggestedAction[];
  sentiment: Sentiment;
  topics: string[];
  needsHumanReview: boolean;
}

export interface SuggestedAction {
  type: ActionType;
  description: string;
  params?: Record<string, unknown>;
}

export enum ActionType {
  SEND_TRACKING = 'SEND_TRACKING',
  ISSUE_REFUND = 'ISSUE_REFUND',
  ESCALATE = 'ESCALATE',
  SEND_FAQ = 'SEND_FAQ',
  NO_ACTION = 'NO_ACTION',
}

export enum Sentiment {
  POSITIVE = 'POSITIVE',
  NEUTRAL = 'NEUTRAL',
  NEGATIVE = 'NEGATIVE',
  URGENT = 'URGENT',
}

// Anomaly Detection
export interface AnomalyAlert {
  id: string;
  tenantId: string;
  type: AnomalyType;
  severity: AlertSeverity;
  
  // Details
  description: string;
  affectedEntity: string;         // productId, orderId, etc.
  affectedValue: number;
  expectedRange: { min: number; max: number };
  
  // Status
  status: AlertStatus;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
  resolvedAt?: Date;
  
  detectedAt: Date;
}

export enum AnomalyType {
  SALES_SPIKE = 'SALES_SPIKE',
  SALES_DROP = 'SALES_DROP',
  INVENTORY_DISCREPANCY = 'INVENTORY_DISCREPANCY',
  UNUSUAL_RETURN_RATE = 'UNUSUAL_RETURN_RATE',
  PRICING_ANOMALY = 'PRICING_ANOMALY',
}

export enum AlertSeverity {
  CRITICAL = 'CRITICAL',
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW',
}

export enum AlertStatus {
  NEW = 'NEW',
  ACKNOWLEDGED = 'ACKNOWLEDGED',
  INVESTIGATING = 'INVESTIGATING',
  RESOLVED = 'RESOLVED',
  DISMISSED = 'DISMISSED',
}

// API DTOs
export interface BatchForecastRequest {
  products: { productId: string; sku: string }[];
  forecastDays: number;
}

export interface BatchForecastResponse {
  forecasts: ForecastResponse[];
  batchId: string;
  totalProducts: number;
  successCount: number;
  failureCount: number;
  processingTimeMs: number;
}

export interface RestockAnalysisRequest {
  productIds?: string[];
  warehouseId?: string;
  urgencyThreshold?: RestockUrgency;
}

export interface RestockAnalysisResponse {
  suggestions: RestockSuggestion[];
  totalPotentialLostSales: number;
  totalEstimatedCost: number;
  generatedAt: Date;
}

