import {
  Controller,
  Get,
  Query,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { InventoryDivergenceService } from '../services/inventory-divergence.service';
import { GetTenantId } from '../../../core/decorators/tenant.decorator';
import { TenantInterceptor } from '../../../core/database/rls.interceptor';
import { AuthGuard } from '../../identity/guards/auth.guard';
import { RolesGuard } from '../../identity/guards/roles.guard';
import { Roles } from '../../../core/decorators/roles.decorator';
import { UserRole } from '../../identity/entities/user.entity';
import type { InventoryDivergenceStatus } from '../entities/inventory-divergence.entity';

/**
 * FD-01 (openspec/changes/fiscal-no-se-congela-por-inventario): the surface
 * where the tenant sees what did not add up.
 *
 * Two reads, and both of them exist because the owner needs the WORK LIST,
 * not the alarm:
 * - the divergences themselves (what was sold that nothing backed, and how
 *   much money it represents);
 * - the parity diagnostic (which insumo's stock does not add up to its lots),
 *   because that is where the differences COME FROM.
 */
@Controller('inventory/divergences')
@UseInterceptors(TenantInterceptor)
@UseGuards(AuthGuard, RolesGuard)
export class InventoryDivergenceController {
  constructor(private readonly divergenceService: InventoryDivergenceService) {}

  @Get()
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async list(
    @GetTenantId() tenantId: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<unknown> {
    const parsedStatus = this.parseStatus(status);
    const parsedLimit = this.parseInteger(limit, 50, 1, 200);
    const parsedOffset = this.parseInteger(offset, 0, 0, 1_000_000);

    const { total, items } = await this.divergenceService.list(tenantId, {
      status: parsedStatus,
      limit: parsedLimit,
      offset: parsedOffset,
    });

    return {
      total,
      limit: parsedLimit,
      offset: parsedOffset,
      items: items.map((item) => ({
        id: item.id,
        invoiceId: item.invoice_id,
        invoiceNumber: item.invoice_number,
        insumoId: item.insumo_id,
        quantity: Number(item.quantity),
        unitCostNio: Number(item.unit_cost_nio),
        amountNio: Number(item.amount_nio),
        cause: item.cause,
        status: item.status,
        sourceDeviceId: item.source_device_id,
        sourceSequence: item.source_sequence,
        detail: item.detail,
        createdAt: item.created_at,
        reconciledAt: item.reconciled_at,
        reconciliationRef: item.reconciliation_ref,
        resolutionNote: item.resolution_note,
      })),
    };
  }

  /**
   * The ORIGIN of the differences: the insumos whose aggregate stock does not
   * add up to the sum of their lot balances.
   */
  @Get('parity')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async parity(@GetTenantId() tenantId: string): Promise<unknown> {
    const gaps = await this.divergenceService.findParityGaps(tenantId);
    return { total: gaps.length, items: gaps };
  }

  private parseStatus(status?: string): InventoryDivergenceStatus | undefined {
    if (status == null || status.trim() === '') return undefined;
    const normalized = status.trim().toUpperCase();
    if (normalized !== 'OPEN' && normalized !== 'RECONCILED') {
      throw new BadRequestException(
        `Invalid divergence status '${status}'. Expected OPEN or RECONCILED.`,
      );
    }
    return normalized;
  }

  private parseInteger(
    raw: string | undefined,
    fallback: number,
    min: number,
    max: number,
  ): number {
    if (raw == null || raw.trim() === '') return fallback;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      throw new BadRequestException(`Expected a number, received '${raw}'.`);
    }
    return Math.min(Math.max(Math.trunc(parsed), min), max);
  }
}
