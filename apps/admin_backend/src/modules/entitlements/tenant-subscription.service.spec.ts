import {
  NUCLEUS_CAPABILITY_KEYS,
  PLAN_CAPABILITY_MATRIX,
} from './capability-registry';
import {
  SUBSCRIPTION_REJECTION_CODES,
  normalizePlanChange,
  SubscriptionRejectedError,
} from './tenant-subscription.service';

/**
 * ENT-07 of issue #984 — the gate every plan change must pass before it is
 * written (ODD S11/S12).
 *
 * Changing a plan is a commercial act that moves what a tenant may use, so a
 * typo in the plan code, an add-on outside the catalog or a missing actor
 * must be refused BEFORE anything reaches the database. These rules are pure
 * and clock-free on purpose: the same function the service calls is what
 * these tests pin, and the DB spec proves the service actually runs it first.
 */

const NOW = new Date('2026-11-18T15:00:00.000Z');

const baseChange = () => ({
  tenantId: '4f1c2f7e-9a1b-4c3d-8e5f-0123456789ab',
  planCode: 'OPERACION',
  startsAt: NOW,
  addOns: ['pack.retail'],
  actor: 'soporte@nhilos.com',
  reason: 'Upgrade solicitado por el cliente; contrato firmado 2026-11-25.',
  now: NOW,
});

const rejectionOf = (input: Parameters<typeof normalizePlanChange>[0]) => {
  try {
    normalizePlanChange(input);
  } catch (error) {
    if (error instanceof SubscriptionRejectedError) return error.code;
    throw error;
  }
  throw new Error('expected the plan change to be rejected');
};

describe('normalizePlanChange (ENT-07 #984)', () => {
  it('acepta un cambio completo y devuelve el contrato normalizado', () => {
    const normalized = normalizePlanChange({
      ...baseChange(),
      actor: '  soporte@nhilos.com  ',
      reason: '  Upgrade autorizado por el dueño.  ',
      status: 'active',
      supportTier: 'standard',
    });

    expect(normalized.planCode).toBe('OPERACION');
    expect(normalized.status).toBe('active');
    expect(normalized.startsAt).toStrictEqual(NOW);
    expect(normalized.endsAt).toBeNull();
    expect(normalized.addOns).toStrictEqual(['pack.retail']);
    expect(normalized.supportTier).toBe('standard');
    expect(normalized.actor).toBe('soporte@nhilos.com');
    expect(normalized.reason).toBe('Upgrade autorizado por el dueño.');
  });

  it('aplica los valores predeterminados: active y standard, sin fin de vigencia', () => {
    const normalized = normalizePlanChange(baseChange());
    expect(normalized.status).toBe('active');
    expect(normalized.supportTier).toBe('standard');
    expect(normalized.endsAt).toBeNull();
    expect(normalized.addOns).toStrictEqual(['pack.retail']);
  });

  it('acepta una suscripción suspendida y una vencida: son los únicos estados válidos', () => {
    expect(
      normalizePlanChange({ ...baseChange(), status: 'suspended' }).status,
    ).toBe('suspended');
    expect(
      normalizePlanChange({ ...baseChange(), status: 'expired' }).status,
    ).toBe('expired');
  });

  it('acepta varios add-ons en orden de catálogo', () => {
    expect(
      normalizePlanChange({
        ...baseChange(),
        planCode: 'ESENCIAL',
        addOns: ['pack.retail', 'bundle.marketing', 'terminal.extra'],
      }).addOns,
    ).toStrictEqual(['pack.retail', 'bundle.marketing', 'terminal.extra']);
  });

  it('rechaza un plan fuera del catálogo (ENTERPRISE incluido)', () => {
    expect(rejectionOf({ ...baseChange(), planCode: 'ENTERPRISE' })).toBe(
      SUBSCRIPTION_REJECTION_CODES.PLAN_CODE_NOT_REGISTERED,
    );
    expect(rejectionOf({ ...baseChange(), planCode: 'operacion' })).toBe(
      SUBSCRIPTION_REJECTION_CODES.PLAN_CODE_NOT_REGISTERED,
    );
  });

  it('rechaza un add-on desconocido con su código estable', () => {
    expect(rejectionOf({ ...baseChange(), addOns: ['pack.blockchain'] })).toBe(
      SUBSCRIPTION_REJECTION_CODES.ADD_ON_NOT_REGISTERED,
    );
  });

  it('rechaza un estado que no sea active, suspended o expired', () => {
    expect(rejectionOf({ ...baseChange(), status: 'trial' })).toBe(
      SUBSCRIPTION_REJECTION_CODES.SUBSCRIPTION_STATUS_INVALID,
    );
    expect(rejectionOf({ ...baseChange(), status: 'ACTIVE' })).toBe(
      SUBSCRIPTION_REJECTION_CODES.SUBSCRIPTION_STATUS_INVALID,
    );
  });

  it('rechaza un nivel de soporte que no sea standard o priority', () => {
    expect(rejectionOf({ ...baseChange(), supportTier: 'gold' })).toBe(
      SUBSCRIPTION_REJECTION_CODES.SUBSCRIPTION_SUPPORT_TIER_INVALID,
    );
  });

  it('rechaza fechas de vigencia que no son instantes válidos', () => {
    expect(
      rejectionOf({ ...baseChange(), startsAt: new Date('no-es-fecha') }),
    ).toBe(SUBSCRIPTION_REJECTION_CODES.SUBSCRIPTION_STARTS_AT_INVALID);
    expect(rejectionOf({ ...baseChange(), endsAt: new Date('tampoco') })).toBe(
      SUBSCRIPTION_REJECTION_CODES.SUBSCRIPTION_ENDS_AT_INVALID,
    );
  });

  it('no deja pasar un cambio sin rastro: actor y motivo obligatorios (S12)', () => {
    expect(rejectionOf({ ...baseChange(), actor: '   ' })).toBe(
      SUBSCRIPTION_REJECTION_CODES.SUBSCRIPTION_ACTOR_REQUIRED,
    );
    expect(rejectionOf({ ...baseChange(), reason: '' })).toBe(
      SUBSCRIPTION_REJECTION_CODES.SUBSCRIPTION_REASON_REQUIRED,
    );
  });

  it('ningún plan del catálogo concede ni quita una clave de núcleo (catálogo §7)', () => {
    // The plan matrix rows only over gated keys: the nucleus is not part of
    // the commercial negotiation. Pinned structurally so a future matrix edit
    // that touches `core.*` fails here before it ships.
    for (const plan of PLAN_CAPABILITY_MATRIX) {
      for (const key of [
        ...Object.keys(plan.includedFlags),
        ...Object.keys(plan.includedLimits),
      ]) {
        expect({
          plan: plan.planCode,
          key,
          isNucleus: NUCLEUS_CAPABILITY_KEYS.includes(key),
        }).toStrictEqual({ plan: plan.planCode, key, isNucleus: false });
      }
    }
  });
});
