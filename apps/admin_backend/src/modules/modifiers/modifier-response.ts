import { ModifierGroup } from './entities/modifier-group.entity';
import { ModifierOption } from './entities/modifier-option.entity';
import type {
  EffectiveModifierGroup,
  EffectiveModifierOption,
} from './services/modifiers.service';

/**
 * Postgres `numeric` columns reach Node as strings: node-postgres parses
 * `numeric` to text and TypeORM's Postgres driver has no decimal hydration
 * case, while `ModifierOption` declares `price_delta` as `number`. The
 * coercion lives here, at the response boundary only, so internal readers
 * (services, listeners) and the `change_log` `from` values keep seeing
 * exactly what the driver returned. Entities are never mutated; every other
 * field is passed through untouched.
 *
 * Decimal-field inventory of the modifiers module (migration
 * 1809550000000): `modifier_options.price_delta numeric(12,2)` is the ONLY
 * `numeric`/`decimal` column — every other numeric field (`min_selected`,
 * `max_selected`, `sort_order`) is `integer`, which node-postgres returns
 * as a real number already. Same doctrine as the products decimal contract
 * in `modules/inventory/product-response.ts`; no column transformer, on
 * purpose, so `change_log` from-values keep the driver's raw shape.
 */
export type ModifierOptionResponse = Omit<ModifierOption, 'price_delta'> & {
  price_delta: number;
};

export type ModifierGroupResponse = Omit<
  ModifierGroup & { options: ModifierOption[] },
  'options'
> & {
  options: ModifierOptionResponse[];
};

export type EffectiveModifierOptionResponse = Omit<
  EffectiveModifierOption,
  'price_delta'
> & {
  price_delta: number;
};

export type EffectiveModifierGroupResponse = Omit<
  EffectiveModifierGroup,
  'options'
> & {
  options: EffectiveModifierOptionResponse[];
};

function toFiniteNumber(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function serializeModifierOption(
  option: ModifierOption,
): ModifierOptionResponse {
  return {
    ...option,
    price_delta: toFiniteNumber(option.price_delta),
  };
}

export function serializeModifierGroup(
  group: ModifierGroup & { options?: ModifierOption[] },
): ModifierGroupResponse {
  return {
    ...group,
    options: (group.options ?? []).map(serializeModifierOption),
  };
}

export function serializeModifierGroups(
  groups: Array<ModifierGroup & { options: ModifierOption[] }>,
): ModifierGroupResponse[] {
  return groups.map(serializeModifierGroup);
}

export function serializeEffectiveGroups(
  groups: EffectiveModifierGroup[],
): EffectiveModifierGroupResponse[] {
  return groups.map((group) => ({
    ...group,
    options: group.options.map(
      (option): EffectiveModifierOptionResponse => ({
        ...option,
        price_delta: toFiniteNumber(option.price_delta),
      }),
    ),
  }));
}
