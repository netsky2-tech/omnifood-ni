import { Product } from './entities/product.entity';

/**
 * Postgres `numeric` columns reach Node as strings: node-postgres parses
 * `numeric` to text and TypeORM's Postgres driver has no decimal hydration
 * case, while `Product` declares `stock`, `averageCost`, `sellPrice` and
 * `tax_rate` as `number`. The coercion lives here, at the response boundary
 * only, so internal readers (services, listeners) and the `change_log` `from`
 * values keep seeing exactly what the driver returned. Entities are never
 * mutated; every other field is passed through untouched.
 */
export type ProductResponse = Omit<
  Product,
  'stock' | 'averageCost' | 'sellPrice' | 'tax_rate'
> & {
  stock: number;
  averageCost: number;
  sellPrice: number;
  tax_rate: number;
};

function toFiniteNumber(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function serializeProduct(product: Product): ProductResponse {
  return {
    ...product,
    stock: toFiniteNumber(product.stock),
    averageCost: toFiniteNumber(product.averageCost),
    sellPrice: toFiniteNumber(product.sellPrice),
    tax_rate: toFiniteNumber(product.tax_rate),
  };
}

export function serializeProducts(products: Product[]): ProductResponse[] {
  return products.map(serializeProduct);
}
