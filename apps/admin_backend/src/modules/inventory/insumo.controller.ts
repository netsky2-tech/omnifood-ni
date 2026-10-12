import {
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
import { Insumo } from './entities/insumo.entity';
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
import { DataSource } from 'typeorm';
import { runInTenantTransaction } from '../../core/database/tenant-transaction';

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
        if (dto.negativeStockPolicy !== undefined)
          insumo.negativeStockPolicy = dto.negativeStockPolicy;
        if (dto.warehouse_id !== undefined)
          insumo.warehouse_id = dto.warehouse_id;
        if (dto.is_active !== undefined) insumo.is_active = dto.is_active;

        return repo.save(insumo);
      },
    );
    return serializeInsumo(saved);
  }
}
