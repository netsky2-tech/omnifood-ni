import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { Product, ProductType } from './entities/product.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Injectable()
export class ProductService {
  constructor(private readonly dataSource: DataSource) {}

  private requireTenant(tenantId: string): string {
    const normalized = tenantId.trim();
    if (!normalized) {
      throw new UnauthorizedException('Tenant context is required');
    }
    return normalized;
  }

  private async withTenantContext<T>(
    tenantId: string,
    operation: (repo: Repository<Product>) => Promise<T>,
  ): Promise<T> {
    const normalizedTenantId = this.requireTenant(tenantId);
    const queryRunner = this.dataSource.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      await queryRunner.query("SELECT set_config('app.tenant_id', $1, true)", [
        normalizedTenantId,
      ]);
      const tenantRepo = queryRunner.manager.getRepository(Product);
      const result = await operation(tenantRepo);
      await queryRunner.commitTransaction();
      return result;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async list(
    tenantId: string,
    productType?: ProductType,
    includeInactive = false,
  ): Promise<Product[]> {
    return this.withTenantContext(tenantId, (repo) => {
      const where: Record<string, unknown> = {
        tenant_id: this.requireTenant(tenantId),
      };
      if (productType) {
        where.product_type = productType;
      }
      if (!includeInactive) {
        where.is_active = true;
      }
      return repo.find({
        where,
        order: { name: 'ASC' },
      });
    });
  }

  async findOne(
    id: string,
    tenantId: string,
  ): Promise<Product> {
    return this.withTenantContext(tenantId, async (repo) => {
      const row = await repo.findOne({
        where: {
          id,
          tenant_id: this.requireTenant(tenantId),
        },
      });
      if (!row) {
        throw new NotFoundException(`Product ${id} not found`);
      }
      return row;
    });
  }

  async create(
    tenantId: string,
    dto: CreateProductDto,
  ): Promise<Product> {
    return this.withTenantContext(tenantId, async (repo) => {
      const normalizedTenantId = this.requireTenant(tenantId);

      const row = repo.create({
        tenant_id: normalizedTenantId,
        name: dto.name.trim(),
        uom: dto.uom.trim(),
        product_type: dto.product_type,
        category_code: dto.category_code?.trim() ?? null,
        warehouse_id: dto.warehouse_id?.trim() ?? null,
        is_perishable: dto.is_perishable ?? false,
        stock: dto.stock ?? 0,
        averageCost: dto.averageCost ?? 0,
        sellPrice: dto.sellPrice ?? 0,
        is_active: dto.is_active ?? true,
      });
      return repo.save(row);
    });
  }

  async update(
    id: string,
    tenantId: string,
    dto: UpdateProductDto,
  ): Promise<Product> {
    return this.withTenantContext(tenantId, async (repo) => {
      const row = await repo.findOne({
        where: {
          id,
          tenant_id: this.requireTenant(tenantId),
        },
      });
      if (!row) {
        throw new NotFoundException(`Product ${id} not found`);
      }

      if (dto.name !== undefined) row.name = dto.name.trim();
      if (dto.uom !== undefined) row.uom = dto.uom.trim();
      if (dto.product_type !== undefined) row.product_type = dto.product_type;
      if (dto.category_code !== undefined) row.category_code = dto.category_code?.trim() ?? null;
      if (dto.warehouse_id !== undefined) row.warehouse_id = dto.warehouse_id?.trim() ?? null;
      if (dto.is_perishable !== undefined) row.is_perishable = dto.is_perishable;
      if (dto.sellPrice !== undefined) row.sellPrice = dto.sellPrice;
      if (dto.is_active !== undefined) row.is_active = dto.is_active;

      return repo.save(row);
    });
  }

  /**
   * Soft-deactivate (never hard-delete) to preserve historical references.
   */
  async deactivate(id: string, tenantId: string): Promise<void> {
    await this.withTenantContext(tenantId, async (repo) => {
      const row = await repo.findOne({
        where: {
          id,
          tenant_id: this.requireTenant(tenantId),
        },
      });
      if (!row) {
        throw new NotFoundException(`Product ${id} not found`);
      }
      row.is_active = false;
      await repo.save(row);
    });
  }
}
