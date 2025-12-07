import { Injectable, NotFoundException } from '@nestjs/common';
import { prisma } from '@japan-erp/database';
import { CreateOrderDto, UpdateOrderStatusDto, OrderFilterDto } from './dto/order.dto';

@Injectable()
export class OrdersService {
  async findAll(filters: OrderFilterDto) {
    const { status, platform, startDate, endDate, search, page = 1, limit = 20 } = filters;

    const where: any = {};

    if (status?.length) {
      where.status = { in: status };
    }

    if (platform?.length) {
      where.platform = { in: platform };
    }

    if (startDate || endDate) {
      where.orderedAt = {};
      if (startDate) where.orderedAt.gte = new Date(startDate);
      if (endDate) where.orderedAt.lte = new Date(endDate);
    }

    if (search) {
      where.OR = [
        { externalOrderId: { contains: search, mode: 'insensitive' } },
        { customerName: { contains: search, mode: 'insensitive' } },
        { trackingNumber: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: {
          items: true,
        },
        orderBy: { orderedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.order.count({ where }),
    ]);

    return {
      items: orders,
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

  async findOne(id: string) {
    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        items: true,
        shipments: {
          include: {
            packages: true,
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException(`Order ${id} not found`);
    }

    return order;
  }

  async create(dto: CreateOrderDto) {
    // Calculate totals
    const subtotal = dto.items.reduce(
      (sum, item) => sum + item.unitPrice * item.quantity,
      0,
    );

    const taxStandard = dto.items
      .filter((item) => item.taxRate === 10)
      .reduce((sum, item) => sum + item.unitPrice * item.quantity * 0.1, 0);

    const taxReduced = dto.items
      .filter((item) => item.taxRate === 8)
      .reduce((sum, item) => sum + item.unitPrice * item.quantity * 0.08, 0);

    const taxAmount = taxStandard + taxReduced;
    const totalAmount = subtotal + taxAmount;

    return prisma.order.create({
      data: {
        platform: dto.platform,
        externalOrderId: dto.externalOrderId,
        customerName: dto.customerName,
        customerPhone: dto.customerPhone,
        shippingZipCode: dto.shippingZipCode,
        shippingPrefecture: dto.shippingPrefecture,
        shippingCity: dto.shippingCity,
        shippingAddress1: dto.shippingAddress1,
        shippingAddress2: dto.shippingAddress2,
        subtotal,
        taxStandard,
        taxReduced,
        taxAmount,
        totalAmount,
        paymentMethod: dto.paymentMethod || 'CREDIT_CARD',
        status: 'PENDING',
        orderedAt: new Date(),
        items: {
          create: dto.items.map((item) => ({
            sku: item.sku,
            name: item.name,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            taxRate: item.taxRate,
            subtotal: item.unitPrice * item.quantity,
          })),
        },
      },
      include: {
        items: true,
      },
    });
  }

  async updateStatus(id: string, dto: UpdateOrderStatusDto) {
    const order = await this.findOne(id);

    const updateData: any = {
      status: dto.status,
    };

    // Set timestamps based on status
    switch (dto.status) {
      case 'SHIPPED':
        updateData.shippedAt = new Date();
        if (dto.trackingNumber) {
          updateData.trackingNumber = dto.trackingNumber;
        }
        if (dto.carrier) {
          updateData.assignedCarrier = dto.carrier;
        }
        break;
      case 'DELIVERED':
        updateData.deliveredAt = new Date();
        break;
      case 'CANCELLED':
        updateData.cancelledAt = new Date();
        break;
    }

    return prisma.order.update({
      where: { id },
      data: updateData,
      include: {
        items: true,
      },
    });
  }

  async getStats() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      totalOrders,
      pendingOrders,
      todayOrders,
      todayRevenue,
    ] = await Promise.all([
      prisma.order.count(),
      prisma.order.count({ where: { status: 'PENDING' } }),
      prisma.order.count({ where: { orderedAt: { gte: today } } }),
      prisma.order.aggregate({
        where: { orderedAt: { gte: today } },
        _sum: { totalAmount: true },
      }),
    ]);

    return {
      totalOrders,
      pendingOrders,
      todayOrders,
      todayRevenue: todayRevenue._sum.totalAmount || 0,
    };
  }
}

