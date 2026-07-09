import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { SyncBatchEnvelopeDto } from './sync-batch.dto';

describe('SyncBatchEnvelopeDto', () => {
  const validRecord = {
    idempotencyKey: 'sync-1',
    sourceDeviceId: 'terminal-1',
    sourceSequence: 1,
    flowType: 'inventory',
    documentType: 'PURCHASE',
    movements: [{ insumoId: 'ins-1', quantity: 2, unitCostNio: 4.25 }],
  };

  it('accepts deterministic flow type, source sequence, and delta-only movement payloads', () => {
    const dto = plainToInstance(SyncBatchEnvelopeDto, {
      records: [validRecord],
    });

    const errors = validateSync(dto, {
      whitelist: true,
      forbidUnknownValues: false,
    });

    expect(errors).toHaveLength(0);
    expect(dto.records[0]).toMatchObject({
      flowType: 'inventory',
      sourceSequence: 1,
      movements: [{ insumoId: 'ins-1', quantity: 2, unitCostNio: 4.25 }],
    });
  });

  it('rejects absolute stock fields at the DTO boundary', () => {
    const dto = plainToInstance(SyncBatchEnvelopeDto, {
      records: [
        {
          ...validRecord,
          movements: [
            {
              insumoId: 'ins-1',
              quantity: 2,
              unitCostNio: 4.25,
              newStock: 99,
            },
          ],
        },
      ],
    });

    const errors = validateSync(dto, {
      whitelist: true,
      forbidUnknownValues: false,
    });

    expect(JSON.stringify(errors)).toContain('absolute stock');
  });

  it('accepts invoice-only SALE records without requiring movement deltas', () => {
    const dto = plainToInstance(SyncBatchEnvelopeDto, {
      records: [
        {
          idempotencyKey: 'sale-invoice-only-1',
          sourceDeviceId: 'terminal-1',
          sourceSequence: 2,
          flowType: 'sales',
          documentType: 'SALE',
          invoice: {
            id: 'inv-1',
            number: '001',
            createdAt: new Date().toISOString(),
            userId: 'user-1',
            subtotal: 100,
            totalTax: 15,
            total: 115,
            paymentStatus: 'PAID',
            items: [],
            payments: [],
          },
        },
      ],
    });

    const errors = validateSync(dto, {
      whitelist: true,
      forbidUnknownValues: false,
    });

    expect(errors).toHaveLength(0);
    expect(dto.records[0].documentType).toBe('SALE');
    expect(dto.records[0].invoice?.id).toBe('inv-1');
    expect(dto.records[0].movements).toBeUndefined();
  });
});
