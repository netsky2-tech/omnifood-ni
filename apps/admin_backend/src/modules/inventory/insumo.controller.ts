import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Insumo, NEGATIVE_STOCK_POLICY } from './entities/insumo.entity';
import {
  serializeInsumo,
  serializeInsumos,
  InsumoResponse,
} from './insumo-response';
import { CreateInsumoDto } from './dto/create-insumo.dto';
import { UpdateInsumoDto } from './dto/update-insumo.dto';
import { GetTenantId } from '../../core/decorators/tenant.decorator';
import { TenantInterceptor } from '../../core/database/rls.interceptor';
import { AuthGuard } from '../identity/guards/auth.guard';
import { RolesGuard } from '../identity/guards/roles.guard';
import { Roles } from '../../core/decorators/roles.decorator';
import { UserRole } from '../identity/entities/user.entity';
import { DataSource, EntityManager } from 'typeorm';
import { runInTenantTransaction } from '../../core/database/tenant-transaction';
import {
  UnconfiguredConversionError,
  validateInsumoConversion,
} from './uom-catalog';
import { CatalogValue } from '../catalog/entities/catalog-value.entity';
import { CATALOG_TYPE } from '../catalog/catalog-type';

@Controller('insumos')
@UseInterceptors(TenantInterceptor)
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.OWNER, UserRole.MANAGER)
export class InsumoController {
  // Issue #512 slice 1 part A: the pooled insumo repository injection is
  // gone. Every read/write of `insumos` rides one tenant-bound transaction and
  // resolves its repository from that exact manager, so upcoming FORCE RLS
  // policies authorize the access via `app.tenant_id`.
  constructor(private readonly dataSource: DataSource) {}

  private requireTenant(tenantId?: string): string {
    if (!tenantId) {
      throw new Error('Tenant context is required');
    }
    return tenantId;
  }

  /**
   * S3 (H2): the UOM conversion guard existed but had a single caller — the
   * seed script. The live catalog routes persisted an incoherent conversion in
   * silence, and the following purchase then measured stock and cost against
   * it. The domain error is mapped to a 400 here so the operator gets business
   * copy and never a 500.
   *
   * The guard resolves the units against the PLATFORM catalog plus the
   * TENANT's own UOM catalog: a unit the operator registered in Catálogos
   * ("arroba", "cajilla") is a legitimate business unit whose content he
   * declares with the factor, not a typo to be rejected. Before this, the
   * error message promised exactly that ("Regístrala en el catálogo") while
   * the guard consulted the platform catalog only.
   */
  private async assertUomConversion(
    tenantId: string,
    purchaseUom: string,
    consumptionUom: string,
    conversionFactor: number,
    manager?: EntityManager,
  ): Promise<void> {
    const tenantUomCodes = await this.loadTenantUomCodes(tenantId, manager);
    try {
      validateInsumoConversion(purchaseUom, consumptionUom, conversionFactor, {
        tenantUomCodes,
      });
    } catch (error) {
      if (error instanceof UnconfiguredConversionError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  /**
   * The unit codes the tenant registered in its own UOM catalog. Read inside
   * the caller's tenant-bound context so RLS keeps the read tenant-scoped:
   * when the caller already holds a bound manager, that manager is reused
   * (no second connection, no nested transaction).
   */
  private async loadTenantUomCodes(
    tenantId: string,
    manager?: EntityManager,
  ): Promise<string[]> {
    const read = async (m: EntityManager): Promise<string[]> => {
      const values = await m.getRepository(CatalogValue).find({
        where: { tenant_id: tenantId, catalog_type: CATALOG_TYPE.UOM },
        select: { code: true },
      });
      return values.map((v) => v.code);
    };

    if (manager) {
      return read(manager);
    }

    return runInTenantTransaction(this.dataSource, tenantId, read);
  }

  /**
   * The conversion is re-checked only when the update actually touches a UOM
   * field. An unrelated edit (a name or a par level) must not fail because a
   * legacy row carries an incoherent conversion the operator is not touching.
   */
  private async assertUomConversionOnUpdate(
    tenantId: string,
    dto: UpdateInsumoDto,
    insumo: Insumo,
    manager: EntityManager,
  ): Promise<void> {
    const touchesUom =
      dto.purchaseUom !== undefined ||
      dto.consumptionUom !== undefined ||
      dto.conversionFactor !== undefined;

    if (!touchesUom) {
      return;
    }

    await this.assertUomConversion(
      tenantId,
      dto.purchaseUom ?? insumo.purchaseUom,
      dto.consumptionUom ?? insumo.consumptionUom,
      dto.conversionFactor ?? Number(insumo.conversionFactor ?? 1),
      manager,
    );
  }

  @Get()
  async list(
    @Query('includeInactive') includeInactive?: string,
    @GetTenantId() tenantId?: string,
  ): Promise<InsumoResponse[]> {
    const normalizedTenantId = this.requireTenant(tenantId);

    const where: Record<string, unknown> = {
      tenant_id: normalizedTenantId,
    };

    if (includeInactive !== 'true') {
      where.is_active = true;
    }

    const insumos = await runInTenantTransaction(
      this.dataSource,
      normalizedTenantId,
      (manager) =>
        manager.getRepository(Insumo).find({
          where,
          order: { name: 'ASC' },
        }),
    );
    return serializeInsumos(insumos);
  }

  @Post()
  async create(
    @Body() dto: CreateInsumoDto,
    @GetTenantId() tenantId?: string,
  ): Promise<InsumoResponse> {
    const normalizedTenantId = this.requireTenant(tenantId);
    await this.assertUomConversion(
      normalizedTenantId,
      dto.purchaseUom,
      dto.consumptionUom,
      dto.conversionFactor ?? 1,
    );

    const saved = await runInTenantTransaction(
      this.dataSource,
      normalizedTenantId,
      async (manager) => {
        const repo = manager.getRepository(Insumo);

        const existing = await repo.findOne({
          where: {
            tenant_id: normalizedTenantId,
            name: dto.name,
          },
        });
        if (existing) {
          throw new ConflictException(
            `Ya existe un insumo con el nombre '${dto.name}'`,
          );
        }

        // FD-02: `ALLOW_TEMPORARY` and the lot management CANNOT live
        // together. The policy means "sell even if there is no stock"; a lot
        // means the outflow has to be drawn from an identified lot, and a lot
        // without a real expiration date cannot be invented (NIC 2's specific
        // identification). So for a lot-managed insumo the two rules would
        // contradict each other — and the terminal would sell what the cloud
        // cannot record. Rejected here, with the reason.
        const effectivePerishable =
          dto.is_perishable ?? false;
        const effectivePolicy =
          dto.negativeStockPolicy ?? 'RESTRICT';
        if (
          effectivePerishable &&
          effectivePolicy === NEGATIVE_STOCK_POLICY.ALLOW_TEMPORARY
        ) {
          throw new BadRequestException(
            'Un insumo perecedero se gestiona por lotes: no puede ' +
              'usar la política ALLOW_TEMPORARY (vender sin existencias). ' +
              'Un lote sin fecha de vencimiento real no se puede crear, así ' +
              'que la nube no podría registrar esa venta.',
          );
        }

        const insumo = repo.create({
          tenant_id: normalizedTenantId,
          name: dto.name,
          purchaseUom: dto.purchaseUom,
          consumptionUom: dto.consumptionUom,
          conversionFactor: dto.conversionFactor ?? 1,
          parLevel: dto.parLevel ?? null,
          minStock: dto.minStock ?? null,
          averageCost: dto.averageCost ?? 0,
          is_perishable: dto.is_perishable ?? false,
          negativeStockPolicy: dto.negativeStockPolicy ?? 'RESTRICT',
          warehouse_id: dto.warehouse_id ?? null,
          ivaRatePct: dto.ivaRatePct ?? null,
          stock: 0,
          existenciaActual: 0,
          is_active: true,
        });

        return repo.save(insumo);
      },
    );
    return serializeInsumo(saved);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateInsumoDto,
    @GetTenantId() tenantId?: string,
  ): Promise<InsumoResponse> {
    const normalizedTenantId = this.requireTenant(tenantId);

    const saved = await runInTenantTransaction(
      this.dataSource,
      normalizedTenantId,
      async (manager) => {
        const repo = manager.getRepository(Insumo);

        const insumo = await repo.findOne({
          where: { id, tenant_id: normalizedTenantId },
        });
        if (!insumo) {
          throw new NotFoundException(`Insumo '${id}' no encontrado`);
        }

        await this.assertUomConversionOnUpdate(
          normalizedTenantId,
          dto,
          insumo,
          manager,
        );

        if (dto.name && dto.name !== insumo.name) {
          const duplicate = await repo.findOne({
            where: { tenant_id: normalizedTenantId, name: dto.name },
          });
          if (duplicate && duplicate.id !== id) {
            throw new ConflictException(
              `Ya existe otro insumo con el nombre '${dto.name}'`,
            );
          }
          insumo.name = dto.name;
        }

        if (dto.purchaseUom !== undefined) insumo.purchaseUom = dto.purchaseUom;
        if (dto.consumptionUom !== undefined)
          insumo.consumptionUom = dto.consumptionUom;
        if (dto.conversionFactor !== undefined)
          insumo.conversionFactor = dto.conversionFactor;
        if (dto.parLevel !== undefined) insumo.parLevel = dto.parLevel;
        if (dto.minStock !== undefined) insumo.minStock = dto.minStock;
        if (dto.averageCost !== undefined)
          insumo.averageCost = dto.averageCost;
        if (dto.is_perishable !== undefined)
          insumo.is_perishable = dto.is_perishable;
        if (dto.ivaRatePct !== undefined)
          insumo.ivaRatePct = dto.ivaRatePct;
        if (dto.negativeStockPolicy !== undefined)
          insumo.negativeStockPolicy = dto.negativeStockPolicy;
        if (dto.warehouse_id !== undefined)
          insumo.warehouse_id = dto.warehouse_id;
        if (dto.is_active !== undefined) insumo.is_active = dto.is_active;

        // FD-02: the same incompatibility, checked with the values that
        // RESULT from this update (the change may be in either field).
        if (
          insumo.is_perishable &&
          insumo.negativeStockPolicy === NEGATIVE_STOCK_POLICY.ALLOW_TEMPORARY
        ) {
          throw new BadRequestException(
            'Un insumo perecedero se gestiona por lotes: no puede ' +
              'usar la política ALLOW_TEMPORARY (vender sin existencias). ' +
              'Un lote sin fecha de vencimiento real no se puede crear, así ' +
              'que la nube no podría registrar esa venta.',
          );
        }

        return repo.save(insumo);
      },
    );
    return serializeInsumo(saved);
  }
}
