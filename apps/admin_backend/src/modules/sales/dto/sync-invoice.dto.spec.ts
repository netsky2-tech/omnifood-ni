import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { DiscountOrigin } from '../entities/discount-origin.enum';
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

describe('SyncInvoiceDto per-line discountOrigin amounts breakdown (D-A2)', () => {
  const baseItem = {
    id: 'item-1',
    productId: 'prod-1',
    productName: 'Burger',
    quantity: 1,
    unitPrice: 10,
    originalTaxRate: 0.15,
    appliedTaxRate: 0.15,
    taxAmount: 1.5,
    total: 11.5,
    discount: 1,
  };

  const basePayload = {
    id: 'inv-1',
    number: '001',
    createdAt: new Date().toISOString(),
    userId: 'user-1',
    subtotal: 100,
    totalTax: 15,
    total: 115,
    paymentStatus: 'PAID',
    items: [baseItem],
    payments: [],
  };

  const validate = (
    payload: Record<string, unknown>,
    options: Record<string, unknown> = {},
  ) => {
    const dto = plainToInstance(SyncInvoiceDto, payload);
    const errors = validateSync(dto, {
      whitelist: true,
      forbidUnknownValues: false,
      ...options,
    });
    return { dto, errors };
  };

  const flatten = (
    error: import('class-validator').ValidationError,
  ): string[] => [error.property, ...(error.children ?? []).flatMap(flatten)];

  it('accepts a per-line amounts breakdown and keeps it after whitelist stripping', () => {
    const { dto, errors } = validate({
      ...basePayload,
      items: [{ ...baseItem, discountOrigin: { manual: 5, promotion: 10 } }],
    });

    expect(errors).toEqual([]);
    // A line can be discounted by MORE THAN ONE origin at once (a promotion
    // on the item plus a manual discount on the order); the breakdown keeps
    // how much came from each.
    expect(dto.items[0].discountOrigin).toEqual({ manual: 5, promotion: 10 });
  });

  it('accepts a partial breakdown: members are optional and only non-zero origins travel', () => {
    const { dto, errors } = validate({
      ...basePayload,
      items: [{ ...baseItem, discountOrigin: { promotion: 10 } }],
    });

    expect(errors).toEqual([]);
    expect(dto.items[0].discountOrigin).toEqual({ promotion: 10 });
  });

  it('accepts every known origin as a breakdown key: the TS enum is the source of the keys', () => {
    for (const origin of Object.values(DiscountOrigin)) {
      const { errors } = validate({
        ...basePayload,
        items: [{ ...baseItem, discountOrigin: { [origin]: 1 } }],
      });

      expect(errors).toEqual([]);
    }
  });

  it('accepts explicit null: the cloud must not fabricate origins (no backfill)', () => {
    const { dto, errors } = validate({
      ...basePayload,
      items: [{ ...baseItem, discountOrigin: null }],
    });

    expect(errors).toEqual([]);
    expect(dto.items[0].discountOrigin).toBeNull();
  });

  it('rejects an unknown KEY inside the breakdown instead of silently storing it', () => {
    const { errors } = validate(
      {
        ...basePayload,
        items: [{ ...baseItem, discountOrigin: { bossDiscount: 5 } }],
      },
      // Mirrors the production ValidationPipe (main.ts): whitelist plus
      // forbidNonWhitelisted. An unknown member must be REJECTED, not
      // stripped into silent data loss.
      { forbidNonWhitelisted: true },
    );

    const properties = errors.flatMap(flatten);
    expect(properties).toContain('discountOrigin');
    expect(properties).toContain('bossDiscount');
  });

  it('rejects a NEGATIVE amount', () => {
    const { errors } = validate({
      ...basePayload,
      items: [{ ...baseItem, discountOrigin: { manual: -3 } }],
    });

    expect(errors.flatMap(flatten)).toContain('discountOrigin');
  });

  it('rejects a ZERO amount: presence already implies a non-zero contribution, so the pipe must answer 400 before the database can answer 23514', () => {
    const { errors } = validate({
      ...basePayload,
      items: [{ ...baseItem, discountOrigin: { manual: 0 } }],
    });

    const properties = errors.flatMap(flatten);
    expect(properties).toContain('discountOrigin');
    expect(properties).toContain('manual');
  });

  it('rejects an EMPTY breakdown object: the legal states are exactly NULL and a populated breakdown', () => {
    const { errors } = validate({
      ...basePayload,
      items: [{ ...baseItem, discountOrigin: {} }],
    });

    expect(errors.flatMap(flatten)).toContain('discountOrigin');
  });

  it('rejects a non-numeric amount', () => {
    const { errors } = validate({
      ...basePayload,
      items: [{ ...baseItem, discountOrigin: { manual: '5' } }],
    });

    expect(errors.flatMap(flatten)).toContain('discountOrigin');
  });

  it('leaves the field optional so payloads whose items omit it still validate (backward-compat contract for every deployed terminal)', () => {
    const { dto, errors } = validate(basePayload);

    expect(errors).toEqual([]);
    expect(dto.items[0]).not.toHaveProperty('discountOrigin');
  });
});

describe('CreateModifierDto modifier quantity (SOHO P3)', () => {
  const baseModifier = {
    name: 'Michelada Extra',
    extraPrice: 30,
  };

  const baseItem = {
    id: 'item-1',
    productId: 'prod-1',
    productName: 'Cerveza Preparada',
    quantity: 1,
    unitPrice: 50,
    originalTaxRate: 0.15,
    appliedTaxRate: 0.15,
    taxAmount: 16.5,
    total: 126.5,
    discount: 0,
    modifiers: [baseModifier],
  };

  const basePayload = {
    id: 'inv-1',
    number: '001',
    createdAt: new Date().toISOString(),
    userId: 'user-1',
    subtotal: 110,
    totalTax: 16.5,
    total: 126.5,
    paymentStatus: 'PAID',
    items: [baseItem],
    payments: [],
  };

  const validate = (payload: Record<string, unknown>) => {
    const dto = plainToInstance(SyncInvoiceDto, payload);
    const errors = validateSync(dto, {
      whitelist: true,
      forbidUnknownValues: false,
      // Mirrors the production ValidationPipe (main.ts): whitelist plus
      // forbidNonWhitelisted. An unknown member must be REJECTED, not
      // stripped into silent data loss.
      forbidNonWhitelisted: true,
    });
    return { dto, errors };
  };

  const flatten = (
    error: import('class-validator').ValidationError,
  ): string[] => [error.property, ...(error.children ?? []).flatMap(flatten)];

  // The nested array path (items → modifiers → element) is an
  // implementation detail of class-validator's error tree; find the
  // quantity error anywhere under it.
  const findQuantityError = (
    error: import('class-validator').ValidationError,
  ): import('class-validator').ValidationError | undefined => {
    if (error.property === 'quantity') return error;
    for (const child of error.children ?? []) {
      const found = findQuantityError(child);
      if (found) return found;
    }
    return undefined;
  };
  const quantityErrors = (
    errors: import('class-validator').ValidationError[],
  ) =>
    errors
      .map(findQuantityError)
      .filter(
        (error): error is import('class-validator').ValidationError =>
          error !== undefined,
      );

  it('accepts the POS wire shape {name, extraPrice, quantity} and keeps quantity after validation', () => {
    const { dto, errors } = validate({
      ...basePayload,
      items: [
        { ...baseItem, modifiers: [{ ...baseModifier, quantity: 2 }] },
      ],
    });

    expect(errors).toEqual([]);
    expect(dto.items[0].modifiers?.[0].quantity).toBe(2);
  });

  it('leaves quantity OPTIONAL: older terminals omit it and must stay valid', () => {
    const { dto, errors } = validate(basePayload);

    expect(errors).toEqual([]);
    expect(dto.items[0].modifiers?.[0].quantity).toBeUndefined();
  });

  it('rejects quantity 0 with the named min constraint', () => {
    const { errors } = validate({
      ...basePayload,
      items: [
        { ...baseItem, modifiers: [{ ...baseModifier, quantity: 0 }] },
      ],
    });

    const quantityError = quantityErrors(errors);
    expect(quantityError).toHaveLength(1);
    expect(Object.keys(quantityError[0].constraints ?? {})).toContain('min');
  });

  it('rejects a NEGATIVE quantity with the named min constraint', () => {
    const { errors } = validate({
      ...basePayload,
      items: [
        { ...baseItem, modifiers: [{ ...baseModifier, quantity: -3 }] },
      ],
    });

    const quantityError = quantityErrors(errors);
    expect(quantityError).toHaveLength(1);
    expect(Object.keys(quantityError[0].constraints ?? {})).toContain('min');
  });

  it('rejects a NON-INTEGER quantity (fractional units of an option are meaningless)', () => {
    const { errors } = validate({
      ...basePayload,
      items: [
        { ...baseItem, modifiers: [{ ...baseModifier, quantity: 1.5 }] },
      ],
    });

    expect(errors.flatMap(flatten)).toContain('quantity');
  });
});
