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
import { ChangeLogService } from '../audit/change-log.service';

export interface AuditUser {
  userId: string;
  userEmail?: string;
}

@Injectable()
export class ProductService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly changeLogService: ChangeLogService,
  ) {}

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

  async findOne(id: string, tenantId: string): Promise<Product> {
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
    user?: AuditUser,
  ): Promise<Product> {
    const result = await this.withTenantContext(tenantId, async (repo) => {
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

    if (user) {
      await this.changeLogService.log({
        tenantId,
        userId: user.userId,
        userEmail: user.userEmail,
        action: 'CREATE',
        targetType: 'product',
        targetId: result.id,
        changes: { name: result.name, product_type: result.product_type },
      });
    }

    return result;
  }

  async update(
    id: string,
    tenantId: string,
    dto: UpdateProductDto,
    user?: AuditUser,
  ): Promise<Product> {
    const result = await this.withTenantContext(tenantId, async (repo) => {
      const row = await repo.findOne({
        where: {
          id,
          tenant_id: this.requireTenant(tenantId),
        },
      });
      if (!row) {
        throw new NotFoundException(`Product ${id} not found`);
      }

      const changes: Record<string, unknown> = {};
      if (dto.name !== undefined) {
        changes.name = { from: row.name, to: dto.name.trim() };
        row.name = dto.name.trim();
      }
      if (dto.uom !== undefined) {
        changes.uom = { from: row.uom, to: dto.uom.trim() };
        row.uom = dto.uom.trim();
      }
      if (dto.product_type !== undefined) {
        changes.product_type = { from: row.product_type, to: dto.product_type };
        row.product_type = dto.product_type;
      }
      if (dto.category_code !== undefined) {
        changes.category_code = {
          from: row.category_code,
          to: dto.category_code?.trim() ?? null,
        };
        row.category_code = dto.category_code?.trim() ?? null;
      }
      if (dto.warehouse_id !== undefined) {
        changes.warehouse_id = {
          from: row.warehouse_id,
          to: dto.warehouse_id?.trim() ?? null,
        };
        row.warehouse_id = dto.warehouse_id?.trim() ?? null;
      }
      if (dto.is_perishable !== undefined) {
        changes.is_perishable = {
          from: row.is_perishable,
          to: dto.is_perishable,
        };
        row.is_perishable = dto.is_perishable;
      }
      if (dto.sellPrice !== undefined) {
        changes.sellPrice = { from: row.sellPrice, to: dto.sellPrice };
        row.sellPrice = dto.sellPrice;
      }
      if (dto.is_active !== undefined) {
        changes.is_active = { from: row.is_active, to: dto.is_active };
        row.is_active = dto.is_active;
      }

      return { saved: await repo.save(row), changes };
    });

    if (user && Object.keys(result.changes).length > 0) {
      await this.changeLogService.log({
        tenantId,
        userId: user.userId,
        userEmail: user.userEmail,
        action: 'UPDATE',
        targetType: 'product',
        targetId: id,
        changes: result.changes,
      });
    }

    return result.saved;
  }

  /**
   * Soft-deactivate (never hard-delete) to preserve historical references.
   */
  async deactivate(
    id: string,
    tenantId: string,
    user?: AuditUser,
  ): Promise<void> {
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

    if (user) {
      await this.changeLogService.log({
        tenantId,
        userId: user.userId,
        userEmail: user.userEmail,
        action: 'DEACTIVATE',
        targetType: 'product',
        targetId: id,
      });
    }
  }
}
