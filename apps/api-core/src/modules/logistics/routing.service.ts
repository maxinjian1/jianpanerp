import { Injectable, Logger } from '@nestjs/common';

interface OrderForRouting {
  id: string;
  companyName?: string | null;
  shippingPrefecture: string;
  deliveryTimeSlot?: string | null;
  paymentMethod: string;
  items: {
    weight?: number | null;
    sizeCode?: number | null;
    quantity: number;
  }[];
}

export enum CarrierCode {
  YAMATO = 'YAMATO',
  SAGAWA = 'SAGAWA',
  FUKUYAMA = 'FUKUYAMA',
  JAPAN_POST = 'JAPAN_POST',
}

export enum ServiceType {
  // Yamato
  YAMATO_TAKKYUBIN = 'YAMATO_TAKKYUBIN',
  YAMATO_COMPACT = 'YAMATO_COMPACT',
  YAMATO_NEKOPOS = 'YAMATO_NEKOPOS',
  YAMATO_COOL = 'YAMATO_COOL',
  
  // Sagawa
  SAGAWA_HIKYAKU = 'SAGAWA_HIKYAKU',
  SAGAWA_LARGE = 'SAGAWA_LARGE',
  SAGAWA_COOL = 'SAGAWA_COOL',
  
  // Fukuyama
  FUKUYAMA_CARGO = 'FUKUYAMA_CARGO',
  FUKUYAMA_PALETTE = 'FUKUYAMA_PALETTE',
  
  // Japan Post
  JAPANPOST_YUPACK = 'JAPANPOST_YUPACK',
  JAPANPOST_CLICKPOST = 'JAPANPOST_CLICKPOST',
}

export interface RoutingResult {
  carrier: CarrierCode;
  serviceType: ServiceType;
  reason: string;
  estimatedCost?: number;
}

@Injectable()
export class RoutingService {
  private readonly logger = new Logger(RoutingService.name);

  /**
   * 智能路由引擎 - 根据订单属性自动选择最佳物流商
   * Smart Routing Engine - Automatically selects the best carrier based on order attributes
   */
  determineCarrier(order: OrderForRouting): RoutingResult {
    this.logger.debug(`Routing order ${order.id}`);

    // 计算总重量和尺寸
    const totalWeight = order.items.reduce(
      (sum, item) => sum + (item.weight || 500) * item.quantity,
      0,
    );
    
    const maxSizeCode = Math.max(
      ...order.items.map((item) => item.sizeCode || 60),
    );

    // ルール1: B2B注文 (会社名あり) → 福山通運優先
    // Rule 1: B2B orders (has company name) -> Fukuyama priority
    if (order.companyName && order.companyName.trim().length > 0) {
      // 大型貨物はパレット便
      if (totalWeight > 30000 || maxSizeCode >= 160) {
        return {
          carrier: CarrierCode.FUKUYAMA,
          serviceType: ServiceType.FUKUYAMA_PALETTE,
          reason: 'B2B大型貨物 → 福山通運パレット便',
        };
      }
      return {
        carrier: CarrierCode.FUKUYAMA,
        serviceType: ServiceType.FUKUYAMA_CARGO,
        reason: 'B2B注文 → 福山通運カーゴ便',
      };
    }

    // ルール2: 代引き → ヤマトか佐川（日本郵便は代引き手数料高い）
    // Rule 2: COD -> Yamato or Sagawa (Japan Post has high COD fees)
    if (order.paymentMethod === 'COD') {
      if (totalWeight <= 2000 && maxSizeCode <= 60) {
        return {
          carrier: CarrierCode.YAMATO,
          serviceType: ServiceType.YAMATO_COMPACT,
          reason: '代引き小型 → ヤマト宅急便コンパクト',
        };
      }
      return {
        carrier: CarrierCode.SAGAWA,
        serviceType: ServiceType.SAGAWA_HIKYAKU,
        reason: '代引き → 佐川飛脚宅配便',
      };
    }

    // ルール3: 離島・僻地 → 日本郵便（到達率高い）
    // Rule 3: Remote islands -> Japan Post (better coverage)
    const remoteAreas = ['沖縄県', '鹿児島県', '長崎県'];
    if (remoteAreas.includes(order.shippingPrefecture)) {
      return {
        carrier: CarrierCode.JAPAN_POST,
        serviceType: ServiceType.JAPANPOST_YUPACK,
        reason: '離島・僻地 → 日本郵便ゆうパック',
      };
    }

    // ルール4: 超小型（ポスト投函可能）→ ネコポスかクリックポスト
    // Rule 4: Very small (can fit in mailbox) -> Nekopos or ClickPost
    if (totalWeight <= 1000 && maxSizeCode <= 60) {
      // 厚さ3cm以下と仮定
      if (totalWeight <= 500) {
        return {
          carrier: CarrierCode.JAPAN_POST,
          serviceType: ServiceType.JAPANPOST_CLICKPOST,
          reason: '超小型 → クリックポスト',
          estimatedCost: 185,
        };
      }
      return {
        carrier: CarrierCode.YAMATO,
        serviceType: ServiceType.YAMATO_NEKOPOS,
        reason: '小型 → ヤマトネコポス',
        estimatedCost: 385,
      };
    }

    // ルール5: 大型貨物 → 佐川ラージサイズ
    // Rule 5: Large items -> Sagawa Large Size
    if (totalWeight > 20000 || maxSizeCode >= 140) {
      return {
        carrier: CarrierCode.SAGAWA,
        serviceType: ServiceType.SAGAWA_LARGE,
        reason: '大型貨物 → 佐川ラージサイズ宅配便',
      };
    }

    // ルール6: 時間指定あり → ヤマト（時間帯精度高い）
    // Rule 6: Time-specified delivery -> Yamato (more accurate)
    if (order.deliveryTimeSlot && order.deliveryTimeSlot !== '0000') {
      return {
        carrier: CarrierCode.YAMATO,
        serviceType: ServiceType.YAMATO_TAKKYUBIN,
        reason: '時間指定 → ヤマト宅急便',
      };
    }

    // デフォルト: 佐川飛脚宅配便（コスト重視）
    // Default: Sagawa (cost-effective)
    return {
      carrier: CarrierCode.SAGAWA,
      serviceType: ServiceType.SAGAWA_HIKYAKU,
      reason: 'デフォルト → 佐川飛脚宅配便',
    };
  }

  /**
   * 一括ルーティング
   * Batch routing for multiple orders
   */
  routeOrders(orders: OrderForRouting[]): Map<string, RoutingResult> {
    const results = new Map<string, RoutingResult>();

    for (const order of orders) {
      results.set(order.id, this.determineCarrier(order));
    }

    return results;
  }

  /**
   * キャリア別に注文を分類
   * Group orders by carrier
   */
  groupByCarrier(orders: OrderForRouting[]): Map<CarrierCode, OrderForRouting[]> {
    const groups = new Map<CarrierCode, OrderForRouting[]>();

    for (const order of orders) {
      const routing = this.determineCarrier(order);
      
      if (!groups.has(routing.carrier)) {
        groups.set(routing.carrier, []);
      }
      groups.get(routing.carrier)!.push(order);
    }

    return groups;
  }
}

