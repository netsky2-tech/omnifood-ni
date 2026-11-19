import {
  ADD_ON_CODES,
  ADD_ON_CODES_LIST,
  CAPABILITY_KEYS,
  CAPABILITY_REGISTRY,
  findCapability,
  findPlan,
  getPlanInclusions,
  isCapabilityGated,
  NUCLEUS_CAPABILITY_KEYS,
  PLAN_CAPABILITY_MATRIX,
  UNGUARDABLE_CAPABILITY_KEYS,
} from './capability-registry';

/**
 * ENT-01 registry completeness contract (issue #984).
 *
 * The expected lists below are transcribed VERBATIM from the frozen catalog
 * `docs/plans/entitlements/catalogo_capacidades_v1.md` (§3 key registry, §4
 * plan matrix, §5 add-on codes, §7 unguardable closed list). If the catalog
 * changes, change BOTH — the registry and these expectations — in the same
 * reviewable unit. No key may be invented here.
 */

/** Catalog §3, núcleo table — siempre activo, no gated. */
const CATALOG_3_NUCLEUS_KEYS = [
  'core.sales',
  'core.fiscal_invoice',
  'core.cash_shifts',
  'core.catalog',
  'core.customers',
  'core.fx_dual',
  'core.inventory_simple',
  'core.reports_essential',
  'core.owner_portal',
  'core.pos_users',
] as const;

/** Catalog §3, packs and transversales — gated flags. */
const CATALOG_3_GATED_FLAG_KEYS = [
  'inventory.retail',
  'inventory.cooking',
  'promotions',
  // Catalog v1.1 (gap H2): the B2B agreement capability.
  'promotions.convenio',
  'loyalty',
  'reports.margins',
] as const;

/** Catalog §3, límites — gated por conteo. */
const CATALOG_3_LIMIT_KEYS = [
  'limits.terminals',
  'limits.owner_accounts',
] as const;

/** Catalog §7's closed list, verbatim. */
const CATALOG_7_UNGUARDABLE_KEYS = [
  'core.sales',
  'core.fiscal_invoice',
  'core.cash_shifts',
  'core.customers',
  'core.catalog',
  'core.inventory_simple',
  'core.fx_dual',
] as const;

/** Catalog §5 add-on codes, verbatim. */
const CATALOG_5_ADD_ON_CODES = [
  'pack.retail',
  'pack.cooking',
  // Catalog v1.1: the three transversal bundles.
  'bundle.marketing',
  'bundle.cost_intelligence',
  'bundle.convenio',
  'terminal.extra',
  'owner.account.extra',
] as const;

describe('capability registry (ENT-01/ENT-02, frozen catalog v1.1)', () => {
  it('registers every key of catalog §3 and ONLY those keys', () => {
    const expected = [
      ...CATALOG_3_NUCLEUS_KEYS,
      ...CATALOG_3_GATED_FLAG_KEYS,
      ...CATALOG_3_LIMIT_KEYS,
    ];
    expect([...CAPABILITY_KEYS].sort()).toEqual([...expected].sort());
  });

  it('types every key as its catalog §3 row declares', () => {
    for (const key of CATALOG_3_NUCLEUS_KEYS) {
      expect(findCapability(key)?.type).toBe(
        key === 'core.pos_users' ? 'limit' : 'flag',
      );
    }
    for (const key of CATALOG_3_GATED_FLAG_KEYS) {
      expect(findCapability(key)?.type).toBe('flag');
    }
    for (const key of CATALOG_3_LIMIT_KEYS) {
      expect(findCapability(key)?.type).toBe('limit');
    }
  });

  it('keeps the nucleus non-gated exactly as catalog §3 declares it', () => {
    expect([...NUCLEUS_CAPABILITY_KEYS].sort()).toEqual(
      [...CATALOG_3_NUCLEUS_KEYS].sort(),
    );
    for (const key of NUCLEUS_CAPABILITY_KEYS) {
      expect(isCapabilityGated(key)).toBe(false);
    }
  });

  it('keeps catalog §7 closed list: those keys can never be gated', () => {
    expect([...UNGUARDABLE_CAPABILITY_KEYS].sort()).toEqual(
      [...CATALOG_7_UNGUARDABLE_KEYS].sort(),
    );
    // §7 is a closed SUBSET of the non-gated nucleus: every key no guard may
    // touch is a nucleus key, and no nucleus key outside §7 ever became
    // gateable (catalog §3: núcleo = no gated).
    for (const key of UNGUARDABLE_CAPABILITY_KEYS) {
      expect(NUCLEUS_CAPABILITY_KEYS).toContain(key);
      expect(isCapabilityGated(key)).toBe(false);
    }
  });

  it('gates every pack, transversal and limit key, and only those', () => {
    for (const key of CAPABILITY_KEYS) {
      const gated: readonly string[] = [
        ...CATALOG_3_GATED_FLAG_KEYS,
        ...CATALOG_3_LIMIT_KEYS,
      ];
      expect(isCapabilityGated(key)).toBe(gated.includes(key));
    }
  });

  it('never answers a gate question for an unregistered key (fail closed)', () => {
    expect(findCapability('inventory.cooking.lots')).toBeNull();
    expect(() => isCapabilityGated('inventory.cooking.lots')).toThrow(
      'CAPABILITY_KEY_NOT_REGISTERED',
    );
  });

  it('keeps support.priority OUT of the registry (SLA, not a capability)', () => {
    // Catalog §3: support.priority does not enter as a gateable capability;
    // it is the support_tier attribute of tenant_subscription.
    expect(CAPABILITY_KEYS).not.toContain('support.priority');
    expect(findCapability('support.priority')).toBeNull();
  });

  it('maps ESENCIAL exactly as catalog §4 states', () => {
    const plan = findPlan('ESENCIAL');
    expect(plan).not.toBeNull();
    const inclusions = getPlanInclusions('ESENCIAL');
    // Núcleo: Sí for every plan.
    for (const key of CATALOG_3_NUCLEUS_KEYS) {
      expect(inclusions.capabilities).toContain(key);
    }
    // Packs: Add-on only. Transversales: No. Margins: No.
    expect(plan?.includedFlags).toEqual({
      'inventory.retail': false,
      'inventory.cooking': false,
      promotions: false,
      'promotions.convenio': false,
      loyalty: false,
      'reports.margins': false,
    });
    expect(plan?.includedLimits).toEqual({
      'limits.terminals': 1,
      'limits.owner_accounts': 2,
    });
    expect(plan?.includedPackCount).toBe(0);
    expect(inclusions.supportTier).toBe('standard');
  });

  it('maps OPERACION exactly as catalog §4 states (one pack included)', () => {
    const plan = findPlan('OPERACION');
    expect(plan).not.toBeNull();
    const inclusions = getPlanInclusions('OPERACION');
    for (const key of CATALOG_3_NUCLEUS_KEYS) {
      expect(inclusions.capabilities).toContain(key);
    }
    // The plan includes promotions + loyalty; margins stay Pro-only.
    expect(plan?.includedFlags).toEqual({
      'inventory.retail': false,
      'inventory.cooking': false,
      promotions: true,
      'promotions.convenio': false,
      loyalty: true,
      'reports.margins': false,
    });
    expect(plan?.includedLimits).toEqual({
      'limits.terminals': 1,
      'limits.owner_accounts': 2,
    });
    // Catalog §5 / S7: the FIRST pack is included; the second costs +US$29.
    // The tenant chooses WHICH pack, so neither is included statically here.
    expect(plan?.includedPackCount).toBe(1);
    expect(inclusions.supportTier).toBe('standard');
  });

  it('maps PRO exactly as catalog §4 states (both packs, margins, priority)', () => {
    const plan = findPlan('PRO');
    expect(plan).not.toBeNull();
    const inclusions = getPlanInclusions('PRO');
    for (const key of CATALOG_3_NUCLEUS_KEYS) {
      expect(inclusions.capabilities).toContain(key);
    }
    expect(plan?.includedFlags).toEqual({
      'inventory.retail': true,
      'inventory.cooking': true,
      promotions: true,
      'promotions.convenio': true,
      loyalty: true,
      'reports.margins': true,
    });
    expect(plan?.includedLimits).toEqual({
      'limits.terminals': 2,
      'limits.owner_accounts': 4,
    });
    expect(plan?.includedPackCount).toBe(2);
    expect(inclusions.supportTier).toBe('priority');
  });

  it('covers exactly the registered keys in every plan of the matrix', () => {
    for (const plan of PLAN_CAPABILITY_MATRIX) {
      const matrixKeys = new Set([
        ...Object.keys(plan.includedFlags),
        ...Object.keys(plan.includedLimits),
        ...NUCLEUS_CAPABILITY_KEYS,
      ]);
      expect([...matrixKeys].sort()).toEqual([...CAPABILITY_KEYS].sort());
    }
  });

  it('carries the four add-on codes of catalog §5 with their effects', () => {
    expect([...ADD_ON_CODES_LIST].sort()).toEqual(
      [...CATALOG_5_ADD_ON_CODES].sort(),
    );
    const byCode = new Map(ADD_ON_CODES.map((addOn) => [addOn.code, addOn]));
    expect(byCode.get('pack.retail')?.effect).toEqual({
      kind: 'capabilities',
      capabilityKeys: ['inventory.retail'],
    });
    expect(byCode.get('pack.cooking')?.effect).toEqual({
      kind: 'capabilities',
      capabilityKeys: ['inventory.cooking'],
    });
    expect(byCode.get('bundle.marketing')?.effect).toEqual({
      kind: 'capabilities',
      capabilityKeys: ['promotions', 'loyalty'],
    });
    expect(byCode.get('bundle.cost_intelligence')?.effect).toEqual({
      kind: 'capabilities',
      capabilityKeys: ['reports.margins'],
    });
    expect(byCode.get('bundle.convenio')?.effect).toEqual({
      kind: 'capabilities',
      capabilityKeys: ['promotions.convenio'],
    });
    expect(byCode.get('terminal.extra')?.effect).toEqual({
      kind: 'limit',
      limitKey: 'limits.terminals',
      increment: 1,
    });
    expect(byCode.get('owner.account.extra')?.effect).toEqual({
      kind: 'limit',
      limitKey: 'limits.owner_accounts',
      increment: 1,
    });
  });

  it('declares the convenio prerequisite on the key itself (catalog v1.1)', () => {
    expect(findCapability('promotions.convenio')?.requires).toBe('promotions');
    // No other key carries a prerequisite without a stated reason.
    const withRequires = CAPABILITY_REGISTRY.filter((row) => row.requires);
    expect(withRequires.map((row) => row.key)).toStrictEqual([
      'promotions.convenio',
    ]);
  });

  it('does not claim the plate cost in two keys (catalog v1.1, gap H3)', () => {
    // dish-margins/theoretical-cost travel with the cooking pack only.
    expect(findCapability('reports.margins')?.evidence).not.toMatch(
      /dish-margins|theoretical-cost|márgenes por plato/i,
    );
    expect(findCapability('inventory.cooking')?.evidence).toMatch(/recetas/i);
  });

  it('fails closed on a plan outside the automatic catalog (ENTERPRISE)', () => {
    expect(findPlan('ENTERPRISE')).toBeNull();
    expect(() => getPlanInclusions('ENTERPRISE')).toThrow(
      'PLAN_CODE_NOT_IN_CATALOG',
    );
  });
});
