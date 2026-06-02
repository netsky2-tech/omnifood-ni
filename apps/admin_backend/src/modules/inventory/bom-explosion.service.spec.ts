import { BomExplosionService } from './bom-explosion.service';

describe('BomExplosionService', () => {
  const service = new BomExplosionService();

  it('explodes snapshot components deterministically at 4 decimals', () => {
    const totals = service.explode({
      orderQuantity: 2,
      snapshotComponents: [
        { insumo_id: 'ins-2', quantity: 0.3333 },
        { insumo_id: 'ins-1', quantity: 0.1 },
      ] as never,
    });

    expect([...totals.keys()]).toEqual(['ins-1', 'ins-2']);
    expect(totals.get('ins-1')).toBe(0.2);
    expect(totals.get('ins-2')).toBe(0.6666);
  });

  it('aggregates repeated insumo lines with stable rounding', () => {
    const totals = service.explode({
      orderQuantity: 3,
      snapshotComponents: [
        { insumo_id: 'ins-1', quantity: 0.1111 },
        { insumo_id: 'ins-1', quantity: 0.2222 },
      ] as never,
    });

    expect(totals.get('ins-1')).toBe(0.9999);
  });
});
