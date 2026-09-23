import { Product, ProductType } from './entities/product.entity';
import { serializeProduct } from './product-response';

/**
 * Postgres `numeric` columns reach Node as strings: node-postgres parses
 * `numeric` to text and TypeORM's Postgres driver has no decimal hydration case.
 * `Product` declares `stock`, `averageCost`, `sellPrice` and `tax_rate` as
 * `number`, so the raw entity lies over the wire. These cases pin the boundary
 * that restores the declared type without mutating the entity.
 */
describe('serializeProduct', () => {
  // The override bag stays untyped on purpose: the whole point of this boundary is
  // that the driver hands back strings where the entity declares numbers.
  const makeProduct = (over: Record<string, unknown> = {}): Product =>
    ({
      id: 'p1',
      tenant_id: 'tenant-A',
      name: 'Tacos al Pastor',
      uom: 'UN',
      product_type: ProductType.SIMPLE,
      category_code: null,
      warehouse_id: null,
      is_perishable: false,
      stock: '0.0000',
      averageCost: '0.00',
      sellPrice: '50.00',
      tax_rate: '0.1500',
      is_active: true,
      created_at: new Date('2026-01-01T00:00:00.000Z'),
      updated_at: new Date('2026-01-01T00:00:00.000Z'),
      ...over,
    }) as unknown as Product;

  it('coerces driver strings into JSON numbers', () => {
    const result = serializeProduct(makeProduct());

    expect(result.sellPrice).toBe(50);
    expect(result.stock).toBe(0);
    expect(result.averageCost).toBe(0);
    expect(result.tax_rate).toBe(0.15);
    expect(typeof result.sellPrice).toBe('number');
    expect(typeof result.stock).toBe('number');
    expect(typeof result.averageCost).toBe('number');
    expect(typeof result.tax_rate).toBe('number');
  });

  it('preserves decimal precision instead of truncating it', () => {
    const result = serializeProduct(
      makeProduct({
        sellPrice: '1234.56',
        stock: '7.2500',
        averageCost: '60.05',
      }),
    );

    expect(result.sellPrice).toBe(1234.56);
    expect(result.stock).toBe(7.25);
    expect(result.averageCost).toBe(60.05);
    // The value must survive the numeric methods consumers call on it.
    expect(result.sellPrice.toFixed(2)).toBe('1234.56');
    expect(result.stock.toFixed(2)).toBe('7.25');
  });

  it('leaves already-numeric values untouched', () => {
    const result = serializeProduct(
      makeProduct({ sellPrice: 45, stock: 3, averageCost: 12.5 }),
    );

    expect(result.sellPrice).toBe(45);
    expect(result.stock).toBe(3);
    expect(result.averageCost).toBe(12.5);
  });

  it('keeps every non-numeric field byte-identical', () => {
    const product = makeProduct({ name: 'Horchata 500ml', uom: 'ml' });
    const result = serializeProduct(product);

    expect(result.id).toBe(product.id);
    expect(result.tenant_id).toBe(product.tenant_id);
    expect(result.name).toBe('Horchata 500ml');
    expect(result.uom).toBe('ml');
    expect(result.product_type).toBe(ProductType.SIMPLE);
    expect(result.category_code).toBeNull();
    expect(result.is_perishable).toBe(false);
    expect(result.is_active).toBe(true);
    expect(result.created_at).toBe(product.created_at);
  });

  it('does not mutate the entity it serializes', () => {
    const product = makeProduct();
    serializeProduct(product);

    expect(product.sellPrice).toBe('50.00');
    expect(product.stock).toBe('0.0000');
    expect(product.averageCost).toBe('0.00');
  });

  it('fails closed to 0 for values that are not finite numbers', () => {
    const result = serializeProduct(
      makeProduct({
        sellPrice: 'not-a-number',
        stock: NaN,
        averageCost: Infinity,
      }),
    );

    expect(result.sellPrice).toBe(0);
    expect(result.stock).toBe(0);
    expect(result.averageCost).toBe(0);
  });

  it('treats absent values as 0 rather than undefined', () => {
    const result = serializeProduct(
      makeProduct({
        sellPrice: undefined,
        stock: null,
      }),
    );

    expect(result.sellPrice).toBe(0);
    expect(result.stock).toBe(0);
    expect(result.sellPrice.toFixed(2)).toBe('0.00');
  });
});
