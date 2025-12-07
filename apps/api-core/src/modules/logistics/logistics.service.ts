import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { prisma } from '@japan-erp/database';
import { RoutingService, CarrierCode } from './routing.service';
import { CsvExporterService } from './csv-exporter.service';

@Injectable()
export class LogisticsService {
  constructor(
    private readonly routingService: RoutingService,
    private readonly csvExporter: CsvExporterService,
  ) {}

  async getShipments(filters: { status?: string[]; carrier?: string[]; page?: number; limit?: number }) {
    const { status, carrier, page = 1, limit = 20 } = filters;

    const where: any = {};

    if (status?.length) {
      where.status = { in: status };
    }

    if (carrier?.length) {
      where.carrier = { in: carrier };
    }

    const [shipments, total] = await Promise.all([
      prisma.shipment.findMany({
        where,
        include: {
          order: {
            select: {
              id: true,
              externalOrderId: true,
              customerName: true,
              shippingPrefecture: true,
              shippingCity: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.shipment.count({ where }),
    ]);

    return {
      items: shipments,
      pagination: {
        page,
        limit,
        totalItems: total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
        hasPreviousPage: page > 1,
      },
    };
  }

  async routeOrder(orderId: string) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!order) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }

    const routing = this.routingService.determineCarrier(order);

    return {
      orderId,
      ...routing,
    };
  }

  async routeOrders(orderIds: string[]) {
    const orders = await prisma.order.findMany({
      where: { id: { in: orderIds } },
      include: { items: true },
    });

    return orders.map((order) => ({
      orderId: order.id,
      ...this.routingService.determineCarrier(order),
    }));
  }

  async createShipment(orderId: string, carrier?: CarrierCode) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!order) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }

    if (order.status !== 'CONFIRMED' && order.status !== 'PROCESSING' && order.status !== 'PACKED') {
      throw new BadRequestException(`Order is not ready for shipment. Current status: ${order.status}`);
    }

    // Auto-route if carrier not specified
    const routing = carrier
      ? { carrier, serviceType: 'DEFAULT', reason: 'Manual selection' }
      : this.routingService.determineCarrier(order);

    // Calculate totals
    const totalWeight = order.items.reduce(
      (sum, item) => sum + (item.weight || 500) * item.quantity,
      0,
    );
    const totalSize = Math.max(...order.items.map((item) => item.sizeCode || 60));

    // Create shipment
    const shipment = await prisma.shipment.create({
      data: {
        orderId,
        carrier: routing.carrier as any,
        serviceType: routing.serviceType,
        totalWeight,
        totalSize,
        deliveryDate: order.deliveryDate,
        deliveryTimeSlot: order.deliveryTimeSlot,
        status: 'PENDING',
        codAmount: order.paymentMethod === 'COD' ? order.totalAmount : null,
      },
    });

    // Update order status
    await prisma.order.update({
      where: { id: orderId },
      data: {
        status: 'PROCESSING',
        assignedCarrier: routing.carrier,
      },
    });

    return {
      shipment,
      routing,
    };
  }

  async generateCsv(carrier: CarrierCode, orderIds: string[]) {
    const orders = await prisma.order.findMany({
      where: { id: { in: orderIds } },
      include: { items: true },
    });

    if (orders.length === 0) {
      throw new NotFoundException('No orders found');
    }

    // Get shipper info from tenant settings (mock for now)
    const shipper = {
      name: '株式会社サンプル',
      phone: '03-1234-5678',
      zipCode: '135-0061',
      prefecture: '東京都',
      city: '江東区',
      address: '豊洲1-2-3',
    };

    let csvBuffer: Buffer;
    let filename: string;

    switch (carrier) {
      case CarrierCode.SAGAWA:
        csvBuffer = this.csvExporter.generateSagawaCsv(orders, shipper);
        filename = `sagawa_${new Date().toISOString().slice(0, 10)}.csv`;
        break;
      case CarrierCode.YAMATO:
        csvBuffer = this.csvExporter.generateYamatoCsv(orders, shipper);
        filename = `yamato_${new Date().toISOString().slice(0, 10)}.csv`;
        break;
      case CarrierCode.FUKUYAMA:
        csvBuffer = this.csvExporter.generateFukuyamaCsv(orders, shipper);
        filename = `fukuyama_${new Date().toISOString().slice(0, 10)}.csv`;
        break;
      case CarrierCode.JAPAN_POST:
        csvBuffer = this.csvExporter.generateJapanPostCsv(orders, shipper);
        filename = `japanpost_${new Date().toISOString().slice(0, 10)}.csv`;
        break;
      default:
        throw new BadRequestException(`Unsupported carrier: ${carrier}`);
    }

    return {
      buffer: csvBuffer,
      filename,
      encoding: 'Shift_JIS',
      orderCount: orders.length,
    };
  }

  async updateTrackingNumber(shipmentId: string, trackingNumber: string) {
    const shipment = await prisma.shipment.findUnique({
      where: { id: shipmentId },
    });

    if (!shipment) {
      throw new NotFoundException(`Shipment ${shipmentId} not found`);
    }

    const updated = await prisma.shipment.update({
      where: { id: shipmentId },
      data: {
        trackingNumber,
        status: 'LABEL_PRINTED',
      },
    });

    // Update order tracking number
    await prisma.order.update({
      where: { id: shipment.orderId },
      data: {
        trackingNumber,
        status: 'SHIPPED',
        shippedAt: new Date(),
      },
    });

    return updated;
  }

  async getCarrierStats() {
    const stats = await prisma.shipment.groupBy({
      by: ['carrier', 'status'],
      _count: { id: true },
    });

    const carrierTotals = await prisma.shipment.groupBy({
      by: ['carrier'],
      _count: { id: true },
    });

    return {
      byCarrierAndStatus: stats,
      byCarrier: carrierTotals,
    };
  }
}

