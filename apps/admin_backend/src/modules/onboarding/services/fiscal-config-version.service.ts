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
import { SystemParametersConfig } from '../../inventory/entities/system-parameters-config.entity';
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
    @InjectRepository(SystemParametersConfig)
    private readonly sysParamRepo: Repository<SystemParametersConfig>,
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

    const tRepo = manager ? manager.getRepository(Tenant) : this.tenantRepo;
    const sRepo = manager
      ? manager.getRepository(SystemParametersConfig)
      : this.sysParamRepo;

    const tenant = await tRepo.findOne({
      where: { id: trimmedTenantId },
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant '${trimmedTenantId}' not found`);
    }

    const activeParams = await sRepo.find({
      where: { tenant_id: trimmedTenantId, isActive: true },
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
    const rRepo = manager
      ? manager.getRepository(FiscalConfigRevision)
      : this.revisionRepo;

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
    const effectivePayload = await this.getEffectiveFiscalPayload(
      trimmedTenantId,
      manager,
    );
    const newFingerprint = this.computeCanonicalFingerprint(effectivePayload);

    const rRepo = manager
      ? manager.getRepository(FiscalConfigRevision)
      : this.revisionRepo;

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
    const payload = await this.getEffectiveFiscalPayload(trimmedTenantId, manager);
    let latest = await this.getLatestRevision(trimmedTenantId, manager);

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
    const rRepo = manager
      ? manager.getRepository(FiscalConfigRevision)
      : this.revisionRepo;

    const record = await rRepo.findOne({
      where: { tenant_id: tenantId.trim(), revision },
    });

    if (record && record.fingerprint !== fingerprint.trim()) {
      throw new ConflictException(
        `INTEGRITY_CONFLICT: Revision ${revision} has conflicting fingerprint '${fingerprint}' vs recorded '${record.fingerprint}' for tenant '${tenantId}'`,
      );
    }
  }
}
