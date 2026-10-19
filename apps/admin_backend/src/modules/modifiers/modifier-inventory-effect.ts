/**
 * Inventory effect of a modifier option (R28).
 *
 * The modifiers of this platform were, until R28, **purely monetary**: a
 * `price_delta`, a label and a quantity. The industry model the owner chose
 * (RestaurantMate's five effects, adapted to the food park and the restaurant
 * expansion) gives every option an optional INVENTORY effect, expressed here
 * as a small, pure, testable value object.
 *
 * THE FIVE EFFECTS
 *
 *   NONE    — price only. The modifier is "included, not costed": it does
 *             not touch the inventory. This is the DEFAULT and it is what
 *             keeps every tenant that never configured an effect exactly
 *             as it is today.
 *   ADD     — contributes an insumo: an extra shot of coffee adds coffee.
 *   REMOVE  — takes a component of the recipe out: "no onion".
 *   SWAP    — replaces a component of the recipe with another insumo: almond
 *             milk instead of whole milk. The replaced component is RESTOCKED
 *             and the substitute is deducted.
 *   SCALE   — multiplies a component: a double shot of coffee.
 *
 * THE TWO INHERITANCE RULES
 *
 *   1. The quantity INHERITS from the recipe component it affects
 *      (`RecipeDetail.quantity`, the per-sold-unit consumption) unless the
 *      operator marks an explicit quantity — which the modifiers modal does,
 *      the same place where the extras are already picked. "Almond milk"
 *      therefore takes the recipe's own milk quantity, not a number typed
 *      twice.
 *   2. The applied quantity is expressed in the AFFECTED insumo's own
 *      consumption unit. When the inherited quantity comes from a component
 *      declared in another unit, the resolution converts it through the
 *      platform UoM catalog (see `uom-catalog.ts`).
 *
 * THE SOHO GUARANTEE (D6, R28)
 *
 * An inventory effect is OPT-IN per option and **can never block a sale**:
 *
 *   - a tenant that does not configure an effect keeps today's behaviour;
 *   - an effect that points at an insumo the tenant does NOT have registered
 *     resolves to NO_IMPACT (the effect is not applied and the sale goes
 *     through) — never an error, never a stock guard, never a 400;
 *   - the stock guard only ever sees the demand that was really materialised.
 *
 * A failure of this feature degrades the inventory, never the sale.
 */

/** The five effects of the industry model, plus the default. */
export const MODIFIER_INVENTORY_EFFECT = {
  /** Price only: included, not costed. The default. */
  NONE: 'NONE',
  /** Contributes an insumo (extra shot of coffee). */
  ADD: 'ADD',
  /** Takes a component of the recipe out (no onion). */
  REMOVE: 'REMOVE',
  /** Replaces a component of the recipe with another insumo (almond milk). */
  SWAP: 'SWAP',
  /** Multiplies a component (a double shot). */
  SCALE: 'SCALE',
} as const;

export type ModifierInventoryEffect =
  (typeof MODIFIER_INVENTORY_EFFECT)[keyof typeof MODIFIER_INVENTORY_EFFECT];

export const MODIFIER_INVENTORY_EFFECTS: readonly ModifierInventoryEffect[] =
  Object.values(MODIFIER_INVENTORY_EFFECT);

export function isModifierInventoryEffect(
  value: unknown,
): value is ModifierInventoryEffect {
  return (
    typeof value === 'string' &&
    (MODIFIER_INVENTORY_EFFECTS as readonly string[]).includes(value)
  );
}

/**
 * The inventory effect declared for one modifier option.
 *
 * `effect_insumo_id` — the insumo the effect acts ON: added (ADD), substituted
 * in (SWAP). NULL for REMOVE and SCALE, where the affected insumo is the
 * target's own.
 * `effect_target_insumo_id` — the insumo of the RECIPE COMPONENT the effect
 * affects: removed (REMOVE), replaced (SWAP), scaled (SCALE), or the one
 * whose quantity an ADD inherits (an extra shot of the recipe's own coffee).
 * NULL for a plain ADD that declares its own quantity.
 * `effect_quantity` — the quantity to apply per sold unit, in the affected
 * insumo's consumption unit. NULL means INHERIT it from the target component.
 * `effect_factor` — the multiplier of a SCALE (2 = double).
 */
export interface ModifierInventoryEffectSpec {
  effect: ModifierInventoryEffect;
  effect_insumo_id?: string | null;
  effect_target_insumo_id?: string | null;
  effect_quantity?: number | null;
  effect_factor?: number | null;
}

/** A validation failure of the effect declaration (operator-facing copy). */
export class ModifierInventoryEffectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModifierInventoryEffectError';
  }
}

const isBlank = (value: string | null | undefined): boolean =>
  value === null || value === undefined || value.trim().length === 0;

/**
 * Validates the SHAPE of an effect declaration.
 *
 * Pure and tenant-agnostic: it checks what each effect needs and forbids
 * what it must not carry, so a half-configured effect can never reach the
 * resolution (a modifier that silently deducts nothing is the failure mode
 * this guards against).
 *
 * @throws ModifierInventoryEffectError with operator-facing copy.
 */
export function assertValidModifierInventoryEffect(
  spec: ModifierInventoryEffectSpec,
): void {
  const effect = spec.effect;

  if (!isModifierInventoryEffect(effect)) {
    throw new ModifierInventoryEffectError(
      `Efecto de inventario desconocido: '${String(effect)}'. Use uno de: ${MODIFIER_INVENTORY_EFFECTS.join(', ')}.`,
    );
  }

  const hasInsumo = !isBlank(spec.effect_insumo_id);
  const hasTarget = !isBlank(spec.effect_target_insumo_id);
  const hasQuantity =
    spec.effect_quantity !== null &&
    spec.effect_quantity !== undefined;
  const hasFactor =
    spec.effect_factor !== null && spec.effect_factor !== undefined;

  if (effect === MODIFIER_INVENTORY_EFFECT.NONE) {
    if (hasInsumo || hasTarget || hasQuantity || hasFactor) {
      throw new ModifierInventoryEffectError(
        'Un modificador sin efecto de inventario (NONE) no puede declarar insumo, cantidad ni factor.',
      );
    }
    return;
  }

  if (effect === MODIFIER_INVENTORY_EFFECT.ADD) {
    if (!hasInsumo) {
      throw new ModifierInventoryEffectError(
        'El efecto ADD necesita el insumo que aporta (ej. el café de un shot extra).',
      );
    }
    if (hasFactor) {
      throw new ModifierInventoryEffectError(
        'El efecto ADD no admite factor: use SCALE para multiplicar un componente.',
      );
    }
    // An ADD with a target inherits the target's quantity; without a target
    // it must declare one, or there would be nothing to apply.
    if (!hasTarget && !hasQuantity) {
      throw new ModifierInventoryEffectError(
        'El efecto ADD necesita una cantidad, o el insumo de cuyo componente la hereda.',
      );
    }
    if (hasQuantity && Number(spec.effect_quantity) <= 0) {
      throw new ModifierInventoryEffectError(
        'La cantidad del efecto debe ser mayor que 0.',
      );
    }
    return;
  }

  if (effect === MODIFIER_INVENTORY_EFFECT.REMOVE) {
    if (!hasTarget) {
      throw new ModifierInventoryEffectError(
        'El efecto REMOVE necesita el insumo del componente de la receta que quita (ej. la cebolla).',
      );
    }
    if (hasInsumo) {
      throw new ModifierInventoryEffectError(
        'El efecto REMOVE no declara insumo: el componente que se quita es el del objetivo.',
      );
    }
    if (hasQuantity || hasFactor) {
      throw new ModifierInventoryEffectError(
        'El efecto REMOVE no admite cantidad ni factor: la cantidad quitada es la del propio componente.',
      );
    }
    return;
  }

  if (effect === MODIFIER_INVENTORY_EFFECT.SWAP) {
    if (!hasTarget) {
      throw new ModifierInventoryEffectError(
        'El efecto SWAP necesita el insumo del componente de la receta que reemplaza (ej. la leche entera).',
      );
    }
    if (!hasInsumo) {
      throw new ModifierInventoryEffectError(
        'El efecto SWAP necesita el insumo que entra en su lugar (ej. la leche de almendras).',
      );
    }
    if (spec.effect_insumo_id === spec.effect_target_insumo_id) {
      throw new ModifierInventoryEffectError(
        'El efecto SWAP no puede reemplazar un insumo por sí mismo.',
      );
    }
    if (hasFactor) {
      throw new ModifierInventoryEffectError(
        'El efecto SWAP no admite factor.',
      );
    }
    if (hasQuantity && Number(spec.effect_quantity) <= 0) {
      throw new ModifierInventoryEffectError(
        'La cantidad del efecto debe ser mayor que 0.',
      );
    }
    return;
  }

  // SCALE
  if (!hasTarget) {
    throw new ModifierInventoryEffectError(
      'El efecto SCALE necesita el insumo del componente de la receta que multiplica.',
    );
  }
  if (hasInsumo) {
    throw new ModifierInventoryEffectError(
      'El efecto SCALE no declara insumo: el componente que se multiplica es el del objetivo.',
    );
  }
  if (!hasFactor) {
    throw new ModifierInventoryEffectError(
      'El efecto SCALE necesita el factor por el que se multiplica (ej. 2 para el doble).',
    );
  }
  if (Number(spec.effect_factor) <= 0) {
    throw new ModifierInventoryEffectError(
      'El factor del efecto debe ser mayor que 0.',
    );
  }
  if (hasQuantity) {
    throw new ModifierInventoryEffectError(
      'El efecto SCALE no admite cantidad: use el factor.',
    );
  }
}

/**
 * The effect of an option, normalized: an option without a declared effect is
 * `NONE` with nothing else. Used by the read models so every consumer sees
 * the same shape.
 */
export function normalizeModifierInventoryEffect(
  spec: Partial<ModifierInventoryEffectSpec> | null | undefined,
): ModifierInventoryEffectSpec {
  const effect = spec?.effect ?? MODIFIER_INVENTORY_EFFECT.NONE;
  return {
    effect,
    effect_insumo_id: spec?.effect_insumo_id ?? null,
    effect_target_insumo_id: spec?.effect_target_insumo_id ?? null,
    effect_quantity: spec?.effect_quantity ?? null,
    effect_factor: spec?.effect_factor ?? null,
  };
}

/**
 * Whether the effect declares an insumo the tenant must have registered.
 *
 * The SOHO guarantee is implemented on top of this: an effect whose insumo is
 * missing locally resolves to NO_IMPACT (the effect is not applied), and
 * never to an error.
 */
export function effectRequiresInsumo(
  spec: ModifierInventoryEffectSpec,
): boolean {
  return (
    spec.effect === MODIFIER_INVENTORY_EFFECT.ADD ||
    spec.effect === MODIFIER_INVENTORY_EFFECT.SWAP
  );
}
