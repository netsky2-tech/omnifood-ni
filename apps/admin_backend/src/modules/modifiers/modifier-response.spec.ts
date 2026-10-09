import { ModifierGroup } from './entities/modifier-group.entity';
import { ModifierOption } from './entities/modifier-option.entity';
import {
  serializeModifierGroup,
  serializeModifierGroups,
  serializeModifierOption,
  serializeEffectiveGroups,
} from './modifier-response';
import type {
  EffectiveModifierGroup,
  EffectiveModifierOption,
} from './services/modifiers.service';

/**
 * Postgres `numeric` columns reach Node as strings: node-postgres parses
 * `numeric` to text and TypeORM's Postgres driver has no decimal hydration
 * case. `ModifierOption` declares `price_delta` as `number`, so the raw
 * entity lies over the wire. These cases pin the boundary that restores the
 * declared type without mutating the entity (same doctrine as the products
 * decimal contract in `modules/inventory/product-response.ts`).
 */
describe('serializeModifierOption', () => {
  // The override bag stays untyped on purpose: the whole point of this
  // boundary is that the driver hands back strings where the entity
  // declares numbers.
  const makeOption = (over: Record<string, unknown> = {}): ModifierOption =>
    ({
      id: 'opt-1',
      tenant_id: 'tenant-A',
      group_id: 'group-1',
      name: 'Entera',
      price_delta: '0.00',
      is_default: false,
      sort_order: 0,
      is_active: true,
      created_at: new Date('2026-01-01T00:00:00.000Z'),
      updated_at: new Date('2026-01-01T00:00:00.000Z'),
      ...over,
    }) as unknown as ModifierOption;

  it('coerces the driver string into a JSON number', () => {
    const result = serializeModifierOption(makeOption());

    expect(result.price_delta).toBe(0);
    expect(typeof result.price_delta).toBe('number');
  });

  it('preserves decimal precision instead of truncating it', () => {
    const result = serializeModifierOption(makeOption({ price_delta: '15.25' }));

    expect(result.price_delta).toBe(15.25);
    // The value must survive the numeric methods consumers call on it.
    expect(result.price_delta.toFixed(2)).toBe('15.25');
  });

  it('keeps negative deltas (discount options) intact', () => {
    const result = serializeModifierOption(
      makeOption({ price_delta: '-2.50' }),
    );

    expect(result.price_delta).toBe(-2.5);
  });

  it('leaves already-numeric values untouched', () => {
    const result = serializeModifierOption(makeOption({ price_delta: 45 }));

    expect(result.price_delta).toBe(45);
  });

  it('keeps every non-numeric field byte-identical', () => {
    const option = makeOption({ name: 'Sin cebolla' });
    const result = serializeModifierOption(option);

    expect(result.id).toBe(option.id);
    expect(result.tenant_id).toBe(option.tenant_id);
    expect(result.group_id).toBe(option.group_id);
    expect(result.name).toBe('Sin cebolla');
    expect(result.is_default).toBe(false);
    expect(result.sort_order).toBe(0);
    expect(result.is_active).toBe(true);
    expect(result.created_at).toBe(option.created_at);
  });

  it('does not mutate the entity it serializes', () => {
    const option = makeOption({ price_delta: '0.00' });
    serializeModifierOption(option);

    expect(option.price_delta).toBe('0.00');
  });

  it('fails closed to 0 for values that are not finite numbers', () => {
    const result = serializeModifierOption(
      makeOption({ price_delta: 'not-a-number' }),
    );

    expect(result.price_delta).toBe(0);
  });

  it('treats absent values as 0 rather than undefined', () => {
    const result = serializeModifierOption(makeOption({ price_delta: null }));

    expect(result.price_delta).toBe(0);
  });
});

describe('serializeModifierGroup', () => {
  const makeGroup = (
    optionOverrides: Record<string, unknown>[] = [],
  ): ModifierGroup & { options: ModifierOption[] } =>
    ({
      id: 'group-1',
      tenant_id: 'tenant-A',
      name: 'Leche',
      min_selected: 0,
      max_selected: 1,
      allow_quantities: false,
      sort_order: 0,
      is_active: true,
      created_at: new Date('2026-01-01T00:00:00.000Z'),
      updated_at: new Date('2026-01-01T00:00:00.000Z'),
      options: optionOverrides.map((over) =>
        ({
          id: 'opt-1',
          tenant_id: 'tenant-A',
          group_id: 'group-1',
          name: 'Entera',
          price_delta: '0.00',
          is_default: false,
          sort_order: 0,
          is_active: true,
          ...over,
        }) as unknown as ModifierOption,
      ),
    }) as unknown as ModifierGroup & { options: ModifierOption[] };

  it('serializes every option of the group, not just the group shell', () => {
    const result = serializeModifierGroup(
      makeGroup([{ id: 'opt-1' }, { id: 'opt-2', price_delta: '5.25' }]),
    );

    expect(result.options).toHaveLength(2);
    expect(typeof result.options[0]!.price_delta).toBe('number');
    expect(result.options[0]!.price_delta).toBe(0);
    expect(result.options[1]!.price_delta).toBe(5.25);
  });

  it('passes group-level integer fields through untouched', () => {
    const group = makeGroup();
    const result = serializeModifierGroup(group);

    expect(result.name).toBe('Leche');
    expect(result.min_selected).toBe(0);
    expect(result.max_selected).toBe(1);
    expect(result.sort_order).toBe(0);
    expect(result.allow_quantities).toBe(false);
    expect(result.is_active).toBe(true);
  });

  it('does not mutate the group or its options', () => {
    const group = makeGroup([{ price_delta: '0.00' }]);
    serializeModifierGroup(group);

    expect(group.options[0]!.price_delta).toBe('0.00');
  });

  it('maps a group list with serializeModifierGroups', () => {
    const result = serializeModifierGroups([
      makeGroup([{ price_delta: '0.00' }]),
      makeGroup([{ price_delta: '2.00' }]),
    ]);

    expect(result).toHaveLength(2);
    expect(typeof result[0]!.options[0]!.price_delta).toBe('number');
    expect(typeof result[1]!.options[0]!.price_delta).toBe('number');
  });
});

describe('serializeEffectiveGroups', () => {
  const makeEffectiveOption = (
    over: Record<string, unknown> = {},
  ): EffectiveModifierOption =>
    ({
      id: 'opt-1',
      name: 'Entera',
      price_delta: '0.00',
      is_default: false,
      sort_order: 0,
      ...over,
    }) as unknown as EffectiveModifierOption;

  const makeEffectiveGroup = (
    options: EffectiveModifierOption[],
  ): EffectiveModifierGroup =>
    ({
      group_id: 'group-1',
      name: 'Leche',
      min_selected: 1,
      max_selected: 3,
      allow_quantities: true,
      source: 'category',
      options,
    }) as unknown as EffectiveModifierGroup;

  it('coerces option price deltas of the effective resolution', () => {
    const result = serializeEffectiveGroups([
      makeEffectiveGroup([
        makeEffectiveOption({ price_delta: '0.00' }),
        makeEffectiveOption({ id: 'opt-2', price_delta: '-1.50' }),
      ]),
    ]);

    expect(result).toHaveLength(1);
    expect(typeof result[0]!.options[0]!.price_delta).toBe('number');
    expect(result[0]!.options[0]!.price_delta).toBe(0);
    expect(result[0]!.options[1]!.price_delta).toBe(-1.5);
  });

  it('keeps the deterministic resolution fields untouched', () => {
    const result = serializeEffectiveGroups([
      makeEffectiveGroup([makeEffectiveOption()]),
    ]);

    expect(result[0]!.group_id).toBe('group-1');
    expect(result[0]!.source).toBe('category');
    expect(result[0]!.min_selected).toBe(1);
    expect(result[0]!.max_selected).toBe(3);
    expect(result[0]!.allow_quantities).toBe(true);
  });

  it('passes an empty resolution through as an empty array', () => {
    expect(serializeEffectiveGroups([])).toEqual([]);
  });
});
