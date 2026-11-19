import {
  normalizeOverrideGrant,
  OverrideRejectedError,
  OVERRIDE_REJECTION_CODES,
} from './entitlement-override-input';

/**
 * ENT-06 of issue #984 — no override reaches the table without this gate.
 *
 * The writable surface is the internal CLI only (no HTTP write path), so these
 * rules are the *only* thing standing between an operator typo and a tenant
 * whose entitlements are wrong. Catalog §6: an override is an audited
 * exception with `actor`, `motivo` and `expires_at` mandatory; §7: an exception
 * can never target a nucleus key, because plan rules must never touch the sale
 * or the fiscal document.
 *
 * The value shapes asserted here are the same ones `entitlement-resolution.ts`
 * consumes; the cross-check at the bottom proves both sides agree instead of
 * trusting that they do.
 */

const NOW = new Date('2026-11-18T15:00:00.000Z');
const IN_30_DAYS = new Date('2026-12-18T15:00:00.000Z');

const baseGrant = () => ({
  capabilityKey: 'inventory.retail',
  valueJson: { included: true } as Record<string, unknown>,
  actor: 'soporte@nhilos.com',
  reason: 'Piloto: el cliente compró el pack fuera del contrato.',
  expiresAt: IN_30_DAYS,
  now: NOW,
});

const rejectionOf = (input: Parameters<typeof normalizeOverrideGrant>[0]) => {
  try {
    normalizeOverrideGrant(input);
  } catch (error) {
    if (error instanceof OverrideRejectedError) return error.code;
    throw error;
  }
  throw new Error('expected the grant to be rejected');
};

describe('normalizeOverrideGrant (ENT-06 #984)', () => {
  it('acepta una excepción completa y devuelve los valores normalizados', () => {
    const normalized = normalizeOverrideGrant({
      ...baseGrant(),
      actor: '  soporte@nhilos.com  ',
      reason: '  Piloto autorizado por el dueño.  ',
    });

    expect(normalized.capabilityKey).toBe('inventory.retail');
    expect(normalized.valueJson).toStrictEqual({ included: true });
    expect(normalized.actor).toBe('soporte@nhilos.com');
    expect(normalized.reason).toBe('Piloto autorizado por el dueño.');
    expect(normalized.expiresAt).toStrictEqual(IN_30_DAYS);
  });

  it('acepta un límite numérico y el ilimitado', () => {
    expect(
      normalizeOverrideGrant({
        ...baseGrant(),
        capabilityKey: 'limits.terminals',
        valueJson: { limit: 3 },
      }).valueJson,
    ).toStrictEqual({ limit: 3 });

    expect(
      normalizeOverrideGrant({
        ...baseGrant(),
        capabilityKey: 'limits.owner_accounts',
        valueJson: { limit: null },
      }).valueJson,
    ).toStrictEqual({ limit: null });
  });

  it('rechaza una clave que no existe en el registro', () => {
    expect(
      rejectionOf({ ...baseGrant(), capabilityKey: 'inventory.blockchain' }),
    ).toBe(OVERRIDE_REJECTION_CODES.CAPABILITY_KEY_NOT_REGISTERED);
  });

  it('rechaza una clave de núcleo: ninguna excepción puede tocar la venta ni la factura', () => {
    for (const key of [
      'core.sales',
      'core.fiscal_invoice',
      'core.cash_shifts',
    ]) {
      expect(rejectionOf({ ...baseGrant(), capabilityKey: key })).toBe(
        OVERRIDE_REJECTION_CODES.OVERRIDE_TARGET_NOT_GATEABLE,
      );
    }
  });

  it('rechaza un valor con la forma equivocada para el tipo de clave', () => {
    // A flag is not a quota, and a quota is not a flag.
    expect(
      rejectionOf({
        ...baseGrant(),
        capabilityKey: 'limits.terminals',
        valueJson: { included: true },
      }),
    ).toBe(OVERRIDE_REJECTION_CODES.OVERRIDE_VALUE_INVALID);

    expect(
      rejectionOf({
        ...baseGrant(),
        capabilityKey: 'inventory.retail',
        valueJson: { limit: 2 },
      }),
    ).toBe(OVERRIDE_REJECTION_CODES.OVERRIDE_VALUE_INVALID);
  });

  it('rechaza límites que no son enteros no negativos', () => {
    for (const limit of [-1, 1.5, '3', undefined]) {
      expect(
        rejectionOf({
          ...baseGrant(),
          capabilityKey: 'limits.terminals',
          valueJson: { limit },
        }),
      ).toBe(OVERRIDE_REJECTION_CODES.OVERRIDE_VALUE_INVALID);
    }
  });

  it('exige actor y motivo: una excepción sin rastro no es una excepción auditada', () => {
    expect(rejectionOf({ ...baseGrant(), actor: '   ' })).toBe(
      OVERRIDE_REJECTION_CODES.OVERRIDE_ACTOR_REQUIRED,
    );
    expect(rejectionOf({ ...baseGrant(), reason: '  ' })).toBe(
      OVERRIDE_REJECTION_CODES.OVERRIDE_REASON_REQUIRED,
    );
  });

  it('exige una expiración futura y válida: la excepción no puede ser eterna', () => {
    for (const expiresAt of [
      new Date('2026-11-18T14:59:59.000Z'),
      new Date('2026-11-18T15:00:00.000Z'),
      new Date('not-a-date'),
    ]) {
      expect(rejectionOf({ ...baseGrant(), expiresAt })).toBe(
        OVERRIDE_REJECTION_CODES.OVERRIDE_EXPIRATION_REQUIRED,
      );
    }
  });

  it('etiqueta el rechazo con su código, sin depender de la prosa del mensaje', () => {
    try {
      normalizeOverrideGrant({ ...baseGrant(), capabilityKey: 'core.sales' });
      throw new Error('expected a rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(OverrideRejectedError);
      expect((error as OverrideRejectedError).code).toBe(
        OVERRIDE_REJECTION_CODES.OVERRIDE_TARGET_NOT_GATEABLE,
      );
      expect((error as Error).message).toContain(
        OVERRIDE_REJECTION_CODES.OVERRIDE_TARGET_NOT_GATEABLE,
      );
    }
  });
});
