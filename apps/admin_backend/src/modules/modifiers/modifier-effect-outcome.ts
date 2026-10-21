/**
 * ME-04: the TRUTH of a modifier's effect, as the sale resolved it.
 *
 * A line whose effect did not touch the stock is a SALE THAT HAPPENED WITH
 * A MISSING INVENTORY MOVEMENT. Before this contract the cloud could not
 * tell that case from a line that never declared an effect, so the pending
 * sale was invisible until somebody reconciled it by hand.
 *
 * The vocabulary is the SHARED one: the POS writes it (the resolver's
 * `wireName`), the cloud stores it and the backoffice reads it. The two
 * sides must name the same reasons the same way, or the contract cannot
 * compare them.
 */

/** Whether the effect moved the stock. */
export const MODIFIER_EFFECT_STATUS = {
  /** The effect was applied: the stock moved as the line said it would. */
  APPLIED: 'APPLIED',
  /**
   * The sale went through but the effect did NOT touch the stock. The
   * reason says why. A pending effect is never a blocked sale: the
   * inventory degrades, the sale does not.
   */
  PENDING: 'PENDING',
} as const;

export type ModifierEffectStatus =
  (typeof MODIFIER_EFFECT_STATUS)[keyof typeof MODIFIER_EFFECT_STATUS];

export const MODIFIER_EFFECT_STATUSES: readonly ModifierEffectStatus[] =
  Object.values(MODIFIER_EFFECT_STATUS);

/** Why the effect did not apply. */
export const MODIFIER_EFFECT_SKIP_REASON = {
  /** The effect names neither a component nor a quantity. */
  INCOMPLETE: 'INCOMPLETE',
  /** The quantity would be inherited in another unit than the one it applies to. */
  UNIT_MISMATCH: 'UNIT_MISMATCH',
  /** The insumo the effect acts on is not in this company's catalog. */
  INSUMSO_NOT_IN_CATALOG: 'INSUMSO_NOT_IN_CATALOG',
  /** The effect names a component the recipe does not have. */
  COMPONENT_NOT_IN_RECIPE: 'COMPONENT_NOT_IN_RECIPE',
} as const;

export type ModifierEffectSkipReason =
  (typeof MODIFIER_EFFECT_SKIP_REASON)[keyof typeof MODIFIER_EFFECT_SKIP_REASON];

export const MODIFIER_EFFECT_SKIP_REASONS: readonly ModifierEffectSkipReason[] =
  Object.values(MODIFIER_EFFECT_SKIP_REASON);

/** Where the applied quantity came from. */
export const MODIFIER_EFFECT_QUANTITY_SOURCE = {
  /** The backoffice configured it for the option. */
  DECLARED: 'DECLARED',
  /** The recipe component's own per-sold-unit quantity. */
  INHERITED: 'INHERITED',
  /** A supervisor marked it (with authorization and a reason). */
  OVERRIDE: 'OVERRIDE',
} as const;

export type ModifierEffectQuantitySource =
  (typeof MODIFIER_EFFECT_QUANTITY_SOURCE)[keyof typeof MODIFIER_EFFECT_QUANTITY_SOURCE];

export const MODIFIER_EFFECT_QUANTITY_SOURCES: readonly ModifierEffectQuantitySource[] =
  Object.values(MODIFIER_EFFECT_QUANTITY_SOURCE);
