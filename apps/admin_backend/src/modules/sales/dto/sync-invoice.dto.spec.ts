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

describe('SyncInvoiceDto tip fields (Batch 7 Slice 1, PRD §21 / AD-10)', () => {
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

  it('accepts all four tip fields and keeps them after whitelist stripping', () => {
    const { dto, errors } = validate({
      ...basePayload,
      tipAmountNio: 50,
      tipAmountUsd: 1.37,
      tipPercentage: 10,
      tipEligibleBaseNio: 500,
    });

    expect(errors).toEqual([]);
    expect(dto.tipAmountNio).toBe(50);
    expect(dto.tipAmountUsd).toBe(1.37);
    expect(dto.tipPercentage).toBe(10);
    expect(dto.tipEligibleBaseNio).toBe(500);
  });

  it('accepts explicit nulls: the POS emits null for legacy invoices (AD-10, no backfill)', () => {
    const { dto, errors } = validate({
      ...basePayload,
      tipAmountNio: null,
      tipAmountUsd: null,
      tipPercentage: null,
      tipEligibleBaseNio: null,
    });

    expect(errors).toEqual([]);
    expect(dto.tipAmountNio).toBeNull();
    expect(dto.tipAmountUsd).toBeNull();
    expect(dto.tipPercentage).toBeNull();
    expect(dto.tipEligibleBaseNio).toBeNull();
  });

  it('rejects a non-numeric tipAmountNio', () => {
    const { errors } = validate({
      ...basePayload,
      tipAmountNio: '50 cordobas',
    });

    expect(errors.map((error) => error.property)).toContain('tipAmountNio');
  });

  it('leaves all tip fields optional so legacy payloads still validate', () => {
    const { errors } = validate(basePayload);

    expect(errors).toEqual([]);
  });
});

describe('SyncInvoiceDto fx-rate fiscal fields (D-6)', () => {
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

  it('accepts the three fx fields with real checkout values and keeps them after whitelist stripping', () => {
    const { dto, errors } = validate({
      ...basePayload,
      bcnOfficialRate: 36.6243,
      commercialRate: 36.6243,
      totalUsd: 3.14,
    });

    expect(errors).toEqual([]);
    expect(dto.bcnOfficialRate).toBe(36.6243);
    expect(dto.commercialRate).toBe(36.6243);
    expect(dto.totalUsd).toBe(3.14);
  });

  it('leaves the fx fields optional so legacy payloads still validate', () => {
    const { errors } = validate(basePayload);

    expect(errors).toEqual([]);
  });

  describe('customer snapshot fields (odd/factura-con-nombre)', () => {
    it('accepts customerName and customerTaxId and keeps them after whitelist stripping', () => {
      const { dto, errors } = validate({
        ...basePayload,
        customerName: 'Comercial S.A.',
        customerTaxId: 'J0310000001234',
      });

      expect(errors).toEqual([]);
      expect(dto.customerName).toBe('Comercial S.A.');
      expect(dto.customerTaxId).toBe('J0310000001234');
    });

    it('accepts explicit nulls for anonymous sales', () => {
      const { dto, errors } = validate({
        ...basePayload,
        customerName: null,
        customerTaxId: null,
      });

      expect(errors).toEqual([]);
      expect(dto.customerName).toBeNull();
      expect(dto.customerTaxId).toBeNull();
    });

    it('allows either customerName or customerTaxId alone', () => {
      const withNameOnly = validate({
        ...basePayload,
        customerName: 'Juan Perez',
      });
      expect(withNameOnly.errors).toEqual([]);
      expect(withNameOnly.dto.customerName).toBe('Juan Perez');
      expect(withNameOnly.dto.customerTaxId).toBeUndefined();

      const withTaxIdOnly = validate({
        ...basePayload,
        customerTaxId: '001-120590-0001A',
      });
      expect(withTaxIdOnly.errors).toEqual([]);
      expect(withTaxIdOnly.dto.customerName).toBeUndefined();
      expect(withTaxIdOnly.dto.customerTaxId).toBe('001-120590-0001A');
    });

    // Remediation (ITEM 4): a blank/whitespace string must never reach the
    // invoices row — the reconciled model rule is that an anonymous sale
    // stores customer_name IS NULL. The payload is NORMALIZED (trim +
    // blank→null), never rejected: a fiscal sale must never be blocked over
    // a blank optional field (explicit product rule).
    it('normalizes blank and whitespace-only snapshot strings to null without rejecting the payload', () => {
      const empty = validate({
        ...basePayload,
        customerName: '',
        customerTaxId: '   ',
      });
      expect(empty.errors).toEqual([]);
      expect(empty.dto.customerName).toBeNull();
      expect(empty.dto.customerTaxId).toBeNull();
    });

    it('trims surrounding whitespace from customer snapshot values', () => {
      const padded = validate({
        ...basePayload,
        customerName: '  Juan Perez  ',
        customerTaxId: ' J0310000001234 ',
      });
      expect(padded.errors).toEqual([]);
      expect(padded.dto.customerName).toBe('Juan Perez');
      expect(padded.dto.customerTaxId).toBe('J0310000001234');
    });
  });
});
