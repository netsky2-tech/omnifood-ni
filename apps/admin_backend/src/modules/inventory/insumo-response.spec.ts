import { Insumo } from './entities/insumo.entity';
import { serializeInsumo } from './insumo-response';

/**
 * Postgres `numeric` columns reach Node as strings: node-postgres parses
 * `numeric` to text and TypeORM's Postgres driver has no decimal hydration
 * case. `Insumo` declares seven decimal columns as `number`, so the raw
 * entity lies over the wire (`/insumos` returns it un-mapped, unlike
 * `Product`). These cases pin the boundary that restores the declared type
 * without mutating the entity. Nullable decimal columns (parLevel, minStock,
 * maxStock) must keep `null` as `null`: a nullable decimal coerced to 0
 * would fabricate a fact the row never carried.
 */
describe('serializeInsumo', () => {
  // The override bag stays untyped on purpose: the whole point of this boundary is
  // that the driver hands back strings where the entity declares numbers.
  const makeInsumo = (over: Record<string, unknown> = {}): Insumo =>
    ({
      id: 'ins-1',
      tenant_id: 'tenant-A',
      warehouse_id: null,
      is_perishable: false,
      name: 'Arroz',
      purchaseUom: 'LB',
      consumptionUom: 'G',
      conversionFactor: '454.0000',
      stock: '12.5000',
      existenciaActual: '12.5000',
      averageCost: '350.25',
      parLevel: '5000.0000',
      minStock: '1000.0000',
      maxStock: null,
      is_active: true,
      negativeStockPolicy: 'RESTRICT',
      created_at: new Date('2026-01-01T00:00:00.000Z'),
      updated_at: new Date('2026-01-01T00:00:00.000Z'),
      ...over,
    }) as unknown as Insumo;

  it('coerces driver strings into JSON numbers', () => {
    const result = serializeInsumo(makeInsumo());

    expect(result.stock).toBe(12.5);
    expect(result.parLevel).toBe(5000);
    expect(result.averageCost).toBe(350.25);
    expect(result.conversionFactor).toBe(454);
    expect(result.existenciaActual).toBe(12.5);
    expect(result.minStock).toBe(1000);
    expect(typeof result.stock).toBe('number');
    expect(typeof result.parLevel).toBe('number');
    expect(typeof result.averageCost).toBe('number');
    expect(typeof result.conversionFactor).toBe('number');
    expect(typeof result.existenciaActual).toBe('number');
    expect(typeof result.minStock).toBe('number');
  });

  it('"0.00" becomes 0 and a genuine numeric 0 stays 0', () => {
    const result = serializeInsumo(
      makeInsumo({
        stock: '0.00',
        averageCost: '0.0000',
        parLevel: 0,
        minStock: '0.0000',
      }),
    );

    expect(result.stock).toBe(0);
    expect(result.averageCost).toBe(0);
    expect(result.parLevel).toBe(0);
    expect(result.minStock).toBe(0);
    expect(typeof result.stock).toBe('number');
    expect(typeof result.parLevel).toBe('number');
  });

  it('preserves decimal precision instead of truncating it', () => {
    const result = serializeInsumo(
      makeInsumo({ stock: '1234.5000', averageCost: '60.05' }),
    );

    expect(result.stock).toBe(1234.5);
    expect(result.averageCost).toBe(60.05);
    // The value must survive the numeric methods consumers call on it
    // (the panel formats averageCost with Intl and feeds it to inputs).
    expect(result.averageCost.toFixed(2)).toBe('60.05');
    expect(result.stock.toFixed(2)).toBe('1234.50');
  });

  it('leaves already-numeric values untouched', () => {
    const result = serializeInsumo(
      makeInsumo({
        conversionFactor: 454,
        stock: 3,
        averageCost: 12.5,
        parLevel: 20,
      }),
    );

    expect(result.conversionFactor).toBe(454);
    expect(result.stock).toBe(3);
    expect(result.averageCost).toBe(12.5);
    expect(result.parLevel).toBe(20);
  });

  it('keeps null as null on nullable decimal columns instead of fabricating 0', () => {
    const result = serializeInsumo(
      makeInsumo({ parLevel: null, minStock: null, maxStock: null }),
    );

    expect(result.parLevel).toBeNull();
    expect(result.minStock).toBeNull();
    expect(result.maxStock).toBeNull();
  });

  it('keeps every non-numeric field byte-identical', () => {
    const insumo = makeInsumo({ name: 'Horchata 500ml', purchaseUom: 'ml' });
    const result = serializeInsumo(insumo);

    expect(result.id).toBe(insumo.id);
    expect(result.tenant_id).toBe(insumo.tenant_id);
    expect(result.name).toBe('Horchata 500ml');
    expect(result.purchaseUom).toBe('ml');
    expect(result.consumptionUom).toBe('G');
    expect(result.is_perishable).toBe(false);
    expect(result.is_active).toBe(true);
    expect(result.negativeStockPolicy).toBe('RESTRICT');
    expect(result.warehouse_id).toBeNull();
    expect(result.created_at).toBe(insumo.created_at);
    expect(result.updated_at).toBe(insumo.updated_at);
  });

  it('does not mutate the entity it serializes', () => {
    const insumo = makeInsumo();
    serializeInsumo(insumo);

    expect(insumo.stock).toBe('12.5000');
    expect(insumo.parLevel).toBe('5000.0000');
    expect(insumo.averageCost).toBe('350.25');
  });

  it('fails closed to 0 for non-finite values on non-nullable columns', () => {
    const result = serializeInsumo(
      makeInsumo({
        stock: 'not-a-number',
        averageCost: NaN,
        conversionFactor: Infinity,
      }),
    );

    expect(result.stock).toBe(0);
    expect(result.averageCost).toBe(0);
    expect(result.conversionFactor).toBe(0);
  });
});
