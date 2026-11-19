/**
 * ENT-02 — resolution rules of catalog §6, tested as a pure function.
 *
 * Every case asserts the three observable effects of a rule (status, the
 * effective capability list and the limits) instead of internal state, so the
 * contract of `GET /api/tenant/entitlements` cannot drift silently.
 */
import { NUCLEUS_CAPABILITY_KEYS } from './capability-registry';
import {
  ENTITLEMENT_SNAPSHOT_TTL_MS,
  resolveEffectiveCapabilities,
  type OverrideInput,
  type SubscriptionInput,
} from './entitlement-resolution';

const NOW = new Date('2026-11-17T12:00:00.000Z');

const subscription = (
  overrides: Partial<SubscriptionInput> = {},
): SubscriptionInput => ({
  plan_code: 'ESENCIAL',
  status: 'active',
  starts_at: new Date('2026-01-01T00:00:00.000Z'),
  ends_at: null,
  add_ons: [],
  support_tier: 'standard',
  ...overrides,
});

const override = (
  capability_key: string,
  value_json: Record<string, unknown>,
  expires_at: Date = new Date('2027-01-01T00:00:00.000Z'),
): OverrideInput => ({ capability_key, value_json, expires_at });

describe('resolveEffectiveCapabilities', () => {
  describe('sin suscripción (catalog §6.4, ODD S1/S4)', () => {
    it('entrega el núcleo con estado sin_plan explícito y sin plan', () => {
      const result = resolveEffectiveCapabilities({
        subscription: null,
        overrides: [],
        now: NOW,
      });

      expect(result.status).toBe('sin_plan');
      expect(result.planCode).toBeNull();
      expect(result.supportTier).toBe('standard');
      expect(result.capabilities).toStrictEqual([...NUCLEUS_CAPABILITY_KEYS]);
      expect(result.addOns).toStrictEqual([]);
    });

    it('no entrega capacidades premium ni límites de plan superior', () => {
      const result = resolveEffectiveCapabilities({
        subscription: null,
        overrides: [],
        now: NOW,
      });

      expect(result.capabilities).not.toContain('inventory.retail');
      expect(result.capabilities).not.toContain('reports.margins');
      // Suelo de ESENCIAL: nunca más que el plan más barato.
      expect(result.limits).toStrictEqual({
        'limits.terminals': 1,
        'limits.owner_accounts': 2,
        'core.pos_users': null,
      });
    });
  });

  describe('plan activo (catalog §6.1)', () => {
    it('ESENCIAL entrega el núcleo y sus límites incluidos', () => {
      const result = resolveEffectiveCapabilities({
        subscription: subscription(),
        overrides: [],
        now: NOW,
      });

      expect(result.status).toBe('active');
      expect(result.planCode).toBe('ESENCIAL');
      expect(result.capabilities).toStrictEqual([...NUCLEUS_CAPABILITY_KEYS]);
      expect(result.limits['limits.terminals']).toBe(1);
      expect(result.limits['limits.owner_accounts']).toBe(2);
    });

    it('OPERACION entrega promotions y loyalty sin pack', () => {
      const result = resolveEffectiveCapabilities({
        subscription: subscription({ plan_code: 'OPERACION' }),
        overrides: [],
        now: NOW,
      });

      expect(result.capabilities).toStrictEqual(
        expect.arrayContaining([
          ...NUCLEUS_CAPABILITY_KEYS,
          'promotions',
          'loyalty',
        ]),
      );
      expect(result.capabilities).not.toContain('inventory.retail');
      expect(result.capabilities).not.toContain('inventory.cooking');
      expect(result.capabilities).not.toContain('reports.margins');
    });

    it('PRO entrega los cinco flags gateados, support priority y sus límites', () => {
      const result = resolveEffectiveCapabilities({
        subscription: subscription({
          plan_code: 'PRO',
          support_tier: 'priority',
        }),
        overrides: [],
        now: NOW,
      });

      expect(result.capabilities).toStrictEqual(
        expect.arrayContaining([
          'inventory.retail',
          'inventory.cooking',
          'promotions',
          'loyalty',
          'reports.margins',
        ]),
      );
      expect(result.supportTier).toBe('priority');
      expect(result.limits['limits.terminals']).toBe(2);
      expect(result.limits['limits.owner_accounts']).toBe(4);
    });
  });

  describe('add-ons (catalog §6.2)', () => {
    it('pack.retail enciende el pack en un plan que no lo incluye', () => {
      const result = resolveEffectiveCapabilities({
        subscription: subscription({ add_ons: ['pack.retail'] }),
        overrides: [],
        now: NOW,
      });

      expect(result.capabilities).toContain('inventory.retail');
      expect(result.capabilities).not.toContain('inventory.cooking');
      expect(result.addOns).toStrictEqual(['pack.retail']);
    });

    it('cada terminal.extra incrementa el límite en uno, sin tope duro', () => {
      const result = resolveEffectiveCapabilities({
        subscription: subscription({
          add_ons: ['terminal.extra', 'terminal.extra', 'terminal.extra'],
        }),
        overrides: [],
        now: NOW,
      });

      expect(result.limits['limits.terminals']).toBe(4);
      expect(result.addOns).toStrictEqual([
        'terminal.extra',
        'terminal.extra',
        'terminal.extra',
      ]);
    });

    it('owner.account.extra incrementa el límite de cuentas owner', () => {
      const result = resolveEffectiveCapabilities({
        subscription: subscription({ add_ons: ['owner.account.extra'] }),
        overrides: [],
        now: NOW,
      });

      expect(result.limits['limits.owner_accounts']).toBe(3);
    });

    it('bundle.marketing enciende promociones y lealtad en ESENCIAL', () => {
      const result = resolveEffectiveCapabilities({
        subscription: subscription({ add_ons: ['bundle.marketing'] }),
        overrides: [],
        now: NOW,
      });

      expect(result.capabilities).toContain('promotions');
      expect(result.capabilities).toContain('loyalty');
      expect(result.capabilities).not.toContain('reports.margins');
    });

    it('bundle.cost_intelligence enciende los márgenes sin tocar los packs', () => {
      const result = resolveEffectiveCapabilities({
        subscription: subscription({ add_ons: ['bundle.cost_intelligence'] }),
        overrides: [],
        now: NOW,
      });

      expect(result.capabilities).toContain('reports.margins');
      expect(result.capabilities).not.toContain('inventory.retail');
    });

    it('bundle.convenio enciende los convenios B2B sobre promociones', () => {
      const result = resolveEffectiveCapabilities({
        subscription: subscription({
          add_ons: ['bundle.marketing', 'bundle.convenio'],
        }),
        overrides: [],
        now: NOW,
      });

      expect(result.capabilities).toContain('promotions.convenio');
    });

    it('rechaza convenios sin promociones: el requisito no se improvisa', () => {
      expect(() =>
        resolveEffectiveCapabilities({
          subscription: subscription({ add_ons: ['bundle.convenio'] }),
          overrides: [],
          now: NOW,
        }),
      ).toThrow(/CAPABILITY_PREREQUISITE_MISSING/);
    });

    it('rechaza un override que enciende convenios sin promociones', () => {
      expect(() =>
        resolveEffectiveCapabilities({
          subscription: subscription(),
          overrides: [override('promotions.convenio', { included: true })],
          now: NOW,
        }),
      ).toThrow(/CAPABILITY_PREREQUISITE_MISSING/);
    });

    it('rechaza un add-on fuera del catálogo en lugar de ignorarlo', () => {
      expect(() =>
        resolveEffectiveCapabilities({
          subscription: subscription({ add_ons: ['pack.premium_deluxe'] }),
          overrides: [],
          now: NOW,
        }),
      ).toThrow(/ADD_ON_NOT_IN_CATALOG/);
    });
  });

  describe('overrides vigentes (catalog §6.3)', () => {
    it('enciende una capacidad que el plan no incluye', () => {
      const result = resolveEffectiveCapabilities({
        subscription: subscription(),
        overrides: [override('reports.margins', { included: true })],
        now: NOW,
      });

      expect(result.capabilities).toContain('reports.margins');
    });

    it('apaga una capacidad que el plan incluye: el override gana', () => {
      const result = resolveEffectiveCapabilities({
        subscription: subscription({ plan_code: 'PRO' }),
        overrides: [override('loyalty', { included: false })],
        now: NOW,
      });

      expect(result.capabilities).not.toContain('loyalty');
      expect(result.capabilities).toContain('promotions');
    });

    it('fija un límite y gana sobre el plan y sobre los add-ons', () => {
      const result = resolveEffectiveCapabilities({
        subscription: subscription({ add_ons: ['terminal.extra'] }),
        overrides: [override('limits.terminals', { limit: 9 })],
        now: NOW,
      });

      expect(result.limits['limits.terminals']).toBe(9);
    });

    it('ignora un override vencido sin borrar su registro', () => {
      const result = resolveEffectiveCapabilities({
        subscription: subscription(),
        overrides: [
          override(
            'reports.margins',
            { included: true },
            new Date('2026-11-17T11:59:59.000Z'),
          ),
        ],
        now: NOW,
      });

      expect(result.capabilities).not.toContain('reports.margins');
    });

    it('no permite un override sobre el camino fiscal (catalog §7)', () => {
      expect(() =>
        resolveEffectiveCapabilities({
          subscription: subscription(),
          overrides: [override('core.sales', { included: false })],
          now: NOW,
        }),
      ).toThrow(/OVERRIDE_TARGET_NOT_GATEABLE/);
    });

    it('rechaza un override con valor mal formado', () => {
      expect(() =>
        resolveEffectiveCapabilities({
          subscription: subscription(),
          overrides: [override('reports.margins', { on: true })],
          now: NOW,
        }),
      ).toThrow(/OVERRIDE_VALUE_INVALID/);
    });
  });

  describe('plan no vigente (catalog §6.5)', () => {
    it('una suscripción suspendida conserva el núcleo y pierde lo premium', () => {
      const result = resolveEffectiveCapabilities({
        subscription: subscription({
          plan_code: 'PRO',
          status: 'suspended',
          support_tier: 'priority',
        }),
        overrides: [],
        now: NOW,
      });

      expect(result.status).toBe('suspended');
      expect(result.planCode).toBe('PRO');
      expect(result.capabilities).toStrictEqual([...NUCLEUS_CAPABILITY_KEYS]);
    });

    it('una suscripción suspendida conserva sus cuotas de hardware', () => {
      // Decisión ENT-02: la cuota es un hecho comercial, no una función
      // premium; una mora no debe impedir reponer un terminal averiado.
      const result = resolveEffectiveCapabilities({
        subscription: subscription({ plan_code: 'PRO', status: 'suspended' }),
        overrides: [],
        now: NOW,
      });

      expect(result.limits['limits.terminals']).toBe(2);
      expect(result.limits['limits.owner_accounts']).toBe(4);
    });

    it('una suscripción con ends_at pasado resuelve como expired', () => {
      const result = resolveEffectiveCapabilities({
        subscription: subscription({
          plan_code: 'PRO',
          ends_at: new Date('2026-11-01T00:00:00.000Z'),
        }),
        overrides: [],
        now: NOW,
      });

      expect(result.status).toBe('expired');
      expect(result.capabilities).toStrictEqual([...NUCLEUS_CAPABILITY_KEYS]);
    });
  });

  describe('catálogo fail-closed', () => {
    it('rechaza un plan que no está en el catálogo automático', () => {
      expect(() =>
        resolveEffectiveCapabilities({
          subscription: subscription({ plan_code: 'ENTERPRISE' }),
          overrides: [],
          now: NOW,
        }),
      ).toThrow(/PLAN_CODE_NOT_IN_CATALOG/);
    });

    it('rechaza un override sobre una clave no registrada', () => {
      expect(() =>
        resolveEffectiveCapabilities({
          subscription: subscription(),
          overrides: [override('inventory.teleport', { included: true })],
          now: NOW,
        }),
      ).toThrow(/CAPABILITY_KEY_NOT_REGISTERED/);
    });
  });

  it('expone un TTL de snapshot de 24 horas', () => {
    expect(ENTITLEMENT_SNAPSHOT_TTL_MS).toBe(24 * 60 * 60 * 1000);
  });
});
