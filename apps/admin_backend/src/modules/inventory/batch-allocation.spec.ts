import type { EntityManager } from 'typeorm';
import { Batch } from './entities/batch.entity';
import { BatchOutflowTrace } from './entities/batch-outflow-trace.entity';
import { drawBatchOutflow, restoreBatchInflow } from './batch-allocation';

/**
 * R3 (odd/tasks/nucleo-inventario-remediacion-pre-integracion.md, S6): the
 * outflow must record WHICH batch left, and a cancellation must return that
 * quantity to the SAME batch — an inflow has no lot to invent, so the trace is
 * the only faithful reversal.
 */
describe('batch-allocation outflow trace (R3)', () => {
  const makeManager = (
    batches: Array<Partial<Batch>>,
    traces: Array<Partial<BatchOutflowTrace>> = [],
  ) => {
    const batchSave = jest.fn(async (batch: Batch) => batch);
    const traceSave = jest.fn(async (trace: BatchOutflowTrace) => trace);
    const traceFind = jest.fn().mockResolvedValue(traces);
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
            find: traceFind,
            save: traceSave,
            create: jest.fn((value: unknown) => value),
          };
        }
        return undefined;
      }),
    } as unknown as EntityManager;

    return { manager, batchSave, traceSave, traceFind };
  };

  it('draws by FEFO and records the trace against the movement', async () => {
    const batches = [
      {
        id: 'b-late',
        tenant_id: 't1',
        insumo_id: 'ins-1',
        batch_number: 'LATE',
        expiration_date: '2026-12-31',
        remaining_stock: 10,
        cost: 100,
      },
      {
        id: 'b-soon',
        tenant_id: 't1',
        insumo_id: 'ins-1',
        batch_number: 'SOON',
        expiration_date: '2026-11-01',
        remaining_stock: 10,
        cost: 200,
      },
    ] as Array<Partial<Batch>>;
    const { manager, batchSave, traceSave } = makeManager(batches);

    await drawBatchOutflow({
      manager,
      tenantId: 't1',
      insumoId: 'ins-1',
      quantity: 15,
      operationDay: '2026-10-15',
      movementId: 'mov-1',
    });

    // FEFO: the soonest-expiring batch leaves first.
    expect(
      batches.find((batch) => batch.id === 'b-soon')?.remaining_stock,
    ).toBe(0);
    expect(
      batches.find((batch) => batch.id === 'b-late')?.remaining_stock,
    ).toBe(5);
    expect(traceSave).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: 't1',
        movement_id: 'mov-1',
        batch_id: 'b-soon',
        quantity: 10,
      }),
    );
    expect(traceSave).toHaveBeenCalledWith(
      expect.objectContaining({
        movement_id: 'mov-1',
        batch_id: 'b-late',
        quantity: 5,
      }),
    );
    expect(batchSave).toHaveBeenCalledTimes(2);
  });

  it('writes no trace when the caller does not provide a movement id', async () => {
    const batches = [
      {
        id: 'b-soon',
        tenant_id: 't1',
        insumo_id: 'ins-1',
        batch_number: 'SOON',
        expiration_date: '2026-11-01',
        remaining_stock: 10,
        cost: 200,
      },
    ] as Array<Partial<Batch>>;
    const { manager, traceSave } = makeManager(batches);

    await drawBatchOutflow({
      manager,
      tenantId: 't1',
      insumoId: 'ins-1',
      quantity: 2,
      operationDay: '2026-10-15',
    });

    expect(traceSave).not.toHaveBeenCalled();
  });

  it('restores the traced quantities to the SAME batches', async () => {
    const batches = [
      {
        id: 'b-soon',
        tenant_id: 't1',
        insumo_id: 'ins-1',
        batch_number: 'SOON',
        expiration_date: '2026-11-01',
        remaining_stock: 0,
        cost: 200,
      },
      {
        id: 'b-late',
        tenant_id: 't1',
        insumo_id: 'ins-1',
        batch_number: 'LATE',
        expiration_date: '2026-12-31',
        remaining_stock: 5,
        cost: 100,
      },
    ] as Array<Partial<Batch>>;
    const traces = [
      {
        id: 'tr-1',
        tenant_id: 't1',
        movement_id: 'mov-1',
        batch_id: 'b-soon',
        quantity: 10,
      },
      {
        id: 'tr-2',
        tenant_id: 't1',
        movement_id: 'mov-1',
        batch_id: 'b-late',
        quantity: 5,
      },
    ] as Array<Partial<BatchOutflowTrace>>;
    const { manager, batchSave, traceFind } = makeManager(batches, traces);

    await restoreBatchInflow({ manager, tenantId: 't1', movementId: 'mov-1' });

    expect(traceFind).toHaveBeenCalledWith({
      where: { tenant_id: 't1', movement_id: 'mov-1' },
    });
    expect(
      batches.find((batch) => batch.id === 'b-soon')?.remaining_stock,
    ).toBe(10);
    expect(
      batches.find((batch) => batch.id === 'b-late')?.remaining_stock,
    ).toBe(10);
    expect(batchSave).toHaveBeenCalledTimes(2);
  });

  it('restores nothing when the movement has no trace', async () => {
    const { manager, batchSave } = makeManager([], []);

    await restoreBatchInflow({
      manager,
      tenantId: 't1',
      movementId: 'mov-none',
    });

    expect(batchSave).not.toHaveBeenCalled();
  });
});
