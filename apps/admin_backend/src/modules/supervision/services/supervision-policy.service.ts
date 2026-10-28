import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  SystemParametersConfig,
  SystemParametersConfigActiveView,
} from '../../inventory/entities/system-parameters-config.entity';
import { FiscalConfigVersionService } from '../../onboarding/services/fiscal-config-version.service';
import { FISCAL_PARAM_KEYS } from '../../onboarding/services/fiscal-setup.service';
import {
  readTenantOperationModeOrNull,
  TenantOperationMode,
} from '../../onboarding/dto/fiscal-setup.dto';
import { bindTenantContext } from '../../../core/database/tenant-transaction';
import {
  defaultSupervisionPolicy,
  parseSupervisionPolicy,
  supervisionPolicyToJson,
  validateSupervisionPolicy,
  SUPERVISION_POLICY_PARAM_KEY,
  type SupervisionPolicy,
  type SupervisionPolicyValidation,
} from '../contracts/supervision-policy.contract';
import type { SupervisionPolicyDto } from '../dto/supervision-policy.dto';

export interface SupervisionPolicyResponse {
  /** The tenant's configured policy, or null when it never configured one. */
  policy: SupervisionPolicy | null;
  /**
   * The policy a terminal applies when the tenant has none: the default for
   * the tenant's operation mode. The backoffice shows it so the owner knows
   * what "sin definir" actually means in their business.
   */
  defaultPolicy: SupervisionPolicy;
  /** Whether the tenant configured a policy at all. */
  configured: boolean;
  /** The tenant's operation mode, the input of the default. */
  operationMode: TenantOperationMode | null;
  /** The outcome of the invariant check on the CURRENT policy. */
  validation: SupervisionPolicyValidation;
  /** The revision of the config snapshot that carries the policy. */
  configVersion: { revision: number; fingerprint: string } | null;
}

/**
 * Reads and writes the tenant's supervision policy.
 *
 * WHY A SERVICE OF ITS OWN: the policy is not fiscal (it is the tenant's
 * operational rule), but it TRAVELS on the fiscal config snapshot because
 * that is the only versioned, fingerprinted, acknowledged channel to the
 * terminal (the S2 rule: no second sync mechanism). The value is stored in
 * the tenant-parameters table (append-only, read through the active view) —
 * the same place every other tenant rule lives.
 */
@Injectable()
export class SupervisionPolicyService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly eventEmitter: EventEmitter2,
    private readonly fiscalConfigVersionService: FiscalConfigVersionService,
  ) {}

  /**
   * The effective policy for a tenant, plus the default that applies when
   * it has none, and the invariant verdict on what it HAS.
   */
  async getPolicy(tenantId: string): Promise<SupervisionPolicyResponse> {
    const trimmedTenantId = tenantId?.trim();
    if (!trimmedTenantId) {
      throw new BadRequestException('Tenant ID is required');
    }

    return this.dataSource.transaction(async (manager) => {
      await bindTenantContext(manager, trimmedTenantId);

      const params = await manager.find(SystemParametersConfigActiveView, {
        where: { tenant_id: trimmedTenantId },
      });
      const paramMap = new Map<string, unknown>();
      for (const param of params) {
        paramMap.set(param.paramKey, param.paramValue);
      }

      const operationMode = readTenantOperationModeOrNull(
        paramMap.get(FISCAL_PARAM_KEYS.OPERATION_MODE),
      );
      // The default follows the mode exactly as the POS does: only a pure
      // Food Park / QSR has no manager on the floor. An unconfigured tenant
      // reads as the POS's own default mode (food park).
      const defaultPolicy = defaultSupervisionPolicy(
        operationMode === null ||
          operationMode === TenantOperationMode.FOODPARK_QSR,
      );
      const policy = parseSupervisionPolicy(
        paramMap.get(SUPERVISION_POLICY_PARAM_KEY),
      );

      const latest = await this.fiscalConfigVersionService.getLatestRevision(
        trimmedTenantId,
        manager,
      );

      return {
        policy,
        defaultPolicy,
        configured: policy !== null,
        operationMode,
        validation: policy
          ? validateSupervisionPolicy(policy)
          : { errors: [], warnings: [] },
        configVersion: latest
          ? { revision: latest.revision, fingerprint: latest.fingerprint }
          : null,
      };
    });
  }

  /**
   * Writes the tenant's policy (or clears it) and bumps the config revision
   * so the terminals receive it on their next sync.
   *
   * The policy is written WHOLE: a partial write would silently widen what
   * the till accepts. Clearing is an explicit act (a null tombstone), the
   * same "absence looks like absence" contract the other tenant params
   * honour.
   */
  async configurePolicy(
    tenantId: string,
    policy: SupervisionPolicyDto | null,
    userId?: string,
  ): Promise<SupervisionPolicyResponse> {
    const trimmedTenantId = tenantId?.trim();
    if (!trimmedTenantId) {
      throw new BadRequestException('Tenant ID is required');
    }

    // Defense in depth: the class-validator guard already rejects the
    // dead-end combination at the HTTP boundary, but a directly-constructed
    // DTO must not be able to store a policy that strands a till. The
    // normalization also gives the policy its CANONICAL form (sorted
    // roles): the config fingerprint is content-addressed, so the same rule
    // set must always serialize the same way.
    const normalized = policy
      ? parseSupervisionPolicy(
          supervisionPolicyToJson({
            authorizingRoles: policy.authorizingRoles,
            selfAuthorizationAllowedCloseBox:
              policy.selfAuthorizationAllowedCloseBox,
            selfAuthorizationAllowedCashDrawer:
              policy.selfAuthorizationAllowedCashDrawer,
            selfAuthorizationAllowedManualDiscount:
              policy.selfAuthorizationAllowedManualDiscount,
            supervisorRequiredForModifierQuantity:
              policy.supervisorRequiredForModifierQuantity,
          }),
        )
      : null;
    if (policy && !normalized) {
      throw new BadRequestException(
        'La política de supervisión es inválida: revisa los roles y las opciones enviadas.',
      );
    }
    if (normalized) {
      const validation = validateSupervisionPolicy(normalized);
      if (validation.errors.length > 0) {
        throw new BadRequestException(validation.errors[0]);
      }
    }

    const result = await this.dataSource.transaction(async (manager) => {
      await bindTenantContext(manager, trimmedTenantId);

      await this.upsertParameter(
        manager,
        trimmedTenantId,
        SUPERVISION_POLICY_PARAM_KEY,
        normalized ? supervisionPolicyToJson(normalized) : null,
        userId,
      );

      // The revision bump is what makes the terminals pick it up: the
      // snapshot is content-addressed, so a policy change MUST change the
      // fingerprint or the change would never travel.
      const configVersion =
        await this.fiscalConfigVersionService.recordRevisionChange(
          trimmedTenantId,
          manager,
        );

      this.eventEmitter.emit('SUPERVISION_POLICY_UPDATED', {
        tenantId: trimmedTenantId,
        userId,
        cleared: policy === null,
        configVersion,
        configuredAt: new Date(),
      });

      return configVersion;
    });

    const response = await this.getPolicy(trimmedTenantId);
    return { ...response, configVersion: result };
  }

  /**
   * Upserts a tenant parameter, or clears it through a superseding null
   * tombstone. The table is APPEND-ONLY (issue #377: a trigger rejects
   * UPDATE and DELETE), so supersession never saves a loaded row: it
   * inserts the next version and lets the active view resolve which row
   * governs.
   */
  private async upsertParameter(
    manager: EntityManager,
    tenantId: string,
    paramKey: string,
    paramValue: Record<string, unknown> | null,
    userId?: string,
  ): Promise<void> {
    const activeParams = await manager.find(SystemParametersConfigActiveView, {
      where: { tenant_id: tenantId, paramKey },
      order: { version: 'DESC' },
    });
    const activeParam = activeParams[0] ?? null;

    if (activeParam) {
      const current = activeParam.paramValue;
      const same =
        current === null
          ? paramValue === null
          : JSON.stringify(current) === JSON.stringify(paramValue);
      if (same) return;
    }

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
