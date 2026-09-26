import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { SyncInvoiceDto } from './sync-invoice.dto';

describe('SyncInvoiceDto fiscal projection fields (#551 U3)', () => {
  const basePayload = {
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
  };

  const validate = (payload: Record<string, unknown>) => {
    const dto = plainToInstance(SyncInvoiceDto, payload);
    const errors = validateSync(dto, {
      whitelist: true,
      forbidUnknownValues: false,
    });
    return { dto, errors };
  };

  it('accepts shiftId and localIssueDate and keeps them after whitelist stripping', () => {
    const { dto, errors } = validate({
      ...basePayload,
      shiftId: '0d2f9c1e-1234-4abc-9def-555555555555',
      localIssueDate: '2026-09-25',
    });

    expect(errors).toEqual([]);
    expect(dto.shiftId).toBe('0d2f9c1e-1234-4abc-9def-555555555555');
    expect(dto.localIssueDate).toBe('2026-09-25');
  });

  it('accepts explicit nulls: the POS emits null for legacy invoices (D-9, no backfill)', () => {
    const { dto, errors } = validate({
      ...basePayload,
      shiftId: null,
      localIssueDate: null,
    });

    expect(errors).toEqual([]);
    expect(dto.shiftId).toBeNull();
    expect(dto.localIssueDate).toBeNull();
  });

  it('rejects a non-ISO localIssueDate', () => {
    const { errors } = validate({
      ...basePayload,
      localIssueDate: '25/09/2026',
    });

    expect(errors.map((error) => error.property)).toContain('localIssueDate');
  });

  it('leaves both fields optional so legacy payloads still validate', () => {
    const { errors } = validate(basePayload);

    expect(errors).toEqual([]);
  });
});
