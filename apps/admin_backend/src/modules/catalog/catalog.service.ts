import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { CatalogValue } from './entities/catalog-value.entity';
import { CatalogType, isCatalogType } from './catalog-type';
import { CreateCatalogValueDto } from './dto/create-catalog-value.dto';
import { UpdateCatalogValueDto } from './dto/update-catalog-value.dto';

/**
 * Default seed values per catalog type. These initialize a tenant's master data
 * so the tablet can operate offline on first provisioning. Every seeded value
 * is a normal row in `catalog_values` and remains fully editable/deactivatable
 * by the tenant afterwards — nothing here is hardcoded in the POS UI.
 */
export const DEFAULT_CATALOG_SEED: Readonly<
  Record<CatalogType, ReadonlyArray<{ code: string; name: string }>>
> = {
  UOM: [
    { code: 'kg', name: 'Kilogramo' },
    { code: 'g', name: 'Gramo' },
    { code: 'lb', name: 'Libra' },
    { code: 'oz', name: 'Onza' },
    { code: 'l', name: 'Litro' },
    { code: 'ml', name: 'Mililitro' },
    { code: 'gal', name: 'Galón' },
    { code: 'un', name: 'Unidad' },
    { code: 'doc', name: 'Docena' },
    { code: 'caja', name: 'Caja' },
    { code: 'paquete', name: 'Paquete' },
    { code: 'saco', name: 'Saco' },
    { code: 'servicio', name: 'Servicio' },
    { code: 'hora', name: 'Hora' },
  ],
  INVENTORY_CATEGORY: [
    { code: 'ABARROTOS', name: 'Abarrotes' },
    { code: 'LACTEOS', name: 'Lácteos' },
    { code: 'CARNES', name: 'Carnes' },
    { code: 'VERDURAS', name: 'Verduras' },
    { code: 'FRUTAS', name: 'Frutas' },
    { code: 'GRANOS', name: 'Granos' },
    { code: 'BEBIDAS', name: 'Bebidas' },
    { code: 'INSUMOS_POS', name: 'Insumos POS' },
    { code: 'OTROS', name: 'Otros' },
  ],
  INVENTORY_TYPE: [
    { code: 'MATERIA_PRIMA', name: 'Materia prima' },
    { code: 'EMPAQUE', name: 'Empaque' },
    { code: 'NO_COMESTIBLE', name: 'No comestible' },
  ],
  SALES_PRODUCT_CATEGORY: [
    { code: 'COMIDA', name: 'Comida' },
    { code: 'BEBIDA_CALIENTE', name: 'Bebida caliente' },
    { code: 'BEBIDA_FRIA', name: 'Bebida fría' },
    { code: 'PANADERIA', name: 'Panadería' },
    { code: 'SNACK', name: 'Snack' },
    { code: 'RETAIL', name: 'Retail' },
    { code: 'LIMPIEZA', name: 'Limpieza' },
    { code: 'OTROS', name: 'Otros' },
  ],
  SALES_PRODUCT_TYPE: [
    { code: 'PREPARADO', name: 'Preparado (lleva receta/BOM)' },
    { code: 'REVENTA', name: 'Reventa directa' },
  ],
};

@Injectable()
export class CatalogService {
  constructor(private readonly dataSource: DataSource) {}

  private requireTenant(tenantId: string): string {
    const normalized = tenantId.trim();
    if (!normalized) {
      throw new UnauthorizedException('Tenant context is required');
    }
    return normalized;
  }

  /**
   * Catalog queries run inside a transaction-bound QueryRunner so PostgreSQL RLS
   * policies can read app.tenant_id via current_setting(...). set_config uses a
   * bind parameter; never interpolate tenant values into SQL.
   */
  private async withTenantContext<T>(
    tenantId: string,
    operation: (repo: Repository<CatalogValue>) => Promise<T>,
  ): Promise<T> {
    const normalizedTenantId = this.requireTenant(tenantId);
    const queryRunner = this.dataSource.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      await queryRunner.query("SELECT set_config('app.tenant_id', $1, true)", [
        normalizedTenantId,
      ]);
      const tenantRepo = queryRunner.manager.getRepository(CatalogValue);
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
    type: CatalogType,
    tenantId: string,
    includeInactive = false,
  ): Promise<CatalogValue[]> {
    return this.withTenantContext(tenantId, (repo) => {
      const where: Record<string, unknown> = {
        tenant_id: this.requireTenant(tenantId),
        catalog_type: type,
      };
      if (!includeInactive) {
        where.is_active = true;
      }
      return repo.find({
        where,
        order: { sort_order: 'ASC', name: 'ASC' },
      });
    });
  }

  async create(
    type: CatalogType,
    tenantId: string,
    dto: CreateCatalogValueDto,
  ): Promise<CatalogValue> {
    return this.withTenantContext(tenantId, async (repo) => {
      const normalizedTenantId = this.requireTenant(tenantId);
      const code = dto.code.trim();
      const existing = await repo.findOne({
        where: { tenant_id: normalizedTenantId, catalog_type: type, code },
      });
      if (existing) {
        throw new ConflictException(
          `Catalog value with code "${code}" already exists for ${type}`,
        );
      }

      const row = repo.create({
        tenant_id: normalizedTenantId,
        catalog_type: type,
        code,
        name: dto.name.trim(),
        is_active: dto.is_active ?? true,
        sort_order: dto.sort_order ?? 0,
      });
      return repo.save(row);
    });
  }

  async update(
    type: CatalogType,
    id: string,
    tenantId: string,
    dto: UpdateCatalogValueDto,
  ): Promise<CatalogValue> {
    return this.withTenantContext(tenantId, async (repo) => {
      const row = await repo.findOne({
        where: {
          id,
          tenant_id: this.requireTenant(tenantId),
          catalog_type: type,
        },
      });
      if (!row) {
        throw new NotFoundException(
          `Catalog value ${id} not found for ${type}`,
        );
      }

      if (dto.name !== undefined) row.name = dto.name.trim();
      if (dto.is_active !== undefined) row.is_active = dto.is_active;
      if (dto.sort_order !== undefined) row.sort_order = dto.sort_order;

      return repo.save(row);
    });
  }

  /**
   * Soft-deactivate (never hard-delete) to preserve historical references.
   */
  async deactivate(
    type: CatalogType,
    id: string,
    tenantId: string,
  ): Promise<void> {
    await this.withTenantContext(tenantId, async (repo) => {
      const row = await repo.findOne({
        where: {
          id,
          tenant_id: this.requireTenant(tenantId),
          catalog_type: type,
        },
      });
      if (!row) {
        throw new NotFoundException(
          `Catalog value ${id} not found for ${type}`,
        );
      }
      row.is_active = false;
      await repo.save(row);
    });
  }

  /**
   * Idempotently seed default catalog values for a tenant. Skips codes that
   * already exist (so re-running never clobbers tenant edits).
   */
  async seedDefaults(tenantId: string): Promise<number> {
    return this.withTenantContext(tenantId, async (repo) => {
      const normalizedTenantId = this.requireTenant(tenantId);
      let inserted = 0;
      for (const type of Object.keys(DEFAULT_CATALOG_SEED) as CatalogType[]) {
        const defaults = DEFAULT_CATALOG_SEED[type];
        const existing = await repo.find({
          where: { tenant_id: normalizedTenantId, catalog_type: type },
        });
        const existingCodes = new Set(existing.map((r) => r.code));

        const toInsert = defaults
          .filter((d) => !existingCodes.has(d.code))
          .map((d, index) =>
            repo.create({
              tenant_id: normalizedTenantId,
              catalog_type: type,
              code: d.code,
              name: d.name,
              is_active: true,
              sort_order: index,
            }),
          );

        if (toInsert.length > 0) {
          await repo.save(toInsert);
          inserted += toInsert.length;
        }
      }
      return inserted;
    });
  }

  /** Validate/parse a catalog type from a route param. */
  static resolveType(raw: string): CatalogType {
    if (!isCatalogType(raw)) {
      throw new NotFoundException(`Unknown catalog type "${raw}"`);
    }
    return raw;
  }
}
