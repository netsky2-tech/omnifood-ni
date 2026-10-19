import { CreateModifierDto } from '../sales/dto/sync-invoice.dto';

/**
 * The inventory effect of a modifier, resolved SERVER-SIDE (R28 / M4).
 *
 * This is the cloud's mirror of the POS's `ModifierDeviationResolver`: the
 * same five effects, the same inheritance and the same skip reasons, so the
 * demand the cloud recomputes and the demand the terminal sent can be
 * compared MEANINGFULLY.
 *
 * WHY IT EXISTS: the terminal is the authority of the demand (it holds the
 * frozen authority and the catalogue), but the cloud must NOT take that on
 * faith. It recomputes the demand from the published recipe plus the
 * deviations the terminal DECLARED, and compares. A terminal that declares a
 * deviation and then applies it differently is caught (the sale degrades to
 * APPLIED_INVENTORY_PENDING, fail-closed, exactly like the negative-stock
 * guard).
 *
 * WHAT IT DELIBERATELY DOES NOT DO: it does not verify anything the
 * terminal did not declare. A terminal whose catalogue predates the effect
 * (an APK that predates R28) sends no deviation, and there is nothing to
 * compare: its demand is the recipe's demand, which is what the cloud
 * expects from a terminal that does not know the effect. That terminal is
 * NOT punished — the SOHO guarantee (D6) says a failure of this feature
 * degrades the inventory, never the sale, and a stale terminal is not a
 * failure of the sale.
 *
 * THE SKIP RULES ARE THE POS'S, VERBATIM:
 *  - an insumo the company has not registered → NO_IMPACT (the effect does
 *    not apply on either side);
 *  - a quantity inherited from a component whose unit differs from the
 *    affected insumo's unit → NO_IMPACT until the operator marks it;
 *  - a component the recipe does not have → NO_IMPACT;
 *  - an incomplete effect → NO_IMPACT.
 */

/** One leaf of the recipe's consumption, after the sub-recipe explosion. */
export interface DeviationLeaf {
  insumoId: string;
  quantityPerSaleUnit: number;
  /** The root component that introduced the leaf, when it is one. */
  rootComponentId: string | null;
}

/** A component of the ROOT recipe (the one the deviations target). */
export interface DeviationRootComponent {
  id: string;
  insumoId: string;
  /** The per-sold-unit consumption of the component. */
  quantityPerSaleUnit: number;
}

/** What the cloud knows about an insumo of the tenant. */
export interface DeviationInsumo {
  id: string;
  consumptionUom: string;
}

export type DeviationSkipReason =
  | 'INSUMSO_NOT_IN_CATALOG'
  | 'UNIT_MISMATCH'
  | 'COMPONENT_NOT_IN_RECIPE'
  | 'INCOMPLETE';

export interface DeviationOutcome {
  optionId: string;
  effect: string;
  applied: boolean;
  skipReason?: DeviationSkipReason;
}

export interface DeviationResolution {
  /** The demand the line really consumes, per insumo, per sold unit. */
  demand: Map<string, number>;
  /** What happened to each declared effect. */
  outcomes: DeviationOutcome[];
}

const round4 = (value: number): number => Number(value.toFixed(4));

/**
 * Resolves the deviations over the recipe's leaves.
 *
 * @param leaves the recipe's consumption (per sold unit), with the root
 *   component that introduced each leaf.
 * @param rootComponents the ROOT recipe's components (the deviations
 *   target these).
 * @param modifiers the line's declared deviations.
 * @param tenantInsumosById the tenant's insumos: the ones the effects
 *   reference. An effect that references an insumo that is NOT here is
 *   NO_IMPACT — the SOHO guarantee.
 */
export function resolveDeviations(input: {
  leaves: DeviationLeaf[];
  rootComponents: DeviationRootComponent[];
  modifiers: CreateModifierDto[];
  tenantInsumosById: Map<string, DeviationInsumo>;
}): DeviationResolution {
  let leaves: DeviationLeaf[] = [...input.leaves];
  const outcomes: DeviationOutcome[] = [];

  for (const modifier of input.modifiers) {
    const effect = modifier.inventoryEffect;
    if (!effect || effect === 'NONE') continue;
    const optionId = modifier.optionId ?? '';

    // The component of the recipe the effect acts on.
    let target: DeviationRootComponent | undefined;
    if (modifier.effectTargetInsumoId) {
      target = input.rootComponents.find(
        (component) => component.insumoId === modifier.effectTargetInsumoId,
      );
      if (!target) {
        outcomes.push({
          optionId,
          effect,
          applied: false,
          skipReason: 'COMPONENT_NOT_IN_RECIPE',
        });
        continue;
      }
    }

    switch (effect) {
      case 'REMOVE': {
        if (!target) {
          outcomes.push({
            optionId,
            effect,
            applied: false,
            skipReason: 'COMPONENT_NOT_IN_RECIPE',
          });
          break;
        }
        // The component's leaf stops being consumed: the whole milk of the
        // recipe is NOT downloaded.
        leaves = leaves.filter(
          (leaf) => leaf.rootComponentId !== target!.id,
        );
        outcomes.push({ optionId, effect, applied: true });
        break;
      }

      case 'SWAP': {
        const substituteId = modifier.effectInsumoId;
        if (!substituteId) {
          outcomes.push({
            optionId,
            effect,
            applied: false,
            skipReason: 'INCOMPLETE',
          });
          break;
        }
        if (!input.tenantInsumosById.has(substituteId)) {
          // THE SOHO GUARANTEE: an insumo this company has not registered
          // cannot be deducted, on either side.
          outcomes.push({
            optionId,
            effect,
            applied: false,
            skipReason: 'INSUMSO_NOT_IN_CATALOG',
          });
          break;
        }
        const quantity = resolveQuantity(
          modifier,
          target,
          input.tenantInsumosById,
          substituteId,
        );
        if (quantity === null) {
          outcomes.push({
            optionId,
            effect,
            applied: false,
            skipReason: target ? 'UNIT_MISMATCH' : 'INCOMPLETE',
          });
          break;
        }
        leaves = leaves.filter(
          (leaf) => leaf.rootComponentId !== target!.id,
        );
        leaves = mergeLeaf(leaves, {
          insumoId: substituteId,
          quantityPerSaleUnit: quantity,
          rootComponentId: null,
        });
        outcomes.push({ optionId, effect, applied: true });
        break;
      }

      case 'SCALE': {
        if (!target) {
          outcomes.push({
            optionId,
            effect,
            applied: false,
            skipReason: 'COMPONENT_NOT_IN_RECIPE',
          });
          break;
        }
        const factor = modifier.effectFactor;
        if (factor === undefined || factor === null || factor <= 0) {
          outcomes.push({
            optionId,
            effect,
            applied: false,
            skipReason: 'INCOMPLETE',
          });
          break;
        }
        leaves = leaves.map((leaf) =>
          leaf.rootComponentId === target!.id
            ? {
                ...leaf,
                quantityPerSaleUnit: round4(
                  leaf.quantityPerSaleUnit * factor,
                ),
              }
            : leaf,
        );
        outcomes.push({ optionId, effect, applied: true });
        break;
      }

      case 'ADD':
      default: {
        const insumoId = modifier.effectInsumoId;
        if (!insumoId) {
          outcomes.push({
            optionId,
            effect,
            applied: false,
            skipReason: 'INCOMPLETE',
          });
          break;
        }
        if (!input.tenantInsumosById.has(insumoId)) {
          outcomes.push({
            optionId,
            effect,
            applied: false,
            skipReason: 'INSUMSO_NOT_IN_CATALOG',
          });
          break;
        }
        const quantity = resolveQuantity(
          modifier,
          target,
          input.tenantInsumosById,
          insumoId,
        );
        if (quantity === null) {
          outcomes.push({
            optionId,
            effect,
            applied: false,
            skipReason: target ? 'UNIT_MISMATCH' : 'INCOMPLETE',
          });
          break;
        }
        leaves = mergeLeaf(leaves, {
          insumoId,
          quantityPerSaleUnit: quantity,
          rootComponentId: null,
        });
        outcomes.push({ optionId, effect, applied: true });
        break;
      }
    }
  }

  const demand = new Map<string, number>();
  for (const leaf of leaves) {
    demand.set(
      leaf.insumoId,
      round4((demand.get(leaf.insumoId) ?? 0) + leaf.quantityPerSaleUnit),
    );
  }

  return { demand, outcomes };
}

/**
 * The quantity the effect applies per sold unit: the operator's explicit
 * quantity, or the one INHERITED from the recipe component — and only when
 * the inherited number means the same thing in the affected insumo's unit.
 */
function resolveQuantity(
  modifier: CreateModifierDto,
  target: DeviationRootComponent | undefined,
  tenantInsumosById: Map<string, DeviationInsumo>,
  affectedInsumoId: string,
): number | null {
  const explicit = modifier.effectQuantity;
  if (explicit !== undefined && explicit !== null) {
    if (explicit <= 0) return null;
    return round4(explicit);
  }
  if (!target) return null;

  const affectedUnit = tenantInsumosById.get(affectedInsumoId)?.consumptionUom;
  const targetUnit = tenantInsumosById.get(target.insumoId)?.consumptionUom;
  if (
    affectedUnit &&
    targetUnit &&
    affectedUnit.toUpperCase() !== targetUnit.toUpperCase()
  ) {
    return null;
  }
  return round4(target.quantityPerSaleUnit);
}

/** Adds the quantity to the leaf of that insumo, or creates it. */
function mergeLeaf(
  leaves: DeviationLeaf[],
  leaf: DeviationLeaf,
): DeviationLeaf[] {
  const existing = leaves.find((l) => l.insumoId === leaf.insumoId);
  if (!existing) return [...leaves, leaf];
  return leaves.map((l) =>
    l.insumoId === leaf.insumoId
      ? {
          ...l,
          quantityPerSaleUnit: round4(
            l.quantityPerSaleUnit + leaf.quantityPerSaleUnit,
          ),
        }
      : l,
  );
}
