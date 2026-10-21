import type { EntityManager } from 'typeorm';
import { Batch } from './entities/batch.entity';
import { BatchOutflowTrace } from './entities/batch-outflow-trace.entity';
import {
  drawBatchOutflow,
  drawBatchOutflowPartial,
} from './batch-allocation';

/**
 * FD-01 (openspec/changes/fiscal-no-se-congela-por-inventario): the PARTIAL
 * draw.
 *
 * The strict draw REJECTED an outflow the batches could not cover, and in the
 * sale path that rejection blocked the fiscal stream: every later sale stopped
 * landing in the cloud and the terminal's fiscal sequence froze. The partial
 * draw applies what the lots back and REPORTS the rest, so the sale can be
 * applied and the difference declared.
 *
 * The strict draw keeps its behaviour for the paths that are not fiscal
 * (shrinkage, count variance): a physical shortage there is not something to
 * paper over.
 */
describe('batch-allocation partial draw (FD-01)', () => {
  const makeManager = (
    batches: Array<Partial<Batch>>,
    traces: Array<Partial<BatchOutflowTrace>> = [],
  ) => {
    const batchSave = jest.fn(async (batch: Batch) => batch);
    const traceSave = jest.fn(async (trace: BatchOutflowTrace) => trace);
    const manager = {
      getRepository: jest.fn((target: unknown) => {
        if (target === Batch) {
          return {
            find: jest.fn().mockResolvedValue(batches),
            findOne: jest.fn((options: { where?: { id?: string } }) =>
              Promise.resolve(
                batches.find((batch) => batch.id === options?.where?.id),
              ),
            ),
            save: batchSave,
          };
        }
        if (target === BatchOutflowTrace) {
          return {
            find: jest.fn().mockResolvedValue(traces),
            save: traceSave,
            create: jest.fn((value: unknown) => value),
          };
        }
        return undefined;
      }),
    } as unknown as EntityManager;

    return { manager, batchSave, traceSave };
  };

  const batchesWith = (remaining: number) =>
    [
      {
        id: 'b-soon',
        tenant_id: 't1',
        insumo_id: 'ins-1',
        batch_number: 'SOON',
        expiration_date: '2026-11-01',
        remaining_stock: remaining,
        cost: 200,
      },
    ] as Array<Partial<Batch>>;

  it('applies what the lots back and reports the rest', async () => {
    const batches = batchesWith(50);
    const { manager, batchSave, traceSave } = makeManager(batches);

    const plan = await drawBatchOutflowPartial({
      manager,
      tenantId: 't1',
      insumoId: 'ins-1',
      quantity: 150,
      operationDay: '2026-10-15',
      movementId: 'mov-1',
    });

    expect(plan.hasLots).toBe(true);
    expect(plan.covered).toBe(50);
    expect(plan.uncovered).toBe(100);

    // The lot that backed part of the outflow is consumed...
    expect(batches[0].remaining_stock).toBe(0);
    expect(batchSave).toHaveBeenCalledTimes(1);
    // ...and its trace is recorded, so a cancellation can restore it (R3).
    expect(traceSave).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: 't1',
        movement_id: 'mov-1',
        batch_id: 'b-soon',
        quantity: 50,
      }),
    );
  });

  it('does not throw when the lots cannot cover the outflow', async () => {
    const { manager } = makeManager(batchesWith(10));

    await expect(
      drawBatchOutflowPartial({
        manager,
        tenantId: 't1',
        insumoId: 'ins-1',
        quantity: 100,
        operationDay: '2026-10-15',
      }),
    ).resolves.toEqual(
      expect.objectContaining({ covered: 10, uncovered: 90 }),
    );
  });

  it('reports no lots for an insumo without lots (the aggregate is the truth)', async () => {
    const { manager, traceSave } = makeManager([]);

    const plan = await drawBatchOutflowPartial({
      manager,
      tenantId: 't1',
      insumoId: 'ins-1',
      quantity: 100,
      operationDay: '2026-10-15',
      movementId: 'mov-1',
    });

    expect(plan.hasLots).toBe(false);
    expect(plan.covered).toBe(0);
    expect(plan.uncovered).toBe(0);
    expect(traceSave).not.toHaveBeenCalled();
  });

  it('keeps the strict draw rejecting what the lots cannot back', async () => {
    const { manager } = makeManager(batchesWith(10));

    await expect(
      drawBatchOutflow({
        manager,
        tenantId: 't1',
        insumoId: 'ins-1',
        quantity: 100,
        operationDay: '2026-10-15',
      }),
    ).rejects.toThrow(/Batch balances cannot cover the outflow/);
  });
});
