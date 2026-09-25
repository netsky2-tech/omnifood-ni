import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { FiscalConfigRevision } from '../entities/fiscal-config-revision.entity';
import { Tenant } from '../../tenant/entities/tenant.entity';
import {
  SystemParametersConfig,
  SystemParametersConfigActiveView,
} from '../../inventory/entities/system-parameters-config.entity';
import {
  bindTenantContext,
  runInTenantTransaction,
} from '../../../core/database/tenant-transaction';
import {
  FiscalRegime,
  FISCAL_PARAM_KEYS,
  DGI_NICARAGUA_TAX_RATES,
} from './fiscal-setup.service';
import {
  EffectiveFiscalPayload,
  FiscalConfigSnapshot,
  FiscalConfigVersion,
} from '../dto/fiscal-config-version.dto';
import { computeJcsSha256 } from '../utils/canonical-jcs';

@Injectable()
export class FiscalConfigVersionService {
  constructor(
    @InjectRepository(FiscalConfigRevision)
    private readonly revisionRepo: Repository<FiscalConfigRevision>,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Constructs the normalized effective fiscal payload for a tenant.
   */
  async getEffectiveFiscalPayload(
    tenantId: string,
    manager?: EntityManager,
  ): Promise<EffectiveFiscalPayload> {
    const trimmedTenantId = tenantId?.trim();
    if (!trimmedTenantId) {
      throw new BadRequestException('Tenant ID is required');
    }

    if (manager) {
      await bindTenantContext(manager, trimmedTenantId);
    } else {
      return runInTenantTransaction(this.dataSource, trimmedTenantId, (mgr) =>
        this.getEffectiveFiscalPayload(trimmedTenantId, mgr),
      );
    }

    const tRepo = manager.getRepository(Tenant);
    const sRepo = manager.getRepository(SystemParametersConfigActiveView);

    const tenant = await tRepo.findOne({
      where: { id: trimmedTenantId },
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant '${trimmedTenantId}' not found`);
    }

    const activeParams = await sRepo.find({
      where: { tenant_id: trimmedTenantId },
    });

    const paramMap = new Map<string, unknown>();
    for (const p of activeParams) {
      paramMap.set(p.paramKey, p.paramValue);
    }

    const rawRegime = paramMap.get(FISCAL_PARAM_KEYS.FISCAL_REGIME);
    const fiscalRegime =
      rawRegime === FiscalRegime.REGIMEN_GENERAL
        ? FiscalRegime.REGIMEN_GENERAL
        : FiscalRegime.CUOTA_FIJA;

    const rawTaxRate = paramMap.get(FISCAL_PARAM_KEYS.TAX_RATE_IVA);
    const taxRate =
      typeof rawTaxRate === 'number'
        ? rawTaxRate
        : fiscalRegime === FiscalRegime.REGIMEN_GENERAL
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
      ruc: tenant.ruc || null,
      fiscalRegime,
      taxRate,
      pricesIncludeTax,
      commercialFxSpread,
    };
  }

  /**
   * Computes the deterministic SHA-256 fingerprint using JCS RFC-8785.
   */
  computeCanonicalFingerprint(payload: EffectiveFiscalPayload): string {
    return computeJcsSha256(payload);
  }

  /**
   * Retrieves the latest fiscal config revision entity for a tenant.
   */
  async getLatestRevision(
    tenantId: string,
    manager?: EntityManager,
  ): Promise<FiscalConfigRevision | null> {
    if (manager) {
      await bindTenantContext(manager, tenantId);
    } else {
      return runInTenantTransaction(this.dataSource, tenantId, (mgr) =>
        this.getLatestRevision(tenantId, mgr),
      );
    }

    const rRepo = manager.getRepository(FiscalConfigRevision);

    return rRepo.findOne({
      where: { tenant_id: tenantId.trim() },
      order: { revision: 'DESC' },
    });
  }

  /**
   * Records a new revision if the effective fiscal payload has materially changed.
   * If unchanged, returns the existing revision without incrementing.
   * If no revision exists, initializes revision 1.
   */
  async recordRevisionChange(
    tenantId: string,
    manager?: EntityManager,
  ): Promise<FiscalConfigVersion> {
    const trimmedTenantId = tenantId.trim();

    if (manager) {
      await bindTenantContext(manager, trimmedTenantId);
    } else {
      return runInTenantTransaction(this.dataSource, trimmedTenantId, (mgr) =>
        this.recordRevisionChange(trimmedTenantId, mgr),
      );
    }

    const effectivePayload = await this.getEffectiveFiscalPayload(
      trimmedTenantId,
      manager,
    );
    const newFingerprint = this.computeCanonicalFingerprint(effectivePayload);

    const rRepo = manager.getRepository(FiscalConfigRevision);

    const latest = await rRepo.findOne({
      where: { tenant_id: trimmedTenantId },
      order: { revision: 'DESC' },
    });

    if (!latest) {
      const baseline = rRepo.create({
        tenant_id: trimmedTenantId,
        revision: 1,
        fingerprint: newFingerprint,
        payload: effectivePayload as unknown as Record<string, unknown>,
      });
      await rRepo.save(baseline);
      return { revision: 1, fingerprint: newFingerprint };
    }

    if (latest.fingerprint === newFingerprint) {
      // Idempotent: no material change
      return { revision: latest.revision, fingerprint: latest.fingerprint };
    }

    // Material change: strictly monotonic increment
    const nextRevision = latest.revision + 1;
    const newRecord = rRepo.create({
      tenant_id: trimmedTenantId,
      revision: nextRevision,
      fingerprint: newFingerprint,
      payload: effectivePayload as unknown as Record<string, unknown>,
    });
    await rRepo.save(newRecord);

    return { revision: nextRevision, fingerprint: newFingerprint };
  }

  /**
   * Returns a complete FiscalConfigSnapshot for cloud sync.
   * Automatically initializes baseline revision 1 if none exists yet.
   */
  async getFiscalConfigSnapshot(
    tenantId: string,
    manager?: EntityManager,
  ): Promise<FiscalConfigSnapshot> {
    const trimmedTenantId = tenantId.trim();
    if (!trimmedTenantId) {
      throw new BadRequestException('Tenant ID is required');
    }

    if (manager) {
      await bindTenantContext(manager, trimmedTenantId);
    } else {
      return runInTenantTransaction(this.dataSource, trimmedTenantId, (mgr) =>
        this.getFiscalConfigSnapshot(trimmedTenantId, mgr),
      );
    }

    const payload = await this.getEffectiveFiscalPayload(
      trimmedTenantId,
      manager,
    );
    const latest = await this.getLatestRevision(trimmedTenantId, manager);

    if (!latest) {
      const version = await this.recordRevisionChange(trimmedTenantId, manager);
      return {
        tenantId: payload.tenantId,
        businessName: payload.businessName,
        ruc: payload.ruc,
        fiscalRegime: payload.fiscalRegime,
        taxRate: payload.taxRate,
        pricesIncludeTax: payload.pricesIncludeTax,
        commercialFxSpread: payload.commercialFxSpread,
        configVersion: version,
        generatedAt: new Date().toISOString(),
      };
    }

    return {
      tenantId: payload.tenantId,
      businessName: payload.businessName,
      ruc: payload.ruc,
      fiscalRegime: payload.fiscalRegime,
      taxRate: payload.taxRate,
      pricesIncludeTax: payload.pricesIncludeTax,
      commercialFxSpread: payload.commercialFxSpread,
      configVersion: {
        revision: latest.revision,
        fingerprint: latest.fingerprint,
      },
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Invariant Check: Same revision with different fingerprint triggers an integrity conflict.
   */
  async validateIntegrity(
    tenantId: string,
    revision: number,
    fingerprint: string,
    manager?: EntityManager,
  ): Promise<void> {
    if (manager) {
      await bindTenantContext(manager, tenantId);
    } else {
      return runInTenantTransaction(this.dataSource, tenantId, (mgr) =>
        this.validateIntegrity(tenantId, revision, fingerprint, mgr),
      );
    }

    const rRepo = manager.getRepository(FiscalConfigRevision);

    const record = await rRepo.findOne({
      where: { tenant_id: tenantId.trim(), revision },
    });

    if (record && record.fingerprint !== fingerprint.trim()) {
      throw new ConflictException(
        `INTEGRITY_CONFLICT: Revision ${revision} has conflicting fingerprint '${fingerprint}' vs recorded '${record.fingerprint}' for tenant '${tenantId}'`,
      );
    }
  }

  /**
   * B1c-2 slice A config surface (D-14, #554): provisions the tenant's
   * credit-note series. Fail-closed by design — nothing allocates until a
   * human enters the real values from SOHO's authorization letter. The row
   * is APPEND-ONLY supersession (the table trigger rejects UPDATE/DELETE):
   * insert a new version, the active view resolves the governing row.
   * Also the future home for B2a's server-side series work (#554).
   */
  async setCreditNoteSeries(
    tenantId: string,
    series: CreditNoteSeries,
    userId?: string,
  ): Promise<CreditNoteSeries> {
    // Validate before any write: rejections happen at the boundary.
    // Explicit discriminant comparison: this project runs with
    // strictNullChecks off, where truthiness narrowing of a discriminated
    // union does not apply.
    const parsed = parseCreditNoteSeries({
      ...(series.prefix !== undefined ? { prefix: series.prefix } : {}),
      nextNumber: series.nextNumber,
      ...(series.endNumber !== undefined ? { endNumber: series.endNumber } : {}),
    });
    if (parsed.ok === false) {
      throw new BadRequestException(`${parsed.reason}: ${parsed.detail}`);
    }
    const configured = parsed.series;

    return runInTenantTransaction(
      this.dataSource,
      tenantId,
      async (manager) => {
        const viewRepo = manager.getRepository(
          SystemParametersConfigActiveView,
        );
        const active = await viewRepo.findOne({
          where: { tenant_id: tenantId, paramKey: CREDIT_NOTE_SERIES_PARAM_KEY },
        });

        const tableRepo = manager.getRepository(SystemParametersConfig);
        await tableRepo.insert(
          tableRepo.create({
            tenant_id: tenantId,
            paramKey: CREDIT_NOTE_SERIES_PARAM_KEY,
            paramValue: configured as Record<string, unknown>,
            version: (active?.version ?? 0) + 1,
            effectiveFrom: new Date(),
            isActive: true,
            createdBy: userId,
          }),
        );
        return configured;
      },
    );
  }
}

/**
 * B1c-2 slice A (D-14, #553 part 2): the tenant's configured credit-note
 * series. This is the FIRST server-side series concept in the fiscal config
 * (invoices are still numbered client-side by the POS). The counter lives
 * in a system_parameters row (mutable, versioned, tenant-scoped) — never in
 * FiscalConfigRevision, whose jsonb payloads are immutable revision
 * snapshots and cannot hold a moving counter.
 *
 * This is also the intended future home for B2a's server-side series work
 * (#554): same param-row mechanics, additional keys.
 */
export const CREDIT_NOTE_SERIES_PARAM_KEY = 'CREDIT_NOTE_SERIES';

export type CreditNoteSeries = {
  prefix?: string;
  nextNumber: number;
  endNumber?: number;
};

export type CreditNoteSeriesParseResult =
  | { ok: true; series: CreditNoteSeries }
  | { ok: false; reason: string; detail: string };

/**
 * Named fail-closed errors for series allocation. Never fabricate a default
 * and never fall back to a guess: D-16/D-18 make an unconfigured or
 * exhausted series a hard stop with a code the caller (and the operator)
 * can act on.
 */
export class FiscalCreditNoteSeriesError extends BadRequestException {
  constructor(
    public readonly code:
      | 'FISCAL_CREDIT_NOTE_SERIES_UNCONFIGURED'
      | 'FISCAL_CREDIT_NOTE_SERIES_EXHAUSTED'
      | 'FISCAL_CREDIT_NOTE_SERIES_INVALID',
    message: string,
  ) {
    super(`${code}: ${message}`);
    this.name = 'FiscalCreditNoteSeriesError';
  }
}

/**
 * Validates the stored jsonb shape. Malformed payloads are INVALID (fail
 * loudly — a corrupted config must never silently fall back to a default).
 * A well-formed series whose nextNumber already passed endNumber is
 * EXHAUSTED (valid shape, no numbers left).
 */
export function parseCreditNoteSeries(
  raw: unknown,
): CreditNoteSeriesParseResult {
  if (
    typeof raw !== 'object' ||
    raw === null ||
    Array.isArray(raw) ||
    typeof (raw as Record<string, unknown>).nextNumber !== 'number' ||
    !Number.isInteger((raw as Record<string, unknown>).nextNumber) ||
    ((raw as Record<string, unknown>).nextNumber as number) < 1
  ) {
    return {
      ok: false,
      reason: 'FISCAL_CREDIT_NOTE_SERIES_INVALID',
      detail:
        'CREDIT_NOTE_SERIES must be an object with integer nextNumber >= 1',
    };
  }
  const rawRecord = raw as Record<string, unknown>;
  const series: CreditNoteSeries = {
    nextNumber: rawRecord.nextNumber as number,
  };
  if (rawRecord.prefix !== undefined) {
    if (
      typeof rawRecord.prefix !== 'string' ||
      rawRecord.prefix.trim() === '' ||
      /\s/.test(rawRecord.prefix)
    ) {
      return {
        ok: false,
        reason: 'FISCAL_CREDIT_NOTE_SERIES_INVALID',
        detail: 'CREDIT_NOTE_SERIES prefix must be a non-blank string without whitespace',
      };
    }
    series.prefix = rawRecord.prefix;
  }
  if (rawRecord.endNumber !== undefined) {
    if (
      typeof rawRecord.endNumber !== 'number' ||
      !Number.isInteger(rawRecord.endNumber) ||
      rawRecord.endNumber < 1
    ) {
      return {
        ok: false,
        reason: 'FISCAL_CREDIT_NOTE_SERIES_INVALID',
        detail: 'CREDIT_NOTE_SERIES endNumber must be an integer >= 1 when present',
      };
    }
    series.endNumber = rawRecord.endNumber;
  }
  if (series.endNumber !== undefined && series.nextNumber > series.endNumber) {
    return {
      ok: false,
      reason: 'FISCAL_CREDIT_NOTE_SERIES_EXHAUSTED',
      detail: `CREDIT_NOTE_SERIES is exhausted: nextNumber ${series.nextNumber} exceeds endNumber ${series.endNumber}`,
    };
  }
  return { ok: true, series };
}
