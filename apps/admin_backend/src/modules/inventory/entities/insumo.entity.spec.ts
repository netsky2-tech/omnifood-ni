import { Insumo } from './insumo.entity';

describe('Insumo Entity', () => {
  it('should be defined', () => {
    const insumo = new Insumo();
    expect(insumo).toBeDefined();
  });

  it('should have correct properties', () => {
    const insumo = new Insumo();
    insumo.name = 'Granos de Café';
    insumo.purchaseUom = 'Saco 50lb';
    insumo.consumptionUom = 'gramos';
    insumo.conversionFactor = 22680;
    insumo.stock = 1000;
    insumo.averageCost = 0.5;
    insumo.parLevel = 200;

    expect(insumo.name).toBe('Granos de Café');
    expect(insumo.purchaseUom).toBe('Saco 50lb');
    expect(insumo.consumptionUom).toBe('gramos');
    expect(insumo.conversionFactor).toBe(22680);
    expect(insumo.stock).toBe(1000);
    expect(insumo.averageCost).toBe(0.5);
    expect(insumo.parLevel).toBe(200);
  });
});
