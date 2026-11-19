/**
 * ENT-08 of issue #984 (ODD S18/S19) — argument parsing for the provisioning
 * script's plan flags. Pure on purpose: the S19 rule is that an invalid plan
 * or add-on is rejected BEFORE the tenant exists, so the validation must run
 * without a database connection, a Nest context or a prompt. `provision.ts`
 * calls this first thing and exits 1 on `ProvisionArgsError`.
 *
 * The plan, add-on and support-tier vocabularies are NOT redeclared here:
 * they come from the frozen code registry (`capability-registry.ts`) and the
 * service's closed lists (`tenant-subscription.service.ts`), so a catalog
 * change cannot drift between the CLI, the service and this gate. Codes
 * overlap the runbook §4 table where the meaning is the same
 * (`PLAN_CODE_NOT_REGISTERED`, `ADD_ON_NOT_REGISTERED`,
 * `SUBSCRIPTION_SUPPORT_TIER_INVALID`); the two parse-shape codes are
 * provisioning-specific.
 */
import {
  ADD_ON_CODES_LIST,
  findPlan,
  type PlanCode,
  type SupportTier,
} from '../modules/entitlements/capability-registry';
import { SUPPORT_TIERS } from '../modules/entitlements/tenant-subscription.service';

/** Rejection codes, stable strings callers branch on. */
export const PROVISION_ARG_REJECTION_CODES = {
  PLAN_CODE_NOT_REGISTERED: 'PLAN_CODE_NOT_REGISTERED',
  ADD_ON_NOT_REGISTERED: 'ADD_ON_NOT_REGISTERED',
  SUBSCRIPTION_SUPPORT_TIER_INVALID: 'SUBSCRIPTION_SUPPORT_TIER_INVALID',
  ADD_ON_LIST_EMPTY_SEGMENT: 'PROVISION_ADD_ON_LIST_EMPTY_SEGMENT',
  FLAG_NOT_RECOGNIZED: 'PROVISION_FLAG_NOT_RECOGNIZED',
} as const;

export type ProvisionArgRejectionCode =
  (typeof PROVISION_ARG_REJECTION_CODES)[keyof typeof PROVISION_ARG_REJECTION_CODES];

export class ProvisionArgsError extends Error {
  constructor(
    readonly code: ProvisionArgRejectionCode,
    detail: string,
  ) {
    super(`${code}: ${detail}`);
    this.name = 'ProvisionArgsError';
  }
}

export interface ProvisionPlanArgs {
  readonly planCode: PlanCode;
  readonly supportTier: SupportTier;
  readonly addOns: string[];
}

const KNOWN_FLAGS: readonly string[] = ['plan', 'support-tier', 'add-ons'];

/** The founder-stage default (ODD S18): the plan that grants full access. */
const DEFAULT_PLAN_CODE = 'PRO';

/**
 * Parses and validates `--plan=<code>`, `--support-tier=<tier>` and
 * `--add-ons=a,b`. Defaults: plan `PRO`, support tier = the plan's own tier
 * (a PRO contract IS priority support per catalog §4), no add-ons.
 *
 * Throws `ProvisionArgsError` with a stable code before anything is created;
 * never returns a partially valid set.
 */
export function parseProvisionPlanArgs(
  argv: readonly string[],
): ProvisionPlanArgs {
  const flags = new Map<string, string>();
  for (const arg of argv) {
    if (!arg.startsWith('--')) {
      throw new ProvisionArgsError(
        PROVISION_ARG_REJECTION_CODES.FLAG_NOT_RECOGNIZED,
        `Argumento no reconocido: ${arg}. Use --plan=<código>, --support-tier=<nivel> o --add-ons=a,b`,
      );
    }
    const [name, ...rest] = arg.slice(2).split('=');
    const value = rest.join('=');
    if (!KNOWN_FLAGS.includes(name)) {
      throw new ProvisionArgsError(
        PROVISION_ARG_REJECTION_CODES.FLAG_NOT_RECOGNIZED,
        `Bandera no reconocida: --${name}. Use --plan=<código>, --support-tier=<nivel> o --add-ons=a,b`,
      );
    }
    flags.set(name, value);
  }

  const planCode = (flags.get('plan') ?? DEFAULT_PLAN_CODE).trim();
  const plan = planCode ? findPlan(planCode) : null;
  if (!plan) {
    throw new ProvisionArgsError(
      PROVISION_ARG_REJECTION_CODES.PLAN_CODE_NOT_REGISTERED,
      `"${planCode}" no es un plan del catálogo automático (ESENCIAL, OPERACION, PRO; ENTERPRISE se cotiza a mano). Nada fue creado.`,
    );
  }

  const addOns: string[] = [];
  const rawAddOns = flags.get('add-ons');
  if (rawAddOns !== undefined) {
    for (const segment of rawAddOns.split(',')) {
      const code = segment.trim();
      if (!code) {
        throw new ProvisionArgsError(
          PROVISION_ARG_REJECTION_CODES.ADD_ON_LIST_EMPTY_SEGMENT,
          '--add-ons no puede tener códigos vacíos; separe los códigos con comas. Nada fue creado.',
        );
      }
      if (!ADD_ON_CODES_LIST.includes(code)) {
        throw new ProvisionArgsError(
          PROVISION_ARG_REJECTION_CODES.ADD_ON_NOT_REGISTERED,
          `"${code}" no es un add-on del catálogo congelado (catalogo_capacidades_v1 §5). Nada fue creado.`,
        );
      }
      addOns.push(code);
    }
  }

  // Default: the support tier the plan itself declares (PRO → priority).
  const supportTier = (flags.get('support-tier') ?? plan.supportTier).trim();
  if (!SUPPORT_TIERS.includes(supportTier as SupportTier)) {
    throw new ProvisionArgsError(
      PROVISION_ARG_REJECTION_CODES.SUBSCRIPTION_SUPPORT_TIER_INVALID,
      `--support-tier acepta ${SUPPORT_TIERS.join(', ')}, recibió "${supportTier}". Nada fue creado.`,
    );
  }

  return {
    planCode: plan.planCode,
    supportTier: supportTier as SupportTier,
    addOns,
  };
}
