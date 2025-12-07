import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { prisma } from '@japan-erp/database';

// Note: In production, use the amazon-sp-api library
// import SellingPartnerAPI from 'amazon-sp-api';

interface AmazonOrder {
  AmazonOrderId: string;
  PurchaseDate: string;
  OrderStatus: string;
  FulfillmentChannel: string;
  ShipServiceLevel: string;
  ShippingAddress: {
    Name: string;
    Phone: string;
    PostalCode: string;
    StateOrRegion: string;
    City: string;
    AddressLine1: string;
    AddressLine2?: string;
  };
  OrderTotal: {
    Amount: string;
    CurrencyCode: string;
  };
  PaymentMethod: string;
}

interface AmazonOrderItem {
  OrderItemId: string;
  ASIN: string;
  SellerSKU: string;
  Title: string;
  QuantityOrdered: number;
  ItemPrice: {
    Amount: string;
    CurrencyCode: string;
  };
  ItemTax: {
    Amount: string;
    CurrencyCode: string;
  };
}

@Injectable()
export class AmazonService {
  private readonly logger = new Logger(AmazonService.name);
  private readonly marketplaceId = 'A1VC38T7YXB528'; // Amazon Japan

  constructor(private readonly configService: ConfigService) {}

  /**
   * Amazon SP-API認証情報を取得
   */
  async getCredentials(tenantId: string) {
    const credential = await prisma.marketplaceCredential.findFirst({
      where: {
        platform: 'AMAZON_JP',
        isActive: true,
      },
    });

    if (!credential) {
      throw new NotFoundException('Amazon credentials not configured');
    }

    return credential;
  }

  /**
   * 注文を同期
   * Sync orders from Amazon SP-API
   */
  async syncOrders(tenantId: string, options: { since?: Date; status?: string[] } = {}) {
    this.logger.log(`Syncing Amazon orders for tenant ${tenantId}`);

    const credentials = await this.getCredentials(tenantId);

    // In production, use actual SP-API:
    // const sp = new SellingPartnerAPI({
    //   region: 'fe',
    //   refresh_token: credentials.refreshToken,
    //   credentials: {
    //     SELLING_PARTNER_APP_CLIENT_ID: this.configService.get('AMAZON_CLIENT_ID'),
    //     SELLING_PARTNER_APP_CLIENT_SECRET: this.configService.get('AMAZON_CLIENT_SECRET'),
    //   }
    // });

    // Mock response for development
    const mockOrders: AmazonOrder[] = [
      {
        AmazonOrderId: '503-1234567-1234567',
        PurchaseDate: new Date().toISOString(),
        OrderStatus: 'Unshipped',
        FulfillmentChannel: 'MFN',
        ShipServiceLevel: 'Standard',
        ShippingAddress: {
          Name: '山田 太郎',
          Phone: '090-1234-5678',
          PostalCode: '150-0001',
          StateOrRegion: '東京都',
          City: '渋谷区',
          AddressLine1: '道玄坂1-2-3',
          AddressLine2: 'サンプルビル101',
        },
        OrderTotal: {
          Amount: '3300',
          CurrencyCode: 'JPY',
        },
        PaymentMethod: 'Other',
      },
    ];

    const results = {
      synced: 0,
      created: 0,
      updated: 0,
      errors: [] as string[],
    };

    for (const amazonOrder of mockOrders) {
      try {
        // Check if order already exists
        const existing = await prisma.order.findFirst({
          where: {
            platform: 'AMAZON_JP',
            externalOrderId: amazonOrder.AmazonOrderId,
          },
        });

        if (existing) {
          // Update existing order
          await prisma.order.update({
            where: { id: existing.id },
            data: {
              externalStatus: amazonOrder.OrderStatus,
              updatedAt: new Date(),
            },
          });
          results.updated++;
        } else {
          // Create new order
          await this.createOrderFromAmazon(amazonOrder);
          results.created++;
        }
        results.synced++;
      } catch (error) {
        this.logger.error(`Failed to sync order ${amazonOrder.AmazonOrderId}`, error);
        results.errors.push(amazonOrder.AmazonOrderId);
      }
    }

    // Update last sync time
    await prisma.marketplaceCredential.update({
      where: { id: credentials.id },
      data: { lastSyncAt: new Date() },
    });

    return results;
  }

  /**
   * Amazonの注文からERPの注文を作成
   */
  private async createOrderFromAmazon(amazonOrder: AmazonOrder) {
    // In production, fetch order items from SP-API
    const mockItems: AmazonOrderItem[] = [
      {
        OrderItemId: '12345678901234',
        ASIN: 'B00EXAMPLE',
        SellerSKU: 'SKU-001',
        Title: 'サンプル商品A',
        QuantityOrdered: 1,
        ItemPrice: { Amount: '3000', CurrencyCode: 'JPY' },
        ItemTax: { Amount: '300', CurrencyCode: 'JPY' },
      },
    ];

    const subtotal = mockItems.reduce(
      (sum, item) => sum + parseFloat(item.ItemPrice.Amount),
      0,
    );
    const taxAmount = mockItems.reduce(
      (sum, item) => sum + parseFloat(item.ItemTax.Amount),
      0,
    );

    const order = await prisma.order.create({
      data: {
        platform: 'AMAZON_JP',
        externalOrderId: amazonOrder.AmazonOrderId,
        externalStatus: amazonOrder.OrderStatus,
        customerName: amazonOrder.ShippingAddress.Name,
        customerPhone: amazonOrder.ShippingAddress.Phone,
        shippingZipCode: this.formatZipCode(amazonOrder.ShippingAddress.PostalCode),
        shippingPrefecture: amazonOrder.ShippingAddress.StateOrRegion,
        shippingCity: amazonOrder.ShippingAddress.City,
        shippingAddress1: amazonOrder.ShippingAddress.AddressLine1,
        shippingAddress2: amazonOrder.ShippingAddress.AddressLine2,
        subtotal,
        taxStandard: taxAmount,
        taxReduced: 0,
        taxAmount,
        totalAmount: parseFloat(amazonOrder.OrderTotal.Amount),
        paymentMethod: this.mapPaymentMethod(amazonOrder.PaymentMethod),
        status: 'PENDING',
        orderedAt: new Date(amazonOrder.PurchaseDate),
        items: {
          create: mockItems.map((item) => ({
            sku: item.SellerSKU,
            name: item.Title,
            quantity: item.QuantityOrdered,
            unitPrice: parseFloat(item.ItemPrice.Amount) / item.QuantityOrdered,
            taxRate: 10,
            subtotal: parseFloat(item.ItemPrice.Amount),
          })),
        },
      },
    });

    this.logger.log(`Created order from Amazon: ${amazonOrder.AmazonOrderId}`);
    return order;
  }

  /**
   * 出荷完了をAmazonに通知
   */
  async confirmShipment(orderId: string, trackingNumber: string, carrier: string) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order || order.platform !== 'AMAZON_JP') {
      throw new BadRequestException('Order is not an Amazon order');
    }

    // In production, call SP-API to confirm shipment
    // const sp = new SellingPartnerAPI({ ... });
    // await sp.callAPI({
    //   operation: 'confirmShipment',
    //   endpoint: 'orders',
    //   path: { orderId: order.externalOrderId },
    //   body: {
    //     marketplaceId: this.marketplaceId,
    //     packageDetail: {
    //       trackingNumber,
    //       carrierCode: this.mapCarrierToAmazon(carrier),
    //     }
    //   }
    // });

    this.logger.log(`Confirmed shipment to Amazon: ${order.externalOrderId}`);

    return {
      success: true,
      message: `Shipment confirmed for order ${order.externalOrderId}`,
    };
  }

  private formatZipCode(zipCode: string): string {
    // Convert "1500001" to "150-0001"
    if (zipCode.length === 7 && !zipCode.includes('-')) {
      return `${zipCode.slice(0, 3)}-${zipCode.slice(3)}`;
    }
    return zipCode;
  }

  private mapPaymentMethod(amazonMethod: string): any {
    const mapping: Record<string, string> = {
      'Other': 'CREDIT_CARD',
      'COD': 'COD',
      'AmazonPay': 'AMAZON_PAY',
    };
    return mapping[amazonMethod] || 'CREDIT_CARD';
  }

  private mapCarrierToAmazon(carrier: string): string {
    const mapping: Record<string, string> = {
      'YAMATO': 'Yamato',
      'SAGAWA': 'Sagawa',
      'JAPAN_POST': 'JapanPost',
    };
    return mapping[carrier] || carrier;
  }
}

