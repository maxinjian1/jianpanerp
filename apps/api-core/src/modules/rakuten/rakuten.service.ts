import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { prisma } from '@japan-erp/database';

interface RakutenOrder {
  orderNumber: string;
  orderDatetime: string;
  orderStatus: string;
  orderProgress: number;
  deliveryName: string;
  deliveryTel1: string;
  deliveryZipCode1: string;
  deliveryZipCode2: string;
  deliveryAddress1: string;
  deliveryAddress2: string;
  deliveryAddress3: string;
  shippingModel: number;
  deliveryDate: string;
  deliveryTime: string;
  settlementMethod: string;
  totalPrice: number;
  shippingCharge: number;
  requestPrice: number;
}

interface RakutenOrderItem {
  orderNumber: string;
  itemId: string;
  itemNumber: string;
  itemName: string;
  units: number;
  unitPrice: number;
  taxRate: number;
}

@Injectable()
export class RakutenService {
  private readonly logger = new Logger(RakutenService.name);

  constructor(private readonly configService: ConfigService) {}

  async getCredentials(tenantId: string) {
    const credential = await prisma.marketplaceCredential.findFirst({
      where: {
        platform: 'RAKUTEN',
        isActive: true,
      },
    });

    if (!credential) {
      throw new NotFoundException('Rakuten credentials not configured');
    }

    return credential;
  }

  /**
   * 楽天RMS APIから注文を同期
   */
  async syncOrders(tenantId: string, options: { since?: Date; status?: number[] } = {}) {
    this.logger.log(`Syncing Rakuten orders for tenant ${tenantId}`);

    const credentials = await this.getCredentials(tenantId);

    // In production, call Rakuten RMS API
    // const response = await axios.post('https://api.rms.rakuten.co.jp/es/2.0/order/searchOrder/', {
    //   serviceSecret: credentials.refreshToken,
    //   licenseKey: this.configService.get('RAKUTEN_LICENSE_KEY'),
    //   requestData: {
    //     orderProgress: [100, 200], // 未発送・発送待ち
    //     dateType: 1,
    //     startDatetime: options.since?.toISOString(),
    //   }
    // });

    // Mock response for development
    const mockOrders: RakutenOrder[] = [
      {
        orderNumber: '312345-20231201-00001',
        orderDatetime: new Date().toISOString(),
        orderStatus: '100', // 注文確認待ち
        orderProgress: 100,
        deliveryName: '鈴木 花子',
        deliveryTel1: '080-9876-5432',
        deliveryZipCode1: '542',
        deliveryZipCode2: '0081',
        deliveryAddress1: '大阪府',
        deliveryAddress2: '大阪市中央区',
        deliveryAddress3: '心斎橋筋1-2-3',
        shippingModel: 0, // 宅配便
        deliveryDate: '2023-12-05',
        deliveryTime: '1618',
        settlementMethod: 'credit_card',
        totalPrice: 5500,
        shippingCharge: 500,
        requestPrice: 6050,
      },
    ];

    const results = {
      synced: 0,
      created: 0,
      updated: 0,
      errors: [] as string[],
    };

    for (const rakutenOrder of mockOrders) {
      try {
        const existing = await prisma.order.findFirst({
          where: {
            platform: 'RAKUTEN',
            externalOrderId: rakutenOrder.orderNumber,
          },
        });

        if (existing) {
          await prisma.order.update({
            where: { id: existing.id },
            data: {
              externalStatus: rakutenOrder.orderStatus,
              updatedAt: new Date(),
            },
          });
          results.updated++;
        } else {
          await this.createOrderFromRakuten(rakutenOrder);
          results.created++;
        }
        results.synced++;
      } catch (error) {
        this.logger.error(`Failed to sync order ${rakutenOrder.orderNumber}`, error);
        results.errors.push(rakutenOrder.orderNumber);
      }
    }

    await prisma.marketplaceCredential.update({
      where: { id: credentials.id },
      data: { lastSyncAt: new Date() },
    });

    return results;
  }

  private async createOrderFromRakuten(rakutenOrder: RakutenOrder) {
    // Mock order items
    const mockItems: RakutenOrderItem[] = [
      {
        orderNumber: rakutenOrder.orderNumber,
        itemId: '10000001',
        itemNumber: 'SKU-002',
        itemName: 'サンプル商品B',
        units: 2,
        unitPrice: 2500,
        taxRate: 10,
      },
    ];

    const subtotal = mockItems.reduce(
      (sum, item) => sum + item.unitPrice * item.units,
      0,
    );
    const taxAmount = subtotal * 0.1;

    const zipCode = `${rakutenOrder.deliveryZipCode1}-${rakutenOrder.deliveryZipCode2}`;

    const order = await prisma.order.create({
      data: {
        platform: 'RAKUTEN',
        externalOrderId: rakutenOrder.orderNumber,
        externalStatus: rakutenOrder.orderStatus,
        customerName: rakutenOrder.deliveryName,
        customerPhone: rakutenOrder.deliveryTel1,
        shippingZipCode: zipCode,
        shippingPrefecture: rakutenOrder.deliveryAddress1,
        shippingCity: rakutenOrder.deliveryAddress2,
        shippingAddress1: rakutenOrder.deliveryAddress3,
        deliveryDate: rakutenOrder.deliveryDate ? new Date(rakutenOrder.deliveryDate) : null,
        deliveryTimeSlot: rakutenOrder.deliveryTime,
        subtotal,
        shippingFee: rakutenOrder.shippingCharge,
        taxStandard: taxAmount,
        taxReduced: 0,
        taxAmount,
        totalAmount: rakutenOrder.requestPrice,
        paymentMethod: this.mapPaymentMethod(rakutenOrder.settlementMethod),
        status: 'PENDING',
        orderedAt: new Date(rakutenOrder.orderDatetime),
        items: {
          create: mockItems.map((item) => ({
            sku: item.itemNumber,
            name: item.itemName,
            quantity: item.units,
            unitPrice: item.unitPrice,
            taxRate: item.taxRate,
            subtotal: item.unitPrice * item.units,
          })),
        },
      },
    });

    this.logger.log(`Created order from Rakuten: ${rakutenOrder.orderNumber}`);
    return order;
  }

  /**
   * 楽天に出荷完了を通知
   */
  async confirmShipment(orderId: string, trackingNumber: string, carrier: string) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order || order.platform !== 'RAKUTEN') {
      throw new NotFoundException('Order is not a Rakuten order');
    }

    // In production, call Rakuten RMS API
    // await axios.post('https://api.rms.rakuten.co.jp/es/2.0/order/updateOrderShipping/', {
    //   orderNumber: order.externalOrderId,
    //   shippingDetailModelList: [{
    //     shippingCompanyCode: this.mapCarrierToRakuten(carrier),
    //     shippingNumber: trackingNumber,
    //   }]
    // });

    this.logger.log(`Confirmed shipment to Rakuten: ${order.externalOrderId}`);

    return {
      success: true,
      message: `Shipment confirmed for order ${order.externalOrderId}`,
    };
  }

  private mapPaymentMethod(rakutenMethod: string): any {
    const mapping: Record<string, string> = {
      'credit_card': 'CREDIT_CARD',
      'bank_transfer': 'BANK_TRANSFER',
      'convenience_store': 'CONVENIENCE_STORE',
      'cash_on_delivery': 'COD',
      'rakuten_pay': 'RAKUTEN_PAY',
    };
    return mapping[rakutenMethod] || 'CREDIT_CARD';
  }

  private mapCarrierToRakuten(carrier: string): number {
    const mapping: Record<string, number> = {
      'YAMATO': 1001,
      'SAGAWA': 1002,
      'JAPAN_POST': 1003,
    };
    return mapping[carrier] || 0;
  }
}

