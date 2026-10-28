import { Controller, Get, UseGuards, UseInterceptors } from '@nestjs/common';
import { UOM_CATALOG } from '../uom-catalog';
import { GetTenantId } from '../../../core/decorators/tenant.decorator';
import { TenantInterceptor } from '../../../core/database/rls.interceptor';
import { AuthGuard } from '../../identity/guards/auth.guard';
import { RolesGuard } from '../../identity/guards/roles.guard';
import { Roles } from '../../../core/decorators/roles.decorator';
import { UserRole } from '../../identity/entities/user.entity';

export interface UomCatalogEntryResponse {
  /** Stable platform code (normalized, singular). */
  code: string;
  /** Display name (Spanish, the operator's language). */
  name: string;
  /** mass | volume | count | container | serving */
  dimension: string;
  /**
   * Units of the dimension anchor one entry equals. NULL for the
   * container/serving families, which carry no universal factor.
   */
  factorToAnchor: number | null;
  /** Accepted spellings (normalized at resolution time). */
  aliases: string[];
}

/**
 * The PLATFORM units-of-measure catalog, with the anchor factors.
 *
 * The insumo form used to carry its own hardcoded list of "common factors"
 * (LB→G 454, KG→G 1000, DOCENA→UN 12). That list drifted from the platform
 * catalog: the platform anchor for a pound is 453.59237 g, so the suggested
 * 454 was REJECTED by the server the moment the operator saved — the form
 * offered a value the backend refused.
 *
 * This route makes the platform catalog the single source of truth: the form
 * derives the factor of any purchase→consumption pair from the anchors
 * (factor = purchase.factorToAnchor / consumption.factorToAnchor) and can
 * never suggest a value the guard would reject.
 */
@Controller('inventory/uom-catalog')
@UseGuards(AuthGuard, RolesGuard)
@UseInterceptors(TenantInterceptor)
export class UomCatalogController {
  @Get()
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async list(
    @GetTenantId() _tenantId?: string,
  ): Promise<UomCatalogEntryResponse[]> {
    return UOM_CATALOG.map((entry) => ({
      code: entry.code,
      name: entry.name,
      dimension: entry.dimension,
      factorToAnchor: entry.factorToAnchor,
      aliases: [...entry.aliases],
    }));
  }
}
