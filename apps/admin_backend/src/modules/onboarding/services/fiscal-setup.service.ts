import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Tenant } from '../../tenant/entities/tenant.entity';
import {
  SystemParametersConfig,
  SystemParametersConfigActiveView,
} from '../../inventory/entities/system-parameters-config.entity';
import {
  FiscalRegime,
  FiscalSetupDto,
  FiscalSetupResponse,
} from '../dto/fiscal-setup.dto';
import { isValidRuc } from '../utils/nicaragua-fiscal.validator';
import { NICARAGUA_FISCAL_ID_REQUIRED_MESSAGE } from '../validators/is-valid-nicaragua-fiscal-id.validator';
import {
  FiscalConfigSnapshot,
  FiscalConfigVersion,
} from '../dto/fiscal-config-version.dto';
import { FiscalConfigVersionService } from './fiscal-config-version.service';
import { bindTenantContext } from '../../../core/database/tenant-transaction';
import {
  OnboardingSessionService,
  OnboardingStartSource,
} from './onboarding-session.service';
import { OnboardingStateReconciler } from './onboarding-state.reconciler';

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
    private readonly eventEmitter: EventEmitter2,
    private readonly dataSource: DataSource,
    @Optional()
    @Inject(forwardRef(() => OnboardingSessionService))
    private readonly sessionService?: OnboardingSessionService,
    @Optional()
    @Inject(forwardRef(() => OnboardingStateReconciler))
    private readonly stateReconciler?: OnboardingStateReconciler,
    @Optional()
    @Inject(forwardRef(() => FiscalConfigVersionService))
    private readonly fiscalConfigVersionService?: FiscalConfigVersionService,
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

    // The view is WITH (security_invoker = true): it must be read on the
    // same connection whose transaction has the tenant context bound, or RLS
    // either returns zero rows (the API would silently serve fallback
    // defaults) or throws on the blank app.tenant_id setting. Mirrors the
    // write path's transaction below.
    const activeParams = await this.dataSource.transaction(
      async (manager: EntityManager) => {
        await bindTenantContext(manager, trimmedTenantId);
        return manager.find(SystemParametersConfigActiveView, {
          where: { tenant_id: trimmedTenantId },
        });
      },
    );

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

    let configVersion: FiscalConfigVersion | undefined;
    if (this.fiscalConfigVersionService) {
      const latest =
        await this.fiscalConfigVersionService.getLatestRevision(
          trimmedTenantId,
        );
      if (latest) {
        configVersion = {
          revision: latest.revision,
          fingerprint: latest.fingerprint,
        };
      }
    }

    return {
      tenantId: tenant.id,
      businessName: tenant.name,
      ruc: tenant.ruc,
      regime,
      taxRateIva,
      pricesIncludeTax,
      commercialFxSpread,
      configVersion,
    };
  }

  async getFiscalConfigSnapshot(
    tenantId: string,
  ): Promise<FiscalConfigSnapshot> {
    const trimmedTenantId = tenantId?.trim();
    if (!trimmedTenantId) {
      throw new BadRequestException('Tenant ID is required');
    }
    if (!this.fiscalConfigVersionService) {
      throw new BadRequestException(
        'FiscalConfigVersionService is not configured',
      );
    }
    return this.fiscalConfigVersionService.getFiscalConfigSnapshot(
      trimmedTenantId,
    );
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

    // Defense-in-depth (FR-1): never silently persist a blank/invalid RUC as
    // NULL. The ValidationPipe normally rejects it at the HTTP boundary; a
    // directly-constructed DTO reaching this service must be rejected here
    // too, before any mutation — the prior tenant RUC stays untouched.
    const trimmedRuc = dto.ruc?.trim() ?? '';
    if (!isValidRuc(trimmedRuc)) {
      throw new BadRequestException(NICARAGUA_FISCAL_ID_REQUIRED_MESSAGE);
    }

    const targetTaxRate =
      dto.regime === FiscalRegime.REGIMEN_GENERAL
        ? DGI_NICARAGUA_TAX_RATES.REGIMEN_GENERAL
        : DGI_NICARAGUA_TAX_RATES.CUOTA_FIJA;

    const configuredAt = new Date();

    const result = await this.dataSource.transaction(
      async (manager: EntityManager) => {
        // 0. Bind transaction-local tenant context for RLS-protected access
        await bindTenantContext(manager, trimmedTenantId);

        // 1. Update Tenant entity
        const tenant = await manager.findOne(Tenant, {
          where: { id: trimmedTenantId },
        });

        if (!tenant) {
          throw new NotFoundException(`Tenant '${trimmedTenantId}' not found`);
        }

        tenant.name = dto.businessName.trim();
        tenant.ruc = trimmedRuc;
        // NOTE: tenant.slug is intentionally NOT updated here (issue #556,
        // founder decision): the slug is a stable provisioning identifier,
        // not a display name, so a business rename leaves it unchanged.
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

        // 3. Record or Update FiscalConfigVersion
        let configVersion: FiscalConfigVersion | undefined;
        if (this.fiscalConfigVersionService) {
          configVersion =
            await this.fiscalConfigVersionService.recordRevisionChange(
              trimmedTenantId,
              manager,
            );
        }

        // 4. Emit Domain Audit Event
        this.eventEmitter.emit('ONBOARDING_FISCAL_SETUP_COMPLETED', {
          tenantId: trimmedTenantId,
          userId,
          regime: dto.regime,
          taxRateIva: targetTaxRate,
          commercialFxSpread: dto.commercialFxSpread,
          pricesIncludeTax: dto.pricesIncludeTax,
          configVersion,
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
          configVersion,
          configuredAt,
        };
      },
    );

    if (this.sessionService) {
      await this.sessionService.ensureOnboardingStarted({
        tenantId: trimmedTenantId,
        actorUserId: userId,
        source: OnboardingStartSource.FISCAL_SETUP,
      });
    }
    if (this.stateReconciler) {
      await this.stateReconciler.reconcile(trimmedTenantId);
    }

    return result;
  }

  private async upsertParameter(
    manager: EntityManager,
    tenantId: string,
    paramKey: string,
    paramValue: Record<string, unknown> | number | string | boolean,
    userId?: string,
  ): Promise<void> {
    // Resolve the current active version through the active-configuration
    // view: it honours is_active and effective_to and resolves a single
    // governing row per key deterministically (DISTINCT ON, version DESC).
    const activeParams = await manager.find(SystemParametersConfigActiveView, {
      where: { tenant_id: tenantId, paramKey },
      order: { version: 'DESC' },
    });

    const activeParam = activeParams[0] || null;

    if (activeParam) {
      if (activeParam.paramValue === paramValue) {
        return;
      }
    }

    // Append-only contract (issue #377): the table is append-only — trigger
    // trg_sys_parametros_config_immutable rejects UPDATE and DELETE — so
    // supersession NEVER saves a loaded row. It inserts a new version and
    // leaves every existing row untouched; the view decides which governs.
    const nextVersion = manager.create(SystemParametersConfig, {
      tenant_id: tenantId,
      paramKey,
      paramValue,
      version: (activeParam?.version ?? 0) + 1,
      effectiveFrom: new Date(),
      effectiveTo: null,
      isActive: true,
      createdBy: userId,
    });

    await manager.save(SystemParametersConfig, nextVersion);
  }
}
