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
  MAX_DISCOUNT_AMOUNT_MIN_MESSAGE,
  MAX_DISCOUNT_PERCENT_RANGE_MESSAGE,
  readCheckoutFxModeOrNull,
  readTenantOperationModeOrNull,
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
  // BXW-007 U1: Business Profile operation mode + checkout FX source, so the
  // fiscal config snapshot (and the POS sync) carries both.
  OPERATION_MODE: 'OPERATION_MODE',
  CHECKOUT_FX_MODE: 'CHECKOUT_FX_MODE',
  // D-21 (#554): optional DGI authorization letter fields.
  DGI_AUTHORIZATION_CODE: 'DGI_AUTHORIZATION_CODE',
  DGI_AUTHORIZATION_ISSUED_AT: 'DGI_AUTHORIZATION_ISSUED_AT',
  DGI_AUTHORIZATION_EXPIRES_AT: 'DGI_AUTHORIZATION_EXPIRES_AT',
  // SOHO P3 (D-A): optional per-business MAXIMUM manual discount caps.
  // Stored as jsonb numbers; a governing null (tombstone) or an absent key
  // means NO CAP — the POS applies no manual-discount limit.
  MAX_DISCOUNT_AMOUNT: 'MAX_DISCOUNT_AMOUNT',
  MAX_DISCOUNT_PERCENT: 'MAX_DISCOUNT_PERCENT',
} as const;

export const DGI_NICARAGUA_TAX_RATES = {
  CUOTA_FIJA: 0.0,
  REGIMEN_GENERAL: 0.15,
} as const;

/**
 * Issue #75: canonical commercial FX spread fallback (C$ per USD). The old
 * fallback of 0.5 was a dangerous default — a rate of C$0.50 per USD is
 * off by two orders of magnitude and would corrupt every checkout in USD.
 * 36.5 is the canonical Nicaragua commercial exchange rate and sits inside
 * the strict 10..100 validation range.
 */
export const DEFAULT_COMMERCIAL_FX_SPREAD = 36.5;

/**
 * Issue #75: strict FX range shared by the DTO boundary and this service
 * guard. The DTO owns the HTTP wording; the service guard is defense-in-depth
 * for directly-constructed DTOs.
 */
export const COMMERCIAL_FX_SPREAD_MIN = 10;
export const COMMERCIAL_FX_SPREAD_MAX = 100;

/**
 * SOHO P3 (D-A): strict manual-discount cap ranges shared by the DTO
 * boundary and this service guard. The DTO owns the HTTP wording; the
 * service guard is defense-in-depth for directly-constructed DTOs.
 * Amount: >= 0 (0 forbids manual discounts outright). Percent: > 0, <= 100.
 */
export const MAX_DISCOUNT_AMOUNT_MIN = 0;
export const MAX_DISCOUNT_PERCENT_MAX = 100;

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
      typeof rawFxSpread === 'number'
        ? rawFxSpread
        : DEFAULT_COMMERCIAL_FX_SPREAD;

    // BXW-007 U1 rev 2: absence must read as absence (D-16/D-21 spirit) — a
    // missing, non-string or non-member stored value reads as null, never as
    // a silently rebased default. "Never configured" stays distinguishable
    // from "configured with the POS default".
    const operationMode = readTenantOperationModeOrNull(
      paramMap.get(FISCAL_PARAM_KEYS.OPERATION_MODE),
    );
    const checkoutFxMode = readCheckoutFxModeOrNull(
      paramMap.get(FISCAL_PARAM_KEYS.CHECKOUT_FX_MODE),
    );

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
      operationMode,
      checkoutFxMode,
      ...this.dgiAuthorizationFields(paramMap),
      ...this.discountCapFields(paramMap),
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
      dto.commercialFxSpread < COMMERCIAL_FX_SPREAD_MIN ||
      dto.commercialFxSpread > COMMERCIAL_FX_SPREAD_MAX
    ) {
      throw new BadRequestException(
        'commercialFxSpread must be between 10 and 100',
      );
    }

    // SOHO P3 (D-A): defense-in-depth for the discount caps, mirroring the
    // FX spread guard — a directly-constructed DTO reaching this service
    // must be rejected here too, before any mutation.
    if (
      dto.maxDiscountAmount !== undefined &&
      dto.maxDiscountAmount !== null &&
      dto.maxDiscountAmount < MAX_DISCOUNT_AMOUNT_MIN
    ) {
      throw new BadRequestException(MAX_DISCOUNT_AMOUNT_MIN_MESSAGE);
    }
    if (
      dto.maxDiscountPercent !== undefined &&
      dto.maxDiscountPercent !== null &&
      (dto.maxDiscountPercent <= 0 ||
        dto.maxDiscountPercent > MAX_DISCOUNT_PERCENT_MAX)
    ) {
      throw new BadRequestException(MAX_DISCOUNT_PERCENT_RANGE_MESSAGE);
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

        // BXW-007 U1 rev 2: the mode params ride the same upsert-or-clear
        // channel as the DGI fields — an absent key asserts NOTHING and
        // leaves the prior row untouched; only before recordRevisionChange
        // so a material write lands in the same revision.
        await this.upsertOrClearParameter(
          manager,
          trimmedTenantId,
          FISCAL_PARAM_KEYS.OPERATION_MODE,
          dto.operationMode,
          userId,
        );

        await this.upsertOrClearParameter(
          manager,
          trimmedTenantId,
          FISCAL_PARAM_KEYS.CHECKOUT_FX_MODE,
          dto.checkoutFxMode,
          userId,
        );

        // D-21 (#554): optional DGI authorization fields. An absent field
        // leaves any prior authorization untouched; a blank code clears it
        // through a superseding null tombstone (append-only contract).
        await this.upsertOrClearParameter(
          manager,
          trimmedTenantId,
          FISCAL_PARAM_KEYS.DGI_AUTHORIZATION_CODE,
          dto.dgiAuthorizationCode,
          userId,
        );

        await this.upsertOrClearParameter(
          manager,
          trimmedTenantId,
          FISCAL_PARAM_KEYS.DGI_AUTHORIZATION_ISSUED_AT,
          dto.dgiAuthorizationIssuedAt,
          userId,
        );

        await this.upsertOrClearParameter(
          manager,
          trimmedTenantId,
          FISCAL_PARAM_KEYS.DGI_AUTHORIZATION_EXPIRES_AT,
          dto.dgiAuthorizationExpiresAt,
          userId,
        );

        // SOHO P3 (D-A): the discount caps ride the same upsert-or-clear
        // channel — an absent field leaves the prior cap untouched; an
        // explicit null writes a superseding tombstone (NO CAP). Values are
        // numeric jsonb, so the numeric channel persists the number itself.
        await this.upsertOrClearNumberParameter(
          manager,
          trimmedTenantId,
          FISCAL_PARAM_KEYS.MAX_DISCOUNT_AMOUNT,
          dto.maxDiscountAmount,
          userId,
        );
        await this.upsertOrClearNumberParameter(
          manager,
          trimmedTenantId,
          FISCAL_PARAM_KEYS.MAX_DISCOUNT_PERCENT,
          dto.maxDiscountPercent,
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

        // D-21 (#554): the POST response must reflect the effective post-write
        // state — the dashboard overwrites its query cache with it, so a just-
        // saved value must appear and a cleared one must read as null (D-16).
        const postWriteParams = await manager.find(
          SystemParametersConfigActiveView,
          { where: { tenant_id: trimmedTenantId } },
        );
        const postWriteMap = new Map<string, unknown>();
        for (const p of postWriteParams) {
          postWriteMap.set(p.paramKey, p.paramValue);
        }

        return {
          tenantId: trimmedTenantId,
          businessName: tenant.name,
          ruc: tenant.ruc,
          regime: dto.regime,
          taxRateIva: targetTaxRate,
          pricesIncludeTax: dto.pricesIncludeTax,
          commercialFxSpread: dto.commercialFxSpread,
          // BXW-007 U1 rev 2: read back through the post-write view so the
          // POST response reflects the effective persisted state — an omitted
          // key reads the prior governing value, or null if never configured.
          operationMode: readTenantOperationModeOrNull(
            postWriteMap.get(FISCAL_PARAM_KEYS.OPERATION_MODE),
          ),
          checkoutFxMode: readCheckoutFxModeOrNull(
            postWriteMap.get(FISCAL_PARAM_KEYS.CHECKOUT_FX_MODE),
          ),
          ...this.dgiAuthorizationFields(postWriteMap),
          ...this.discountCapFields(postWriteMap),
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

  /**
   * D-21 (#554): serializes the DGI authorization fields for the GET/POST
   * response. An absent, blank or tombstoned (null) row reads as null —
   * absence must look like absence (D-16).
   */
  private dgiAuthorizationFields(paramMap: Map<string, unknown>): {
    dgiAuthorizationCode: string | null;
    dgiAuthorizationIssuedAt: string | null;
    dgiAuthorizationExpiresAt: string | null;
  } {
    const read = (key: string): string | null => {
      const value = paramMap.get(key);
      return typeof value === 'string' && value.trim() !== '' ? value : null;
    };
    return {
      dgiAuthorizationCode: read(FISCAL_PARAM_KEYS.DGI_AUTHORIZATION_CODE),
      dgiAuthorizationIssuedAt: read(
        FISCAL_PARAM_KEYS.DGI_AUTHORIZATION_ISSUED_AT,
      ),
      dgiAuthorizationExpiresAt: read(
        FISCAL_PARAM_KEYS.DGI_AUTHORIZATION_EXPIRES_AT,
      ),
    };
  }

  /**
   * Upserts a string parameter, or clears it. D-16 spirit: absence must
   * look like absence. An absent field is a no-op (the prior authorization
   * stays untouched); a blank/empty string — or an explicit null (the
   * transformed clear sentinel for the dates) — clears the value — never by
   * storing '' (which would read as a value), and never by mutating the
   * table: the append-only trigger rejects UPDATE/DELETE, so clearing
   * inserts a superseding row whose value is null and lets the active view
   * resolve it as the governing (absent) version.
   */
  private async upsertOrClearParameter(
    manager: EntityManager,
    tenantId: string,
    paramKey: string,
    value: string | null | undefined,
    userId?: string,
  ): Promise<void> {
    if (value === undefined) {
      return;
    }
    const trimmed = (value ?? '').trim();
    await this.upsertParameter(
      manager,
      tenantId,
      paramKey,
      trimmed === '' ? null : trimmed,
      userId,
    );
  }

  /**
   * SOHO P3 (D-A): serializes the manual-discount caps for the GET/POST
   * response. An absent, tombstoned (null) or corrupt (non-numeric) row
   * reads as null — absence must look like absence (D-16), and a corrupt
   * value must never fabricate a cap.
   *
   * ENFORCEMENT RULE the POS mirrors (canonical statement in
   * FiscalConfigVersionService.getEffectiveFiscalPayload): a manual
   * discount is ALLOWED only when it is less than or equal to EVERY
   * configured cap — discount <= maxDiscountAmount AND discount <=
   * (maxDiscountPercent / 100) x gross subtotal; the effective cap is the
   * MINIMUM of the configured caps. A configured cap of 0 forbids any
   * discount; when both are null (or absent), the discount is NOT limited.
   */
  private discountCapFields(paramMap: Map<string, unknown>): {
    maxDiscountAmount: number | null;
    maxDiscountPercent: number | null;
  } {
    const read = (key: string): number | null => {
      const value = paramMap.get(key);
      return typeof value === 'number' && Number.isFinite(value)
        ? value
        : null;
    };
    return {
      maxDiscountAmount: read(FISCAL_PARAM_KEYS.MAX_DISCOUNT_AMOUNT),
      maxDiscountPercent: read(FISCAL_PARAM_KEYS.MAX_DISCOUNT_PERCENT),
    };
  }

  /**
   * Upserts a numeric parameter, or clears it. SOHO P3 (D-A) numeric twin of
   * upsertOrClearParameter: an absent field is a no-op (the prior cap stays
   * untouched); an explicit null clears through a superseding null tombstone
   * (append-only contract) — never by mutating the table.
   */
  private async upsertOrClearNumberParameter(
    manager: EntityManager,
    tenantId: string,
    paramKey: string,
    value: number | null | undefined,
    userId?: string,
  ): Promise<void> {
    if (value === undefined) {
      return;
    }
    await this.upsertParameter(
      manager,
      tenantId,
      paramKey,
      value === null ? null : value,
      userId,
    );
  }

  private async upsertParameter(
    manager: EntityManager,
    tenantId: string,
    paramKey: string,
    paramValue: Record<string, unknown> | number | string | boolean | null,
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
