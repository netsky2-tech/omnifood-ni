import { Product } from './product.entity';

describe('Product Entity', () => {
  it('should be defined', () => {
    const product = new Product();
    expect(product).toBeDefined();
  });

  it('should have correct properties', () => {
    const product = new Product();
    product.name = 'Agua Embotellada 500ml';
    product.uom = 'unidad';
    product.stock = 50;
    product.averageCost = 0.25;
    product.sellPrice = 1.0;

    expect(product.name).toBe('Agua Embotellada 500ml');
    expect(product.uom).toBe('unidad');
    expect(product.stock).toBe(50);
    expect(product.averageCost).toBe(0.25);
    expect(product.sellPrice).toBe(1.0);
  });
});
