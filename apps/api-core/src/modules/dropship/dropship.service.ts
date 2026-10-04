import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { prisma } from '@japan-erp/database';
import {
  DEFAULT_RAKUTEN_FEES,
  DropshipPurchaseStatus,
  DropshipQueueGroup,
  DropshipQueueLine,
  DropshipQueueOrder,
  RakutenFeeSettings,
  calculateDropshipProfit,
  formatShippingAddress,
  suggestSellingPrice,
} from '@japan-erp/shared-types';
import { RakutenService } from '../rakuten/rakuten.service';
import {
  CreateSupplierDto,
  UpdateSupplierDto,
  LinkSupplierProductDto,
  UpdateSupplierProductDto,
  ProfitCalculationDto,
  MarkOrderedDto,
  MarkShippedDto,
  CancelPurchaseDto,
} from './dto/dropship.dto';

// 卸業者への発注が必要な (まだ発送されていない) 注文ステータス
const OPEN_ORDER_STATUSES = ['PENDING', 'CONFIRMED', 'PROCESSING', 'ON_HOLD'] as const;

interface ProfitSettings {
  fees: RakutenFeeSettings;
  isTaxableBusiness: boolean;
}

@Injectable()
export class DropshipService {
  private readonly logger = new Logger(DropshipService.name);

  constructor(private readonly rakutenService: RakutenService) {}

  // ============================================
  // Suppliers
  // ============================================

  async findSuppliers() {
    return prisma.supplier.findMany({
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { products: true } } },
    });
  }

  async createSupplier(dto: CreateSupplierDto) {
    return prisma.supplier.create({ data: dto });
  }

  async updateSupplier(id: string, dto: UpdateSupplierDto) {
    await this.getSupplier(id);
    return prisma.supplier.update({ where: { id }, data: dto });
  }

  private async getSupplier(id: string) {
    const supplier = await prisma.supplier.findUnique({ where: { id } });
    if (!supplier) {
      throw new NotFoundException(`Supplier not found: ${id}`);
    }
    return supplier;
  }

  // ============================================
  // Supplier products (商品 ⇔ 卸サイト)
  // ============================================

  async findSupplierProducts(tenantId: string, filters: { supplierId?: string; productId?: string }) {
    const settings = await this.getProfitSettings(tenantId);
    const links = await prisma.supplierProduct.findMany({
      where: {
        supplierId: filters.supplierId,
        productId: filters.productId,
      },
      orderBy: [{ productId: 'asc' }, { priority: 'asc' }],
      include: {
        supplier: { select: { id: true, name: true } },
        product: { select: { id: true, sku: true, name: true, retailPrice: true, rakutenItemCode: true } },
      },
    });

    // 現在の楽天販売価格での利益を併せて返す
    return links.map((link) => ({
      ...link,
      profit: calculateDropshipProfit({
        costPrice: Number(link.costPrice),
        shippingCost: Number(link.shippingCost),
        sellingPrice: Number(link.product.retailPrice),
        ...settings,
      }),
    }));
  }

  async linkSupplierProduct(dto: LinkSupplierProductDto) {
    await this.getSupplier(dto.supplierId);
    const product = await prisma.product.findUnique({ where: { id: dto.productId } });
    if (!product) {
      throw new NotFoundException(`Product not found: ${dto.productId}`);
    }

    const { supplierId, productId, ...data } = dto;
    return prisma.supplierProduct.upsert({
      where: { supplierId_productId: { supplierId, productId } },
      create: { supplierId, productId, ...data, lastCheckedAt: new Date() },
      update: { ...data, lastCheckedAt: new Date() },
    });
  }

  async updateSupplierProduct(id: string, dto: UpdateSupplierProductDto) {
    const link = await prisma.supplierProduct.findUnique({ where: { id } });
    if (!link) {
      throw new NotFoundException(`Supplier product not found: ${id}`);
    }
    return prisma.supplierProduct.update({
      where: { id },
      data: { ...dto, lastCheckedAt: new Date() },
    });
  }

  async unlinkSupplierProduct(id: string) {
    const link = await prisma.supplierProduct.findUnique({ where: { id } });
    if (!link) {
      throw new NotFoundException(`Supplier product not found: ${id}`);
    }
    await prisma.supplierProduct.delete({ where: { id } });
    return { success: true };
  }

  // ============================================
  // Profit
  // ============================================

  async calculateProfit(tenantId: string, dto: ProfitCalculationDto) {
    const stored = await this.getProfitSettings(tenantId);
    const input = {
      costPrice: dto.costPrice,
      shippingCost: dto.shippingCost,
      adCostPerOrder: dto.adCostPerOrder ?? 0,
      fees: dto.fees ?? stored.fees,
      isTaxableBusiness: dto.isTaxableBusiness ?? stored.isTaxableBusiness,
    };

    return {
      settings: { fees: input.fees, isTaxableBusiness: input.isTaxableBusiness },
      result:
        dto.sellingPrice !== undefined
          ? calculateDropshipProfit({ ...input, sellingPrice: dto.sellingPrice })
          : null,
      suggestedPrice:
        dto.targetMarginPercent !== undefined
          ? suggestSellingPrice({ ...input, targetMarginPercent: dto.targetMarginPercent })
          : null,
    };
  }

  /**
   * 手数料率・課税区分は テナント設定 (settings.dropship) で上書きできる
   */
  private async getProfitSettings(tenantId: string): Promise<ProfitSettings> {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    const dropship = ((tenant?.settings as Record<string, any>) ?? {}).dropship ?? {};
    return {
      fees: { ...DEFAULT_RAKUTEN_FEES, ...(dropship.rakutenFees ?? {}) },
      isTaxableBusiness: Boolean(dropship.isTaxableBusiness),
    };
  }

  // ============================================
  // Purchase queue (楽天注文 → 卸業者へ発注)
  // ============================================

  async getQueue(tenantId: string, orderId?: string): Promise<DropshipQueueOrder[]> {
    const settings = await this.getProfitSettings(tenantId);

    const orders = await prisma.order.findMany({
      where: {
        id: orderId,
        platform: 'RAKUTEN',
        status: { in: [...OPEN_ORDER_STATUSES] },
      },
      orderBy: { orderedAt: 'asc' },
      include: {
        dropshipPurchases: true,
        items: {
          include: {
            product: {
              include: {
                supplierProducts: {
                  where: { isAvailable: true, supplier: { isActive: true } },
                  orderBy: { priority: 'asc' },
                  include: { supplier: true },
                },
              },
            },
          },
        },
      },
    });

    // SKU でしか紐付いていない注文明細 (楽天同期分) の商品を解決する
    const unresolvedSkus = orders.flatMap((o) => o.items.filter((i) => !i.product).map((i) => i.sku));
    const productsBySku = new Map(
      (unresolvedSkus.length
        ? await prisma.product.findMany({
            where: { sku: { in: unresolvedSkus } },
            include: {
              supplierProducts: {
                where: { isAvailable: true, supplier: { isActive: true } },
                orderBy: { priority: 'asc' },
                include: { supplier: true },
              },
            },
          })
        : []
      ).map((p) => [p.sku, p]),
    );

    return orders.map((order) => {
      const purchasesBySupplier = new Map(order.dropshipPurchases.map((p) => [p.supplierId, p]));
      const groups = new Map<string, DropshipQueueGroup & { maxShipping: number; itemCost: number }>();
      const unlinkedItems: DropshipQueueLine[] = [];

      for (const item of order.items) {
        const product = item.product ?? productsBySku.get(item.sku);
        const links = product?.supplierProducts ?? [];

        // 既に発注済みの卸業者を優先し、キャンセル済みの卸業者は避ける
        const link =
          links.find((l) => {
            const p = purchasesBySupplier.get(l.supplierId);
            return p && p.status !== 'CANCELLED';
          }) ??
          links.find((l) => purchasesBySupplier.get(l.supplierId)?.status !== 'CANCELLED');

        const line: DropshipQueueLine = {
          sku: item.sku,
          name: item.name,
          quantity: item.quantity,
          unitPrice: Number(item.unitPrice),
          supplierUrl: link?.supplierUrl ?? null,
          supplierSku: link?.supplierSku ?? null,
          costPrice: link ? Number(link.costPrice) : null,
        };

        if (!link) {
          unlinkedItems.push(line);
          continue;
        }

        let group = groups.get(link.supplierId);
        if (!group) {
          const purchase = purchasesBySupplier.get(link.supplierId);
          group = {
            supplierId: link.supplierId,
            supplierName: link.supplier.name,
            supplierWebsiteUrl: link.supplier.websiteUrl,
            senderName: link.supplier.senderName,
            purchaseId: purchase?.id ?? null,
            status: (purchase?.status as DropshipPurchaseStatus) ?? DropshipPurchaseStatus.PENDING,
            supplierOrderNo: purchase?.supplierOrderNo ?? null,
            trackingNumber: purchase?.trackingNumber ?? null,
            carrier: purchase?.carrier ?? null,
            estimatedCost: 0,
            items: [],
            maxShipping: 0,
            itemCost: 0,
          };
          groups.set(link.supplierId, group);
        }
        group.items.push(line);
        group.itemCost += Number(link.costPrice) * item.quantity;
        // 同じ卸業者への発注は1回の配送とみなし、送料は最大値を採用
        group.maxShipping = Math.max(group.maxShipping, Number(link.shippingCost));
      }

      const queueGroups: DropshipQueueGroup[] = [...groups.values()].map(
        ({ maxShipping, itemCost, ...group }) => {
          const actualCost = purchasesBySupplier.get(group.supplierId)?.actualCost;
          return {
            ...group,
            estimatedCost: actualCost != null ? Number(actualCost) : itemCost + maxShipping,
          };
        },
      );

      const totalCost = queueGroups.reduce((sum, g) => sum + g.estimatedCost, 0);

      return {
        orderId: order.id,
        externalOrderId: order.externalOrderId,
        orderedAt: order.orderedAt.toISOString(),
        totalAmount: Number(order.totalAmount),
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        shippingAddressText: formatShippingAddress(order),
        deliveryDate: order.deliveryDate?.toISOString() ?? null,
        deliveryTimeSlot: order.deliveryTimeSlot,
        groups: queueGroups,
        unlinkedItems,
        profit:
          unlinkedItems.length === 0
            ? calculateDropshipProfit({
                costPrice: totalCost,
                shippingCost: 0, // 送料は estimatedCost に含めている
                sellingPrice: Number(order.totalAmount),
                ...settings,
              })
            : null,
      };
    });
  }

  /**
   * 卸サイトで発注した後に記録する
   */
  async markOrdered(orderId: string, dto: MarkOrderedDto) {
    const order = await this.getOpenRakutenOrder(orderId);
    await this.getSupplier(dto.supplierId);

    const data = {
      status: 'ORDERED' as const,
      supplierOrderNo: dto.supplierOrderNo,
      actualCost: dto.actualCost,
      notes: dto.notes,
      orderedAt: new Date(),
    };

    const [purchase] = await prisma.$transaction([
      prisma.dropshipPurchase.upsert({
        where: { orderId_supplierId: { orderId, supplierId: dto.supplierId } },
        create: { orderId, supplierId: dto.supplierId, ...data },
        update: data,
      }),
      prisma.order.update({
        where: { id: orderId },
        data: { status: order.status === 'ON_HOLD' ? 'ON_HOLD' : 'PROCESSING' },
      }),
    ]);

    return purchase;
  }

  /**
   * 卸業者から追跡番号が届いたら記録し、楽天へ発送通知する。
   * その注文の全ての発注が発送済みになったら注文を「出荷済」にする。
   */
  async markShipped(tenantId: string, orderId: string, dto: MarkShippedDto) {
    await this.getOpenRakutenOrder(orderId);
    await this.getSupplier(dto.supplierId);

    const now = new Date();
    const purchase = await prisma.dropshipPurchase.upsert({
      where: { orderId_supplierId: { orderId, supplierId: dto.supplierId } },
      create: {
        orderId,
        supplierId: dto.supplierId,
        status: 'SHIPPED',
        carrier: dto.carrier,
        trackingNumber: dto.trackingNumber,
        orderedAt: now,
        shippedAt: now,
      },
      update: {
        status: 'SHIPPED',
        carrier: dto.carrier,
        trackingNumber: dto.trackingNumber,
        shippedAt: now,
      },
    });

    // 楽天RMSへ発送情報を登録 (卸業者ごとに別の追跡番号になる)
    await this.rakutenService.confirmShipment(orderId, dto.trackingNumber, dto.carrier);
    await prisma.dropshipPurchase.update({
      where: { id: purchase.id },
      data: { marketplaceNotifiedAt: new Date() },
    });

    const [queue] = await this.getQueue(tenantId, orderId);
    const allShipped =
      queue.unlinkedItems.length === 0 &&
      queue.groups.length > 0 &&
      queue.groups.every((g) => g.status === DropshipPurchaseStatus.SHIPPED);

    if (allShipped) {
      await prisma.order.update({
        where: { id: orderId },
        data: {
          status: 'SHIPPED',
          shippedAt: now,
          assignedCarrier: dto.carrier,
          trackingNumber: dto.trackingNumber,
        },
      });
      this.logger.log(`Dropship order fully shipped: ${queue.externalOrderId}`);
    }

    return { purchase, orderShipped: allShipped };
  }

  /**
   * 卸業者で欠品などにより発注できなかった場合。次の優先順位の卸業者が候補になる
   */
  async cancelPurchase(orderId: string, dto: CancelPurchaseDto) {
    await this.getOpenRakutenOrder(orderId);
    const purchase = await prisma.dropshipPurchase.findUnique({
      where: { orderId_supplierId: { orderId, supplierId: dto.supplierId } },
    });

    if (purchase?.status === 'SHIPPED') {
      throw new BadRequestException('Purchase has already shipped');
    }

    return prisma.dropshipPurchase.upsert({
      where: { orderId_supplierId: { orderId, supplierId: dto.supplierId } },
      create: { orderId, supplierId: dto.supplierId, status: 'CANCELLED', notes: dto.notes },
      update: { status: 'CANCELLED', notes: dto.notes },
    });
  }

  private async getOpenRakutenOrder(orderId: string) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order || order.platform !== 'RAKUTEN') {
      throw new NotFoundException('Order is not a Rakuten order');
    }
    if (!(OPEN_ORDER_STATUSES as readonly string[]).includes(order.status)) {
      throw new BadRequestException(`Order is already ${order.status}`);
    }
    return order;
  }
}
