import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { prisma } from '@japan-erp/database';
import { CreateWarehouseDto, CreateZoneDto, CreateLocationDto } from './dto/warehouse.dto';

@Injectable()
export class WarehouseService {
  async findAll() {
    return prisma.warehouse.findMany({
      where: { isActive: true },
      include: {
        zones: {
          include: {
            locations: true,
          },
        },
        _count: {
          select: {
            inventories: true,
          },
        },
      },
      orderBy: { isDefault: 'desc' },
    });
  }

  async findOne(id: string) {
    const warehouse = await prisma.warehouse.findUnique({
      where: { id },
      include: {
        zones: {
          include: {
            locations: true,
          },
        },
      },
    });

    if (!warehouse) {
      throw new NotFoundException(`Warehouse ${id} not found`);
    }

    return warehouse;
  }

  async create(dto: CreateWarehouseDto) {
    // Check if code already exists
    const existing = await prisma.warehouse.findUnique({
      where: { code: dto.code },
    });

    if (existing) {
      throw new ConflictException(`Warehouse code ${dto.code} already exists`);
    }

    // If this is the first warehouse, make it default
    const count = await prisma.warehouse.count();
    const isDefault = count === 0 ? true : dto.isDefault;

    // If setting as default, unset other defaults
    if (isDefault) {
      await prisma.warehouse.updateMany({
        data: { isDefault: false },
      });
    }

    return prisma.warehouse.create({
      data: {
        name: dto.name,
        code: dto.code,
        zipCode: dto.zipCode,
        prefecture: dto.prefecture,
        city: dto.city,
        address: dto.address,
        phone: dto.phone,
        email: dto.email,
        manager: dto.manager,
        isDefault,
      },
    });
  }

  async createZone(warehouseId: string, dto: CreateZoneDto) {
    await this.findOne(warehouseId);

    return prisma.zone.create({
      data: {
        warehouseId,
        name: dto.name,
        code: dto.code,
        type: dto.type,
      },
    });
  }

  async createLocation(zoneId: string, dto: CreateLocationDto) {
    const zone = await prisma.zone.findUnique({
      where: { id: zoneId },
    });

    if (!zone) {
      throw new NotFoundException(`Zone ${zoneId} not found`);
    }

    return prisma.location.create({
      data: {
        zoneId,
        code: dto.code,
        type: dto.type,
        capacity: dto.capacity,
      },
    });
  }

  async getDefaultWarehouse() {
    const warehouse = await prisma.warehouse.findFirst({
      where: { isDefault: true, isActive: true },
    });

    if (!warehouse) {
      throw new NotFoundException('No default warehouse configured');
    }

    return warehouse;
  }

  async setDefault(id: string) {
    await this.findOne(id);

    // Unset all defaults
    await prisma.warehouse.updateMany({
      data: { isDefault: false },
    });

    // Set new default
    return prisma.warehouse.update({
      where: { id },
      data: { isDefault: true },
    });
  }
}

