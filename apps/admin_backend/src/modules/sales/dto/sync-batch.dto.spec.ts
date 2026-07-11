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
  const validate = (records: unknown[]) => {
    const dto = plainToInstance(SyncBatchEnvelopeDto, { records });
    const errors = validateSync(dto, {
      whitelist: true,
      forbidUnknownValues: false,
    });
    return { dto, errors };
  };
  const creditNoteItem = {
    id: 'credit-item-1',
    productId: 'product-1',
    productName: 'Burger',
    quantity: -1,
    unitPrice: 50,
    originalTaxRate: 0.15,
    appliedTaxRate: 0.15,
    taxAmount: -7.5,
    total: -57.5,
    discount: 0,
  };
  const creditNoteRecord = {
    idempotencyKey: 'credit-note-1',
    sourceDeviceId: 'terminal-1',
    sourceSequence: 3,
    flowType: 'sales',
    documentType: 'CREDIT_NOTE',
    invoice: {
      id: 'credit-inv-1',
      number: 'NC-001',
      createdAt: new Date().toISOString(),
      userId: 'user-1',
      subtotal: -50,
      totalTax: -7.5,
      total: -57.5,
      paymentStatus: 'REFUNDED',
      type: 'creditNote',
      items: [creditNoteItem],
      payments: [],
    },
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

  it('accepts CREDIT_NOTE records with explicit origin and reason policy', () => {
    const { dto, errors } = validate([
      {
        ...creditNoteRecord,
        invoice: {
          ...creditNoteRecord.invoice,
          originInvoiceId: 'sale-inv-1',
          refundReasonCode: 'DAMAGED_RETURN',
          refundReasonPolicy: 'WASTE_NO_RESTOCK',
          items: [{ ...creditNoteItem, originInvoiceItemId: 'sale-item-1' }],
        },
      },
    ]);

    expect(errors).toHaveLength(0);
    expect(dto.records[0].documentType).toBe('CREDIT_NOTE');
    expect(dto.records[0].invoice?.originInvoiceId).toBe('sale-inv-1');
    expect(dto.records[0].invoice?.refundReasonPolicy).toBe(
      'WASTE_NO_RESTOCK',
    );
    expect(dto.records[0].invoice?.items[0].originInvoiceItemId).toBe(
      'sale-item-1',
    );
  });

  it('rejects CREDIT_NOTE records without origin and reason policy metadata', () => {
    const { errors } = validate([
      { ...creditNoteRecord, idempotencyKey: 'credit-note-missing-origin' },
    ]);

    const serializedErrors = JSON.stringify(errors);
    expect(serializedErrors).toContain('originInvoiceId');
    expect(serializedErrors).toContain('originInvoiceItemId');
    expect(serializedErrors).toContain('refundReasonPolicy');
  });

  it('rejects CREDIT_NOTE records with no refunded items', () => {
    const { errors } = validate([
      {
        ...creditNoteRecord,
        idempotencyKey: 'credit-note-empty-items',
        invoice: {
          ...creditNoteRecord.invoice,
          originInvoiceId: 'sale-inv-1',
          refundReasonPolicy: 'FINANCIAL_ONLY',
          items: [],
        },
      },
    ]);

    expect(JSON.stringify(errors)).toContain('at least one item');
  });

  it('rejects creditNote invoices even when the envelope documentType is SALE', () => {
    const { errors } = validate([
      {
        ...creditNoteRecord,
        idempotencyKey: 'sale-envelope-credit-note-invoice',
        documentType: 'SALE',
        invoice: {
          ...creditNoteRecord.invoice,
          originInvoiceId: 'sale-inv-1',
          refundReasonPolicy: 'FINANCIAL_ONLY',
          items: [{ ...creditNoteItem, originInvoiceItemId: 'sale-item-1' }],
        },
      },
    ]);

    expect(JSON.stringify(errors)).toContain(
      'creditNote invoice type is only valid with CREDIT_NOTE documentType',
    );
  });

  it('rejects CREDIT_NOTE envelopes unless the invoice type is creditNote', () => {
    const { errors } = validate([
      {
        ...creditNoteRecord,
        idempotencyKey: 'credit-note-envelope-regular-invoice',
        invoice: {
          ...creditNoteRecord.invoice,
          type: 'regular',
          originInvoiceId: 'sale-inv-1',
          refundReasonPolicy: 'FINANCIAL_ONLY',
          items: [{ ...creditNoteItem, originInvoiceItemId: 'sale-item-1' }],
        },
      },
    ]);

    expect(JSON.stringify(errors)).toContain(
      'CREDIT_NOTE documentType requires invoice.type=creditNote',
    );
  });

  it('rejects CREDIT_NOTE movement deltas because stock/Kardex replay is not implemented in this slice', () => {
    const { errors } = validate([
      {
        ...creditNoteRecord,
        idempotencyKey: 'credit-note-stock-delta',
        invoice: {
          ...creditNoteRecord.invoice,
          originInvoiceId: 'sale-inv-1',
          refundReasonPolicy: 'FINANCIAL_ONLY',
          items: [{ ...creditNoteItem, originInvoiceItemId: 'sale-item-1' }],
        },
        movements: [
          {
            insumoId: 'ins-1',
            quantity: 1,
            originMovementId: 'sale-movement-1',
            originInvoiceItemId: 'sale-item-1',
            refundReasonPolicy: 'RESTOCK_ORIGINAL_BOM',
          },
        ],
      },
    ]);

    expect(JSON.stringify(errors)).toContain(
      'CREDIT_NOTE inventory movement deltas are not supported',
    );
  });
});
