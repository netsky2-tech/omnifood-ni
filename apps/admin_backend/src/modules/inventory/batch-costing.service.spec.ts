import { BatchCostingService } from './batch-costing.service';

/**
 * `expirationDate` and `operationDate` are ISO calendar days (`YYYY-MM-DD`)
 * because they mirror PostgreSQL `date` columns — see
 * src/core/database/calendar-day.ts. These fixtures used to build `Date`
 * instances, which is precisely the typing that crashed the live production
 * close (`expirationDate.getTime is not a function`) and shifted days by one.
 */
describe('BatchCostingService', () => {
  const service = new BatchCostingService();

  it('prioritizes non-expired batches over soft-expired ones and keeps valuation traceability at 4 decimals', () => {
    const trace = service.buildValuationTrace({
      requiredQuantity: 4,
      operationDate: '2026-03-01',
      candidates: [
        {
          batchId: 'batch-expired',
          insumoId: 'ins-1',
          remainingStock: 10,
          unitCostNio: 1.1111,
          expirationDate: '2026-02-01',
        },
        {
          batchId: 'batch-fresh',
          insumoId: 'ins-1',
          remainingStock: 2,
          unitCostNio: 2,
          expirationDate: '2026-04-01',
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

  it('consumes strictly FEFO, so the soonest expiry leaves the shelf first', () => {
    // This is the rule the POS already applied (`batch_dao.dart` orders by
    // `expiration_date ASC`) and that the cloud did NOT: it sorted by
    // `batchId.localeCompare`, an order arbitrary with respect to time.
    // Measured against a migration-built schema, the old order consumed the
    // later-expiring expensive batch instead of the earlier-expiring cheap one
    // and DOUBLED the produced unit cost (200 vs 100 NIO).
    //
    // The ids are chosen INVERTED on purpose: `a-…` sorts first
    // lexicographically AND expires last. If both rules agreed here, this test
    // would pass for the wrong reason and prove nothing.
    const trace = service.buildValuationTrace({
      requiredQuantity: 1,
      operationDate: '2026-03-01',
      candidates: [
        {
          batchId: 'a-sorts-first-expires-last',
          insumoId: 'ins-1',
          remainingStock: 1,
          unitCostNio: 200,
          expirationDate: '2026-05-01',
        },
        {
          batchId: 'z-sorts-last-expires-first',
          insumoId: 'ins-1',
          remainingStock: 1,
          unitCostNio: 100,
          expirationDate: '2026-04-01',
        },
      ],
    });

    expect(trace).toHaveLength(1);
    expect(trace[0].batchId).toBe('z-sorts-last-expires-first');
    expect(trace[0].unitCostNio).toBe(100);
  });

  it('falls back to a deterministic batchId tiebreaker when expiries are equal', () => {
    // FEFO cannot order two batches that expire on the same day, so the
    // tiebreaker has to be explicit and stable. This test used to be named
    // "does not enforce strict fifo by date, only soft expiry preference"; the
    // behaviour it pins (equal expiry -> id order) is unchanged, but the NAME
    // was describing the old implementation and would now mislead a reader into
    // thinking FEFO is not enforced.
    const trace = service.buildValuationTrace({
      requiredQuantity: 1,
      operationDate: '2026-03-01',
      candidates: [
        {
          batchId: 'B',
          insumoId: 'ins-1',
          remainingStock: 1,
          unitCostNio: 2,
          expirationDate: '2026-03-10',
        },
        {
          batchId: 'A',
          insumoId: 'ins-1',
          remainingStock: 1,
          unitCostNio: 3,
          expirationDate: '2026-03-10',
        },
      ],
    });

    expect(trace[0].batchId).toBe('A');
  });

  it('places a batch with no recorded expiry last, never first', () => {
    // A missing expiry means unknown exposure. Sorting it as an empty string
    // would put it at the FRONT, which is the opposite of prudent.
    const trace = service.buildValuationTrace({
      requiredQuantity: 1,
      operationDate: '2026-03-01',
      candidates: [
        {
          batchId: 'no-expiry',
          insumoId: 'ins-1',
          remainingStock: 1,
          unitCostNio: 500,
        },
        {
          batchId: 'has-expiry',
          insumoId: 'ins-1',
          remainingStock: 1,
          unitCostNio: 100,
          expirationDate: '2026-06-01',
        },
      ],
    });

    expect(trace).toHaveLength(1);
    expect(trace[0].batchId).toBe('has-expiry');
  });
});
