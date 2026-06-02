import { BatchCostingService } from './batch-costing.service';

describe('BatchCostingService', () => {
  const service = new BatchCostingService();

  it('prioritizes non-expired batches and keeps valuation traceability at 4 decimals', () => {
    const trace = service.buildValuationTrace({
      requiredQuantity: 4,
      operationDate: new Date('2026-03-01T00:00:00.000Z'),
      candidates: [
        {
          batchId: 'batch-expired',
          insumoId: 'ins-1',
          remainingStock: 10,
          unitCostNio: 1.1111,
          expirationDate: new Date('2026-02-01T00:00:00.000Z'),
        },
        {
          batchId: 'batch-fresh',
          insumoId: 'ins-1',
          remainingStock: 2,
          unitCostNio: 2,
          expirationDate: new Date('2026-04-01T00:00:00.000Z'),
        },
      ],
    });

    expect(trace[0]).toEqual(
      expect.objectContaining({
        batchId: 'batch-fresh',
        consumedQuantity: 2,
        isSoftExpired: false,
        totalCostNio: 4,
      }),
    );
    expect(trace[1]).toEqual(
      expect.objectContaining({
        batchId: 'batch-expired',
        consumedQuantity: 2,
        isSoftExpired: true,
        totalCostNio: 2.2222,
      }),
    );
  });

  it('does not enforce strict fifo by date, only soft expiry preference', () => {
    const trace = service.buildValuationTrace({
      requiredQuantity: 1,
      operationDate: new Date('2026-03-01T00:00:00.000Z'),
      candidates: [
        {
          batchId: 'B',
          insumoId: 'ins-1',
          remainingStock: 1,
          unitCostNio: 2,
          expirationDate: new Date('2026-03-10T00:00:00.000Z'),
        },
        {
          batchId: 'A',
          insumoId: 'ins-1',
          remainingStock: 1,
          unitCostNio: 3,
          expirationDate: new Date('2026-03-10T00:00:00.000Z'),
        },
      ],
    });

    expect(trace[0].batchId).toBe('A');
  });
});
