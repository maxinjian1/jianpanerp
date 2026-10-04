// Dropship (直送代行 / 無在庫販売) Types & Profit Calculation
// 卸業者 → 楽天 への直送モデルの利益計算

/**
 * 楽天の販売手数料率 (%) — 店舗の契約プラン・決済方法によって異なるため設定で上書きする
 */
export interface RakutenFeeSettings {
  /** 楽天システム利用料 (がんばれ!プラン 3.5% / スタンダード・メガショップ 2.0〜4.0%) */
  systemFeeRate: number;
  /** 楽天ペイ 決済手数料 (2.5〜3.5%) */
  paymentFeeRate: number;
  /** 楽天スーパーポイント原資 (通常 1%) */
  pointCostRate: number;
  /** アフィリエイト経由売上の平均報酬率 */
  affiliateRate: number;
  /** その他 (R-Messe、楽天スーパーDEALなど) */
  otherFeeRate: number;
}

export const DEFAULT_RAKUTEN_FEES: RakutenFeeSettings = {
  systemFeeRate: 3.5,
  paymentFeeRate: 3.0,
  pointCostRate: 1.0,
  affiliateRate: 0,
  otherFeeRate: 0.1,
};

export interface DropshipProfitInput {
  /** 卸価格 (税込) × 数量 */
  costPrice: number;
  /** 卸業者に支払う送料 (税込) */
  shippingCost: number;
  /** 楽天での販売価格 (税込、送料込みで受け取る額) */
  sellingPrice: number;
  /** 1注文あたりの広告費 (RPPなど) */
  adCostPerOrder?: number;
  fees?: RakutenFeeSettings;
  /** 課税事業者の場合、消費税の納付額 (概算) を差し引く */
  isTaxableBusiness?: boolean;
}

export interface DropshipProfitResult {
  sellingPrice: number;
  totalCost: number;
  rakutenFees: number;
  feeRate: number;
  adCost: number;
  consumptionTax: number;
  profit: number;
  /** 販売価格に対する利益率 (%) */
  profitMargin: number;
  /** 利益が 0 になる販売価格 */
  breakEvenPrice: number | null;
}

const JP_TAX_DIVISOR = 11; // 10% 税込価格に含まれる消費税 = 価格 / 11

export function totalFeeRate(fees: RakutenFeeSettings = DEFAULT_RAKUTEN_FEES): number {
  return (
    fees.systemFeeRate +
    fees.paymentFeeRate +
    fees.pointCostRate +
    fees.affiliateRate +
    fees.otherFeeRate
  );
}

/**
 * RPP 広告の 1 注文あたり広告費 = クリック単価 ÷ 転換率
 */
export function adCostPerOrder(costPerClick: number, conversionRatePercent: number): number {
  if (conversionRatePercent <= 0) return 0;
  return Math.round(costPerClick / (conversionRatePercent / 100));
}

export function calculateDropshipProfit(input: DropshipProfitInput): DropshipProfitResult {
  const fees = input.fees ?? DEFAULT_RAKUTEN_FEES;
  const rate = totalFeeRate(fees) / 100;
  const adCost = input.adCostPerOrder ?? 0;
  const totalCost = input.costPrice + input.shippingCost;

  const rakutenFees = Math.round(input.sellingPrice * rate);
  const expenses = totalCost + rakutenFees + adCost;

  // 売上の消費税 − 仕入・経費の消費税 (すべて10%課税とみなした概算)
  const consumptionTax = input.isTaxableBusiness
    ? Math.max(0, Math.round((input.sellingPrice - expenses) / JP_TAX_DIVISOR))
    : 0;

  const profit = input.sellingPrice - expenses - consumptionTax;

  return {
    sellingPrice: input.sellingPrice,
    totalCost,
    rakutenFees,
    feeRate: totalFeeRate(fees),
    adCost,
    consumptionTax,
    profit,
    profitMargin: input.sellingPrice > 0 ? round1((profit / input.sellingPrice) * 100) : 0,
    breakEvenPrice: suggestSellingPrice({ ...input, targetMarginPercent: 0 }),
  };
}

/**
 * 目標利益率を達成する販売価格 (10円単位で切り上げ)。達成不可能な場合は null
 */
export function suggestSellingPrice(
  input: Omit<DropshipProfitInput, 'sellingPrice'> & { targetMarginPercent: number },
): number | null {
  const fees = input.fees ?? DEFAULT_RAKUTEN_FEES;
  const rate = totalFeeRate(fees) / 100;
  const margin = input.targetMarginPercent / 100;
  const fixedCost = input.costPrice + input.shippingCost + (input.adCostPerOrder ?? 0);

  // 非課税:  P − F − rP = mP
  // 課税:    P − F − rP − (P − F − rP)/11 = mP  →  (1 − 1/11)(P(1 − r) − F) = mP
  const k = input.isTaxableBusiness ? 1 - 1 / JP_TAX_DIVISOR : 1;
  const denominator = k * (1 - rate) - margin;
  if (denominator <= 0) return null;

  const price = (k * fixedCost) / denominator;
  return Math.ceil(price / 10) * 10;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// ============================================
// 発注キュー
// ============================================

export enum DropshipPurchaseStatus {
  PENDING = 'PENDING',
  ORDERED = 'ORDERED',
  SHIPPED = 'SHIPPED',
  CANCELLED = 'CANCELLED',
}

export interface DropshipQueueLine {
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number;
  supplierUrl: string | null;
  supplierSku: string | null;
  /** 卸価格 (税込、1個あたり) */
  costPrice: number | null;
}

/** 1つの楽天注文の中で、同じ卸業者へまとめて発注する単位 */
export interface DropshipQueueGroup {
  supplierId: string;
  supplierName: string;
  supplierWebsiteUrl: string | null;
  /** 卸業者の注文フォームに入力する発送元名義 */
  senderName: string | null;
  purchaseId: string | null;
  status: DropshipPurchaseStatus;
  supplierOrderNo: string | null;
  trackingNumber: string | null;
  carrier: string | null;
  /** 卸価格合計 + 送料 (発注済みで実費入力があれば実費) */
  estimatedCost: number;
  items: DropshipQueueLine[];
}

export interface DropshipQueueOrder {
  orderId: string;
  externalOrderId: string;
  orderedAt: string;
  totalAmount: number;
  customerName: string;
  customerPhone: string;
  /** 卸業者の注文フォームにそのまま貼り付けるお届け先 */
  shippingAddressText: string;
  deliveryDate: string | null;
  deliveryTimeSlot: string | null;
  groups: DropshipQueueGroup[];
  /** 卸業者が紐付いていない商品 (先に商品と卸業者の紐付けが必要) */
  unlinkedItems: DropshipQueueLine[];
  /** 紐付けが揃っている場合のみ計算 */
  profit: DropshipProfitResult | null;
}

/**
 * 卸業者の注文フォームに貼り付けるお届け先テキスト
 */
export function formatShippingAddress(order: {
  customerName: string;
  customerPhone: string;
  companyName?: string | null;
  shippingZipCode: string;
  shippingPrefecture: string;
  shippingCity: string;
  shippingAddress1: string;
  shippingAddress2?: string | null;
}): string {
  const zip = order.shippingZipCode.replace(/^(\d{3})(\d{4})$/, '$1-$2');
  return [
    `〒${zip}`,
    `${order.shippingPrefecture}${order.shippingCity}${order.shippingAddress1}`,
    order.shippingAddress2 || null,
    order.companyName || null,
    `${order.customerName} 様`,
    `TEL: ${order.customerPhone}`,
  ]
    .filter(Boolean)
    .join('\n');
}
