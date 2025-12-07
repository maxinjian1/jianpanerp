import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { prisma } from '@japan-erp/database';
import { AdjustInventoryDto, InventoryFilterDto, ReceiveInventoryDto } from './dto/inventory.dto';

@Injectable()
export class InventoryService {
  async findAll(filters: InventoryFilterDto) {
    const { warehouseId, productId, lowStock, expiringWithinDays, page = 1, limit = 20 } = filters;

    const where: any = {};

    if (warehouseId) {
      where.warehouseId = warehouseId;
    }

    if (productId) {
      where.productId = productId;
    }

    if (expiringWithinDays) {
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + expiringWithinDays);
      where.expiryDate = {
        lte: expiryDate,
        gte: new Date(),
      };
    }

    const [inventories, total] = await Promise.all([
      prisma.inventory.findMany({
        where,
        include: {
          product: {
            select: {
              id: true,
              sku: true,
              name: true,
              janCode: true,
              reorderPoint: true,
            },
          },
          warehouse: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
          location: {
            select: {
              id: true,
              code: true,
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.inventory.count({ where }),
    ]);

    // Calculate available quantity and filter by low stock
    let result = inventories.map((inv) => ({
      ...inv,
      availableQty: inv.quantity - inv.reservedQty,
      isLowStock: inv.quantity - inv.reservedQty <= (inv.product.reorderPoint || 0),
    }));

    if (lowStock) {
      result = result.filter((inv) => inv.isLowStock);
    }

    return {
      items: result,
      pagination: {
        page,
        limit,
        totalItems: lowStock ? result.length : total,
        totalPages: Math.ceil((lowStock ? result.length : total) / limit),
        hasNextPage: page * limit < (lowStock ? result.length : total),
        hasPreviousPage: page > 1,
      },
    };
  }

  async getByProduct(productId: string) {
    return prisma.inventory.findMany({
      where: { productId },
      include: {
        warehouse: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        location: {
          select: {
            id: true,
            code: true,
          },
        },
      },
    });
  }

  async receive(dto: ReceiveInventoryDto, userId: string) {
    // Find or create inventory record
    const existingInventory = await prisma.inventory.findFirst({
      where: {
        warehouseId: dto.warehouseId,
        productId: dto.productId,
        lotNumber: dto.lotNumber || null,
      },
    });

    let inventory;

    if (existingInventory) {
      // Update existing inventory
      inventory = await prisma.inventory.update({
        where: { id: existingInventory.id },
        data: {
          quantity: existingInventory.quantity + dto.quantity,
          lastReceivedAt: new Date(),
          expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : existingInventory.expiryDate,
        },
      });
    } else {
      // Create new inventory
      inventory = await prisma.inventory.create({
        data: {
          warehouseId: dto.warehouseId,
          productId: dto.productId,
          locationId: dto.locationId,
          quantity: dto.quantity,
          lotNumber: dto.lotNumber,
          expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : undefined,
          lastReceivedAt: new Date(),
        },
      });
    }

    // Record transaction
    await prisma.inventoryTransaction.create({
      data: {
        warehouseId: dto.warehouseId,
        productId: dto.productId,
        type: 'RECEIVE',
        quantity: dto.quantity,
        beforeQty: existingInventory?.quantity || 0,
        afterQty: inventory.quantity,
        lotNumber: dto.lotNumber,
        userId,
        notes: dto.notes,
      },
    });

    return inventory;
  }

  async adjust(dto: AdjustInventoryDto, userId: string) {
    const inventory = await prisma.inventory.findFirst({
      where: {
        warehouseId: dto.warehouseId,
        productId: dto.productId,
        lotNumber: dto.lotNumber || null,
      },
    });

    if (!inventory) {
      throw new NotFoundException('Inventory record not found');
    }

    const newQuantity = inventory.quantity + dto.quantity;

    if (newQuantity < 0) {
      throw new BadRequestException('Resulting quantity cannot be negative');
    }

    // Update inventory
    const updated = await prisma.inventory.update({
      where: { id: inventory.id },
      data: {
        quantity: newQuantity,
      },
    });

    // Record transaction
    await prisma.inventoryTransaction.create({
      data: {
        warehouseId: dto.warehouseId,
        productId: dto.productId,
        type: dto.quantity > 0 ? 'ADJUST_PLUS' : 'ADJUST_MINUS',
        quantity: dto.quantity,
        beforeQty: inventory.quantity,
        afterQty: newQuantity,
        lotNumber: dto.lotNumber,
        userId,
        notes: dto.reason,
      },
    });

    return updated;
  }

  async reserveStock(productId: string, warehouseId: string, quantity: number) {
    const inventory = await prisma.inventory.findFirst({
      where: {
        productId,
        warehouseId,
        quantity: { gt: 0 },
      },
      orderBy: { expiryDate: 'asc' }, // FEFO: First Expiry, First Out
    });

    if (!inventory) {
      throw new NotFoundException('No available inventory');
    }

    const availableQty = inventory.quantity - inventory.reservedQty;
    if (availableQty < quantity) {
      throw new BadRequestException(`Insufficient stock. Available: ${availableQty}`);
    }

    return prisma.inventory.update({
      where: { id: inventory.id },
      data: {
        reservedQty: inventory.reservedQty + quantity,
      },
    });
  }

  async releaseReservation(productId: string, warehouseId: string, quantity: number) {
    const inventory = await prisma.inventory.findFirst({
      where: {
        productId,
        warehouseId,
        reservedQty: { gte: quantity },
      },
    });

    if (!inventory) {
      throw new NotFoundException('No reservation found');
    }

    return prisma.inventory.update({
      where: { id: inventory.id },
      data: {
        reservedQty: inventory.reservedQty - quantity,
      },
    });
  }

  async getTransactions(productId: string, limit = 50) {
    return prisma.inventoryTransaction.findMany({
      where: { productId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        warehouse: {
          select: {
            name: true,
            code: true,
          },
        },
      },
    });
  }

  async getLowStockAlerts() {
    // Get all products with their total inventory
    const products = await prisma.product.findMany({
      where: { isActive: true },
      include: {
        inventories: {
          select: {
            quantity: true,
            reservedQty: true,
          },
        },
      },
    });

    return products
      .map((product) => {
        const totalStock = product.inventories.reduce((sum, inv) => sum + inv.quantity, 0);
        const reservedStock = product.inventories.reduce((sum, inv) => sum + inv.reservedQty, 0);
        const availableStock = totalStock - reservedStock;

        return {
          productId: product.id,
          sku: product.sku,
          name: product.name,
          availableStock,
          reorderPoint: product.reorderPoint,
          reorderQuantity: product.reorderQuantity,
          isLowStock: availableStock <= product.reorderPoint,
          isCritical: availableStock <= product.safetyStock,
        };
      })
      .filter((p) => p.isLowStock)
      .sort((a, b) => a.availableStock - b.availableStock);
  }
}

