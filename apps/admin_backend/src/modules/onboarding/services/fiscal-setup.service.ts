import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Tenant } from '../../tenant/entities/tenant.entity';
import { SystemParametersConfig } from '../../inventory/entities/system-parameters-config.entity';
import {
  FiscalRegime,
  FiscalSetupDto,
  FiscalSetupResponse,
} from '../dto/fiscal-setup.dto';

export const FISCAL_PARAM_KEYS = {
  FISCAL_REGIME: 'FISCAL_REGIME',
  TAX_RATE_IVA: 'TAX_RATE_IVA',
  PRICES_INCLUDE_TAX: 'PRICES_INCLUDE_TAX',
  COMMERCIAL_FX_SPREAD: 'COMMERCIAL_FX_SPREAD',
} as const;

export const DGI_NICARAGUA_TAX_RATES = {
  CUOTA_FIJA: 0.0,
  REGIMEN_GENERAL: 0.15,
} as const;

export { FiscalRegime };

@Injectable()
export class FiscalSetupService {
  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(SystemParametersConfig)
    private readonly sysParamRepo: Repository<SystemParametersConfig>,
    private readonly eventEmitter: EventEmitter2,
    private readonly dataSource: DataSource,
  ) {}

  async getFiscalSetup(tenantId: string): Promise<FiscalSetupResponse> {
    const trimmedTenantId = tenantId?.trim();
    if (!trimmedTenantId) {
      throw new BadRequestException('Tenant ID is required');
    }

    const tenant = await this.tenantRepo.findOne({
      where: { id: trimmedTenantId },
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant '${trimmedTenantId}' not found`);
    }

    const activeParams = await this.sysParamRepo.find({
      where: { tenant_id: trimmedTenantId, isActive: true },
    });

    const paramMap = new Map<string, unknown>();
    for (const p of activeParams) {
      paramMap.set(p.paramKey, p.paramValue);
    }

    const rawRegime = paramMap.get(FISCAL_PARAM_KEYS.FISCAL_REGIME);
    const regime =
      rawRegime === FiscalRegime.REGIMEN_GENERAL
        ? FiscalRegime.REGIMEN_GENERAL
        : FiscalRegime.CUOTA_FIJA;

    const rawTaxRate = paramMap.get(FISCAL_PARAM_KEYS.TAX_RATE_IVA);
    const taxRateIva =
      typeof rawTaxRate === 'number'
        ? rawTaxRate
        : regime === FiscalRegime.REGIMEN_GENERAL
          ? DGI_NICARAGUA_TAX_RATES.REGIMEN_GENERAL
          : DGI_NICARAGUA_TAX_RATES.CUOTA_FIJA;

    const rawPricesIncludeTax = paramMap.get(
      FISCAL_PARAM_KEYS.PRICES_INCLUDE_TAX,
    );
    const pricesIncludeTax =
      typeof rawPricesIncludeTax === 'boolean' ? rawPricesIncludeTax : true;

    const rawFxSpread = paramMap.get(FISCAL_PARAM_KEYS.COMMERCIAL_FX_SPREAD);
    const commercialFxSpread =
      typeof rawFxSpread === 'number' ? rawFxSpread : 0.5;

    return {
      tenantId: tenant.id,
      businessName: tenant.name,
      ruc: tenant.ruc,
      regime,
      taxRateIva,
      pricesIncludeTax,
      commercialFxSpread,
    };
  }

  async configureFiscalSetup(
    tenantId: string,
    dto: FiscalSetupDto,
    userId?: string,
  ): Promise<FiscalSetupResponse> {
    const trimmedTenantId = tenantId?.trim();
    if (!trimmedTenantId) {
      throw new BadRequestException('Tenant ID is required');
    }

    if (
      dto.commercialFxSpread === undefined ||
      dto.commercialFxSpread === null ||
      dto.commercialFxSpread < 0
    ) {
      throw new BadRequestException(
        'commercialFxSpread must be greater than or equal to 0',
      );
    }

    const targetTaxRate =
      dto.regime === FiscalRegime.REGIMEN_GENERAL
        ? DGI_NICARAGUA_TAX_RATES.REGIMEN_GENERAL
        : DGI_NICARAGUA_TAX_RATES.CUOTA_FIJA;

    const configuredAt = new Date();

    return this.dataSource.transaction(async (manager: EntityManager) => {
      // 1. Update Tenant entity
      const tenant = await manager.findOne(Tenant, {
        where: { id: trimmedTenantId },
      });

      if (!tenant) {
        throw new NotFoundException(`Tenant '${trimmedTenantId}' not found`);
      }

      tenant.name = dto.businessName.trim();
      tenant.ruc = dto.ruc?.trim() || null;
      await manager.save(Tenant, tenant);

      // 2. Upsert / Version System Parameters
      await this.upsertParameter(
        manager,
        trimmedTenantId,
        FISCAL_PARAM_KEYS.FISCAL_REGIME,
        dto.regime,
        userId,
      );

      await this.upsertParameter(
        manager,
        trimmedTenantId,
        FISCAL_PARAM_KEYS.TAX_RATE_IVA,
        targetTaxRate,
        userId,
      );

      await this.upsertParameter(
        manager,
        trimmedTenantId,
        FISCAL_PARAM_KEYS.PRICES_INCLUDE_TAX,
        dto.pricesIncludeTax,
        userId,
      );

      await this.upsertParameter(
        manager,
        trimmedTenantId,
        FISCAL_PARAM_KEYS.COMMERCIAL_FX_SPREAD,
        dto.commercialFxSpread,
        userId,
      );

      // 3. Emit Domain Audit Event
      this.eventEmitter.emit('ONBOARDING_FISCAL_SETUP_COMPLETED', {
        tenantId: trimmedTenantId,
        userId,
        regime: dto.regime,
        taxRateIva: targetTaxRate,
        commercialFxSpread: dto.commercialFxSpread,
        pricesIncludeTax: dto.pricesIncludeTax,
        configuredAt,
      });

      return {
        tenantId: trimmedTenantId,
        businessName: tenant.name,
        ruc: tenant.ruc,
        regime: dto.regime,
        taxRateIva: targetTaxRate,
        pricesIncludeTax: dto.pricesIncludeTax,
        commercialFxSpread: dto.commercialFxSpread,
        configuredAt,
      };
    });
  }

  private async upsertParameter(
    manager: EntityManager,
    tenantId: string,
    paramKey: string,
    paramValue: Record<string, unknown> | number | string | boolean,
    userId?: string,
  ): Promise<void> {
    const activeParams = await manager.find(SystemParametersConfig, {
      where: { tenant_id: tenantId, paramKey, isActive: true },
      order: { version: 'DESC' },
    });

    const activeParam = activeParams[0] || null;

    if (activeParam) {
      if (activeParam.paramValue === paramValue) {
        return;
      }

      // Deactivate prior version
      activeParam.isActive = false;
      activeParam.effectiveTo = new Date();
      await manager.save(SystemParametersConfig, activeParam);

      // Create next version
      const newVersion = manager.create(SystemParametersConfig, {
        tenant_id: tenantId,
        paramKey,
        paramValue,
        version: activeParam.version + 1,
        effectiveFrom: new Date(),
        effectiveTo: null,
        isActive: true,
        createdBy: userId,
      });

      await manager.save(SystemParametersConfig, newVersion);
    } else {
      const initialVersion = manager.create(SystemParametersConfig, {
        tenant_id: tenantId,
        paramKey,
        paramValue,
        version: 1,
        effectiveFrom: new Date(),
        effectiveTo: null,
        isActive: true,
        createdBy: userId,
      });

      await manager.save(SystemParametersConfig, initialVersion);
    }
  }
}
