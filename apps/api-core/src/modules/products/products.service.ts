import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { prisma } from '@japan-erp/database';
import { CreateProductDto, UpdateProductDto, ProductFilterDto } from './dto/product.dto';

@Injectable()
export class ProductsService {
  async findAll(filters: ProductFilterDto) {
    const { category, status, search, hasLowStock, page = 1, limit = 20 } = filters;

    const where: any = {};

    if (category) {
      where.category = category;
    }

    if (status) {
      where.status = status;
    }

    if (search) {
      where.OR = [
        { sku: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
        { janCode: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          inventories: {
            select: {
              quantity: true,
              reservedQty: true,
            },
          },
        },
      }),
      prisma.product.count({ where }),
    ]);

    // Calculate available stock for each product
    const productsWithStock = products.map((product) => {
      const totalStock = product.inventories.reduce((sum, inv) => sum + inv.quantity, 0);
      const reservedStock = product.inventories.reduce((sum, inv) => sum + inv.reservedQty, 0);
      const availableStock = totalStock - reservedStock;
      const isLowStock = availableStock <= product.reorderPoint;

      return {
        ...product,
        totalStock,
        reservedStock,
        availableStock,
        isLowStock,
        inventories: undefined, // Remove raw inventory data
      };
    });

    // Filter by low stock if requested
    const filteredProducts = hasLowStock
      ? productsWithStock.filter((p) => p.isLowStock)
      : productsWithStock;

    return {
      items: filteredProducts,
      pagination: {
        page,
        limit,
        totalItems: hasLowStock ? filteredProducts.length : total,
        totalPages: Math.ceil((hasLowStock ? filteredProducts.length : total) / limit),
        hasNextPage: page * limit < (hasLowStock ? filteredProducts.length : total),
        hasPreviousPage: page > 1,
      },
    };
  }

  async findOne(id: string) {
    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        inventories: {
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
        },
        variants: true,
        parentProduct: true,
      },
    });

    if (!product) {
      throw new NotFoundException(`Product ${id} not found`);
    }

    return product;
  }

  async findBySku(sku: string) {
    const product = await prisma.product.findUnique({
      where: { sku },
    });

    if (!product) {
      throw new NotFoundException(`Product with SKU ${sku} not found`);
    }

    return product;
  }

  async create(dto: CreateProductDto) {
    // Check if SKU already exists
    const existing = await prisma.product.findUnique({
      where: { sku: dto.sku },
    });

    if (existing) {
      throw new ConflictException(`Product with SKU ${dto.sku} already exists`);
    }

    // Validate JAN code format (13 digits)
    if (dto.janCode && !/^\d{13}$/.test(dto.janCode)) {
      throw new ConflictException('JAN code must be 13 digits');
    }

    return prisma.product.create({
      data: {
        sku: dto.sku,
        janCode: dto.janCode,
        name: dto.name,
        nameKana: dto.nameKana,
        description: dto.description,
        category: dto.category,
        subcategory: dto.subcategory,
        brand: dto.brand,
        manufacturer: dto.manufacturer,
        costPrice: dto.costPrice,
        wholesalePrice: dto.wholesalePrice,
        retailPrice: dto.retailPrice,
        taxRate: dto.taxRate,
        weight: dto.weight,
        length: dto.length,
        width: dto.width,
        height: dto.height,
        sizeCode: dto.sizeCode || this.calculateSizeCode(dto.length, dto.width, dto.height),
        reorderPoint: dto.reorderPoint || 10,
        reorderQuantity: dto.reorderQuantity || 50,
        safetyStock: dto.safetyStock || 5,
        leadTimeDays: dto.leadTimeDays || 7,
        hasExpiry: dto.hasExpiry || false,
        expiryWarningDays: dto.expiryWarningDays,
      },
    });
  }

  async update(id: string, dto: UpdateProductDto) {
    await this.findOne(id);

    return prisma.product.update({
      where: { id },
      data: dto,
    });
  }

  async delete(id: string) {
    await this.findOne(id);

    // Check if product has inventory
    const inventory = await prisma.inventory.findFirst({
      where: { productId: id, quantity: { gt: 0 } },
    });

    if (inventory) {
      throw new ConflictException('Cannot delete product with existing inventory');
    }

    return prisma.product.update({
      where: { id },
      data: {
        status: 'DISCONTINUED',
        isActive: false,
      },
    });
  }

  async getCategories() {
    const categories = await prisma.product.groupBy({
      by: ['category'],
      _count: { category: true },
    });

    return categories.map((c) => ({
      name: c.category,
      count: c._count.category,
    }));
  }

  private calculateSizeCode(length?: number, width?: number, height?: number): number {
    if (!length || !width || !height) return 60;

    const totalSize = (length + width + height) / 10; // Convert mm to cm

    if (totalSize <= 60) return 60;
    if (totalSize <= 80) return 80;
    if (totalSize <= 100) return 100;
    if (totalSize <= 120) return 120;
    if (totalSize <= 140) return 140;
    if (totalSize <= 160) return 160;
    return 180;
  }
}

