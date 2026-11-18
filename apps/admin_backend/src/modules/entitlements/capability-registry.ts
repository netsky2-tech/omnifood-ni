/**
 * Code registry of plan capability keys — ENT-01 of issue #984.
 *
 * Single source of truth in CODE, derived EXACTLY from the frozen catalog
 * `docs/plans/entitlements/catalogo_capacidades_v1.md` §3 (key registry),
 * §4 (plan → capability matrix), §5 (add-on codes) and §7 (closed list of
 * keys no guard may touch). No key may be invented, renamed or translated:
 * a key only enters the catalog when the feature demonstrably exists in the
 * repository (catalog §1, ODD S9).
 *
 * Deliberate exclusions recorded here so nobody "fixes" them back in:
 *   - `support.priority` is NOT a capability key. It is absent in code and it
 *     is a service obligation (SLA), not a product feature (catalog §3); it
 *     is modelled as the `support_tier` attribute of `tenant_subscription`.
 *   - `ENTERPRISE` is quoted manually and stays out of the automatic catalog
 *     (catalog §11).
 *   - Deferred keys (lot expiration, admin combos, QR menu endpoint,
 *     supplier CRUD) wait until the feature exists (catalog §8).
 */

/** `flag` = boolean capability; `limit` = numeric quota, `null` = unlimited. */
export type CapabilityType = 'flag' | 'limit';

/** Registry area, mirroring catalog §3's four tables. */
export type CapabilityArea = 'nucleus' | 'pack' | 'transversal' | 'limit';

export interface CapabilityDefinition {
  /** Stable catalog key: `<área>.<función>`, in English, never renamed. */
  readonly key: string;
  readonly type: CapabilityType;
  /** Whether a guard may deny it. Nucleus keys are NEVER gated. */
  readonly gated: boolean;
  readonly area: CapabilityArea;
  /**
   * Another capability key this one cannot work without. Enforced by the
   * resolver: a contract that grants the dependent key without its
   * prerequisite is invalid and fails loudly instead of degrading.
   */
  readonly requires?: string;
  /** Where the feature actually lives in the repository (catalog §3). */
  readonly evidence: string;
}

/**
 * The full registry, in catalog §3 order. Nucleus keys are `gated: false`
 * (catalog §3: "Núcleo — siempre activo, no gated"); pack and transversal
 * flags and both limits are `gated: true`.
 */
export const CAPABILITY_REGISTRY: readonly CapabilityDefinition[] = [
  // Núcleo — siempre activo, no gated (catalog §3).
  {
    key: 'core.sales',
    type: 'flag',
    gated: false,
    area: 'nucleus',
    evidence: 'sales/controllers/invoices.controller.ts',
  },
  {
    key: 'core.fiscal_invoice',
    type: 'flag',
    gated: false,
    area: 'nucleus',
    evidence:
      'sales/controllers/admin-invoices.controller.ts (factura, anulación, nota de crédito, reimpresión)',
  },
  {
    key: 'core.cash_shifts',
    type: 'flag',
    gated: false,
    area: 'nucleus',
    evidence: 'sales/controllers/cash-shift.controller.ts',
  },
  {
    key: 'core.catalog',
    type: 'flag',
    gated: false,
    area: 'nucleus',
    evidence: 'catalog/catalog.controller.ts, product.controller.ts',
  },
  {
    key: 'core.customers',
    type: 'flag',
    gated: false,
    area: 'nucleus',
    evidence:
      'módulo customers (decisión #1: núcleo, no premium — el RUC se imprime en la factura fiscal)',
  },
  {
    key: 'core.fx_dual',
    type: 'flag',
    gated: false,
    area: 'nucleus',
    evidence:
      'receipt_layout_formatter.dart (doble tipo de cambio NIO/USD en el ticket)',
  },
  {
    key: 'core.inventory_simple',
    type: 'flag',
    gated: false,
    area: 'nucleus',
    evidence: 'insumo.controller.ts (insumos: stock y movimientos)',
  },
  {
    key: 'core.reports_essential',
    type: 'flag',
    gated: false,
    area: 'nucleus',
    evidence: 'sales/controllers/reports.controller.ts',
  },
  {
    key: 'core.owner_portal',
    type: 'flag',
    gated: false,
    area: 'nucleus',
    evidence: 'owner_dashboard/src/lib/rbac.ts',
  },
  {
    key: 'core.pos_users',
    type: 'limit',
    gated: false,
    area: 'nucleus',
    evidence: 'usuarios POS ilimitados (matriz de la autoridad §4)',
  },
  // Packs — gated (catalog §3).
  {
    key: 'inventory.retail',
    type: 'flag',
    gated: true,
    area: 'pack',
    evidence:
      'kardex, compras, conteos, mermas, alertas, CPP (inventory-movement.controller.ts, inventory-reports.controller.ts)',
  },
  {
    key: 'inventory.cooking',
    type: 'flag',
    gated: true,
    area: 'pack',
    evidence:
      'recetas, subrecetas, modificadores, producción, márgenes por plato (recipe.controller.ts, bom-explosion.service.ts)',
  },
  // Transversales — gated (catalog §3).
  {
    key: 'promotions',
    type: 'flag',
    gated: true,
    area: 'transversal',
    evidence: 'promotions.controller.ts',
  },
  {
    // Not a promotion "type" to be ignored: it is B2B contract pricing — a
    // company customer with RUC, an agreement code, a usage counter and its
    // own B2B report and export. Sells differently from a 2x1, so it carries
    // its own key (catalog v1.1, gap H2).
    key: 'promotions.convenio',
    type: 'flag',
    gated: true,
    area: 'transversal',
    requires: 'promotions',
    evidence:
      'promotions/entities/promotion.entity.ts:20 (CONVENIO), migración 1810100000000 (code, target_customer_id, used_count), sales-reports.service.ts:1097 (convenioCode/convenioName)',
  },
  {
    key: 'loyalty',
    type: 'flag',
    gated: true,
    area: 'transversal',
    evidence: 'loyalty.controller.ts',
  },
  {
    key: 'reports.margins',
    type: 'flag',
    gated: true,
    area: 'transversal',
    // Dish cost (dish-margins / theoretical-cost) is deliberately NOT listed
    // here: it is a recipe feature that travels with `inventory.cooking`.
    // Claiming it in two keys was a double-gating hole (catalog v1.1, H3).
    evidence:
      'inventory-reports.controller.ts:45 (valuation), :116 (cogs) — decisión #2',
  },
  // Límites — gated por conteo (catalog §3).
  {
    key: 'limits.terminals',
    type: 'limit',
    gated: true,
    area: 'limit',
    evidence:
      'fleet existe (device-sync-token.controller.ts); la cuota es nueva (decisión #3: bloquea enrolamiento, nunca la venta)',
  },
  {
    key: 'limits.owner_accounts',
    type: 'limit',
    gated: true,
    area: 'limit',
    evidence: 'usuarios owner existen (users.controller.ts); la cuota es nueva',
  },
] as const;

/** Every registered capability key, in catalog order. */
export const CAPABILITY_KEYS: readonly string[] = CAPABILITY_REGISTRY.map(
  (capability) => capability.key,
);

/**
 * The nucleus: every `core.*` key of catalog §3, always active, never gated.
 * A tenant without a subscription keeps exactly these (catalog §6, ODD S1/S8).
 */
export const NUCLEUS_CAPABILITY_KEYS: readonly string[] =
  CAPABILITY_REGISTRY.filter((capability) => capability.area === 'nucleus').map(
    (capability) => capability.key,
  );

/**
 * Catalog §7's closed list: keys NO guard may ever touch, each with its
 * reason. This list is a subset of the nucleus — any new gateable key must
 * justify why it is not here (catalog §7).
 */
export const UNGUARDABLE_CAPABILITY_KEYS: readonly string[] = [
  'core.sales',
  'core.fiscal_invoice',
  'core.cash_shifts',
  'core.customers',
  'core.catalog',
  'core.inventory_simple',
  'core.fx_dual',
] as const;

/** The definition of one capability key, or null when it is not registered. */
export function findCapability(key: string): CapabilityDefinition | null {
  return (
    CAPABILITY_REGISTRY.find((capability) => capability.key === key) ?? null
  );
}

/**
 * Answers "is this key gated?". Fail-closed: an unregistered key throws
 * instead of silently answering "not gated", because a key outside the
 * registry must never be gateable or deniable.
 */
export function isCapabilityGated(key: string): boolean {
  const capability = findCapability(key);
  if (!capability) {
    throw new Error(
      `CAPABILITY_KEY_NOT_REGISTERED: "${key}" is not in the frozen catalog registry (docs/plans/entitlements/catalogo_capacidades_v1.md §3)`,
    );
  }
  return capability.gated;
}

/** The business plan codes in the automatic catalog (catalog §2). */
export type PlanCode = 'ESENCIAL' | 'OPERACION' | 'PRO';

export const PLAN_CODES: readonly PlanCode[] = [
  'ESENCIAL',
  'OPERACION',
  'PRO',
] as const;

/** `support_tier` values of `tenant_subscription` (catalog §3, support row). */
export type SupportTier = 'standard' | 'priority';

/**
 * One plan's base offer, exactly as catalog §4 states it. Flag capabilities
 * the plan does NOT include are still listed with `included: false` so the
 * mapping table carries one row per (plan, capability) with no implicit
 * defaults (ODD S9: una sola tabla de mapeo).
 */
export interface PlanCapabilityMap {
  readonly planCode: PlanCode;
  /** Whether each gated flag capability is included in the plan base. */
  readonly includedFlags: Readonly<Record<string, boolean>>;
  /** Included quota per limit key; `null` = unlimited. */
  readonly includedLimits: Readonly<Record<string, number | null>>;
  /** Packs included by the plan itself (catalog §5: Operación incluye 1, Pro 2). */
  readonly includedPackCount: number;
  readonly supportTier: SupportTier;
}

/**
 * Catalog §4 verbatim. Every plan includes the whole nucleus; the packs,
 * transversal flags and limits follow the matrix row by row.
 */
export const PLAN_CAPABILITY_MATRIX: readonly PlanCapabilityMap[] = [
  {
    planCode: 'ESENCIAL',
    includedFlags: {
      'inventory.retail': false,
      'inventory.cooking': false,
      promotions: false,
      'promotions.convenio': false,
      loyalty: false,
      'reports.margins': false,
    },
    includedLimits: {
      'limits.terminals': 1,
      'limits.owner_accounts': 2,
    },
    includedPackCount: 0,
    supportTier: 'standard',
  },
  {
    planCode: 'OPERACION',
    // Catalog §4: "1 pack incluido" — the tenant chooses which pack; the
    // chosen pack is recorded as an add-on and counts against this slot.
    // Resolving that choice is ENT-02's job, not the registry's.
    includedFlags: {
      'inventory.retail': false,
      'inventory.cooking': false,
      promotions: true,
      'promotions.convenio': false,
      loyalty: true,
      'reports.margins': false,
    },
    includedLimits: {
      'limits.terminals': 1,
      'limits.owner_accounts': 2,
    },
    includedPackCount: 1,
    supportTier: 'standard',
  },
  {
    planCode: 'PRO',
    includedFlags: {
      'inventory.retail': true,
      'inventory.cooking': true,
      promotions: true,
      'promotions.convenio': true,
      loyalty: true,
      'reports.margins': true,
    },
    includedLimits: {
      'limits.terminals': 2,
      'limits.owner_accounts': 4,
    },
    includedPackCount: 2,
    supportTier: 'priority',
  },
] as const;

/** The base map of one plan, fail-closed on unknown plans (ENTERPRISE included). */
export function findPlan(planCode: string): PlanCapabilityMap | null {
  return (
    PLAN_CAPABILITY_MATRIX.find((plan) => plan.planCode === planCode) ?? null
  );
}

/**
 * What a plan includes: the nucleus, its included gated flags and its
 * included limits (catalog §4). Answers "¿qué incluye un plan?" from the
 * registry alone — no scattered strings.
 */
export function getPlanInclusions(planCode: string): {
  capabilities: readonly string[];
  limits: Readonly<Record<string, number | null>>;
  supportTier: SupportTier;
} {
  const plan = findPlan(planCode);
  if (!plan) {
    throw new Error(
      `PLAN_CODE_NOT_IN_CATALOG: "${planCode}" is not one of ${PLAN_CODES.join(', ')}`,
    );
  }
  const includedGatedFlags = Object.entries(plan.includedFlags)
    .filter(([, included]) => included)
    .map(([key]) => key);
  return {
    capabilities: [...NUCLEUS_CAPABILITY_KEYS, ...includedGatedFlags],
    limits: { 'core.pos_users': null, ...plan.includedLimits },
    supportTier: plan.supportTier,
  };
}

/** One purchasable add-on and what it changes when active (catalog §5). */
export interface AddOnDefinition {
  readonly code: string;
  /**
   * `capabilities` turns one or more flags on (a single pack, or a transversal
   * bundle); `limit` increments a quota by one.
   */
  readonly effect:
    | { kind: 'capabilities'; capabilityKeys: string[] }
    | { kind: 'limit'; limitKey: string; increment: 1 };
  /** Whether the add-on applies per plan (packs are plan-priced, catalog §5). */
  readonly packOf?: 'inventory.retail' | 'inventory.cooking';
}

/**
 * Catalog §5 add-on codes. Prices are NOT encoded here — they live in the
 * pricing authority (`docs/finance/estrategia_precios_nhilos_pos_v1.md` §4)
 * and are plan-dependent (US$39 Esencial, +US$29 second pack Operación,
 * US$40/29/35 terminal); duplicating them in code would drift.
 */
export const ADD_ON_CODES: readonly AddOnDefinition[] = [
  {
    code: 'pack.retail',
    effect: { kind: 'capabilities', capabilityKeys: ['inventory.retail'] },
    packOf: 'inventory.retail',
  },
  {
    code: 'pack.cooking',
    effect: { kind: 'capabilities', capabilityKeys: ['inventory.cooking'] },
    packOf: 'inventory.cooking',
  },
  {
    // Bundle "Marketing" — US$19/mes (catalog v1.1 §5). One SKU instead of
    // two: promotions and loyalty are sold together because neither is worth
    // much alone in a food park.
    code: 'bundle.marketing',
    effect: {
      kind: 'capabilities',
      capabilityKeys: ['promotions', 'loyalty'],
    },
  },
  {
    // Bundle "Inteligencia de costos" — US$19/mes. The reason to upgrade to
    // Pro stays intact: Pro still wins on packs, terminals and support.
    code: 'bundle.cost_intelligence',
    effect: { kind: 'capabilities', capabilityKeys: ['reports.margins'] },
  },
  {
    // Bundle "Convenios B2B" — US$15/mes. Requires `promotions` active: the
    // resolver rejects a contract that buys convenios without promotions.
    code: 'bundle.convenio',
    effect: { kind: 'capabilities', capabilityKeys: ['promotions.convenio'] },
  },
  {
    code: 'terminal.extra',
    effect: { kind: 'limit', limitKey: 'limits.terminals', increment: 1 },
  },
  {
    code: 'owner.account.extra',
    effect: { kind: 'limit', limitKey: 'limits.owner_accounts', increment: 1 },
  },
] as const;

export const ADD_ON_CODES_LIST: readonly string[] = ADD_ON_CODES.map(
  (addOn) => addOn.code,
);
