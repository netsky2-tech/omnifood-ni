import { Invoice } from '../entities/invoice.entity';
import { InvoiceItem } from '../entities/invoice-item.entity';
import { InvoiceItemModifier } from '../entities/invoice-item-modifier.entity';
import { Payment } from '../entities/payment.entity';
import { serializeAdminInvoice } from './admin-invoice-response';

/**
 * Postgres `numeric` columns reach Node as strings: node-postgres parses
 * `numeric` to text and TypeORM's Postgres driver has no decimal hydration
 * case. `Invoice` (plus its items and payments) declares its money and
 * quantity columns as `number`, and `/sales/admin/invoices` returns the
 * entity raw, so the wire payload lies. These cases pin the boundary that
 * restores the declared type without mutating the entities. Nullable decimal
 * columns (the tip family) must keep `null` as `null`: NULL means "unknown /
 * legacy" on invoices and is never backfilled (D-9), so coercing it to 0
 * would fabricate a fact the row never carried.
 */
describe('serializeAdminInvoice', () => {
  const makeModifier = (over: Record<string, unknown> = {}) =>
    ({
      id: 'mod-1',
      invoiceItemId: 'item-1',
      name: 'Extra queso',
      extraPrice: '25.50',
      quantity: 1,
      ...over,
    }) as unknown as InvoiceItemModifier;

  const makeItem = (over: Record<string, unknown> = {}) =>
    ({
      id: 'item-1',
      tenant_id: 'tenant-A',
      invoiceId: 'inv-1',
      productId: 'prod-1',
      productName: 'Tacos',
      quantity: '2.0000',
      unitPrice: '57.50',
      originalTaxRate: '0.1500',
      appliedTaxRate: '0.1500',
      taxAmount: '7.50',
      total: '115.00',
      discount: '0.00',
      discountOrigin: null,
      variantId: null,
      notes: null,
      recipeVersionId: null,
      originInvoiceItemId: null,
      inventorySnapshotVersion: null,
      inventorySnapshot: null,
      modifiers: [makeModifier()],
      ...over,
    }) as unknown as InvoiceItem;

  const makePayment = (over: Record<string, unknown> = {}) =>
    ({
      id: 'pay-1',
      invoiceId: 'inv-1',
      method: 'CASH',
      amount: '115.00',
      currency: 'NIO',
      exchangeRate: '1.0000',
      amountNio: '115.00',
      changeGiven: '0.00',
      changeCurrency: 'NIO',
      voucherCode: null,
      cardBrand: null,
      cardType: null,
      bankPos: null,
      reconciliationStatus: 'PENDIENTE',
      last4: null,
      batchNumber: null,
      reconciledAt: null,
      reconciledByUserId: null,
      overrideSupervisorRef: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      ...over,
    }) as unknown as Payment;

  const makeInvoice = (over: Record<string, unknown> = {}) =>
    ({
      id: 'inv-1',
      tenant_id: 'tenant-A',
      number: '001-001-01-00000010',
      created_at: new Date('2026-01-01T00:00:00.000Z'),
      userId: 'user-1',
      subtotal: '100.00',
      totalTax: '15.00',
      total: '115.00',
      isCanceled: false,
      voidReason: null,
      paymentStatus: 'paid',
      customerId: null,
      customerName: null,
      customerTaxId: null,
      globalTaxOverride: false,
      type: 'regular',
      relatedInvoiceId: null,
      originInvoiceId: null,
      refundReasonCode: null,
      refundReasonPolicy: null,
      authorizedByUserId: null,
      authorizedByRole: null,
      bcnOfficialRate: '36.6241',
      commercialRate: '36.5000',
      totalUsd: '3.15',
      inventoryPolicyVersion: null,
      inventoryOutcome: null,
      inventoryOutcomeReason: null,
      shiftId: null,
      localIssueDate: null,
      tipAmountNio: null,
      tipAmountUsd: null,
      tipPercentage: null,
      tipEligibleBaseNio: null,
      updated_at: new Date('2026-01-01T00:00:00.000Z'),
      items: [makeItem()],
      payments: [makePayment()],
      ...over,
    }) as unknown as Invoice;

  it('coerces driver strings into JSON numbers on the invoice, its items and its payments', () => {
    const result = serializeAdminInvoice(makeInvoice());

    expect(result.subtotal).toBe(100);
    expect(result.totalTax).toBe(15);
    expect(result.total).toBe(115);
    expect(result.bcnOfficialRate).toBe(36.6241);
    expect(result.commercialRate).toBe(36.5);
    expect(result.totalUsd).toBe(3.15);

    const [item] = result.items;
    expect(item.quantity).toBe(2);
    expect(item.unitPrice).toBe(57.5);
    expect(item.taxAmount).toBe(7.5);
    expect(item.total).toBe(115);
    expect(item.discount).toBe(0);
    expect(item.originalTaxRate).toBe(0.15);
    expect(item.appliedTaxRate).toBe(0.15);

    const [payment] = result.payments;
    expect(payment.amount).toBe(115);
    expect(payment.amountNio).toBe(115);
    expect(payment.exchangeRate).toBe(1);
    expect(payment.changeGiven).toBe(0);

    const [modifier] = item.modifiers;
    expect(modifier.extraPrice).toBe(25.5);

    expect(typeof result.total).toBe('number');
    expect(typeof item.quantity).toBe('number');
    expect(typeof item.unitPrice).toBe('number');
    expect(typeof item.total).toBe('number');
    expect(typeof payment.amount).toBe('number');
    expect(typeof payment.amountNio).toBe('number');
  });

  it('"0.00" becomes 0 and a genuine numeric 0 stays 0', () => {
    const result = serializeAdminInvoice(
      makeInvoice({
        subtotal: '0.00',
        totalTax: '0.00',
        items: [makeItem({ discount: '0.00', quantity: 0 })],
        payments: [makePayment({ changeGiven: '0.00' })],
      }),
    );

    expect(result.subtotal).toBe(0);
    expect(result.totalTax).toBe(0);
    expect(result.items[0].discount).toBe(0);
    expect(result.items[0].quantity).toBe(0);
    expect(result.payments[0].changeGiven).toBe(0);
    expect(typeof result.subtotal).toBe('number');
    expect(typeof result.items[0].quantity).toBe('number');
  });

  it('preserves decimal precision instead of truncating it', () => {
    const result = serializeAdminInvoice(
      makeInvoice({
        total: '1234.50',
        items: [makeItem({ unitPrice: '57.55', quantity: '1.5000' })],
      }),
    );

    expect(result.total).toBe(1234.5);
    expect(result.items[0].unitPrice).toBe(57.55);
    expect(result.items[0].quantity).toBe(1.5);
    // The value must survive the numeric methods the panel calls on it.
    expect(result.total.toFixed(2)).toBe('1234.50');
    expect(result.items[0].quantity.toFixed(2)).toBe('1.50');
  });

  it('leaves already-numeric values untouched', () => {
    const result = serializeAdminInvoice(
      makeInvoice({
        subtotal: 100,
        total: 115,
        items: [makeItem({ quantity: 2, unitPrice: 57.5 })],
        payments: [makePayment({ amount: 115, amountNio: 115 })],
      }),
    );

    expect(result.subtotal).toBe(100);
    expect(result.total).toBe(115);
    expect(result.items[0].quantity).toBe(2);
    expect(result.items[0].unitPrice).toBe(57.5);
    expect(result.payments[0].amount).toBe(115);
    expect(result.payments[0].amountNio).toBe(115);
  });

  it('keeps null as null on nullable decimal columns instead of fabricating 0', () => {
    const result = serializeAdminInvoice(
      makeInvoice({
        tipAmountNio: null,
        tipAmountUsd: null,
        tipPercentage: null,
        tipEligibleBaseNio: null,
      }),
    );

    expect(result.tipAmountNio).toBeNull();
    expect(result.tipAmountUsd).toBeNull();
    expect(result.tipPercentage).toBeNull();
    expect(result.tipEligibleBaseNio).toBeNull();
  });

  it('coerces a present tip value but keeps the tip family null-safe', () => {
    const result = serializeAdminInvoice(
      makeInvoice({ tipAmountNio: '50.00', tipPercentage: '10.00' }),
    );

    expect(result.tipAmountNio).toBe(50);
    expect(result.tipPercentage).toBe(10);
    expect(result.tipAmountUsd).toBeNull();
  });

  it('keeps every non-numeric field byte-identical', () => {
    const invoice = makeInvoice();
    const result = serializeAdminInvoice(invoice);

    expect(result.id).toBe(invoice.id);
    expect(result.tenant_id).toBe(invoice.tenant_id);
    expect(result.number).toBe('001-001-01-00000010');
    expect(result.type).toBe('regular');
    expect(result.isCanceled).toBe(false);
    expect(result.paymentStatus).toBe('paid');
    expect(result.created_at).toBe(invoice.created_at);
    expect(result.items[0].productName).toBe('Tacos');
    expect(result.items[0].discountOrigin).toBeNull();
    expect(result.payments[0].method).toBe('CASH');
    expect(result.payments[0].currency).toBe('NIO');
  });

  it('does not mutate the entities it serializes', () => {
    const invoice = makeInvoice();
    serializeAdminInvoice(invoice);

    expect(invoice.total).toBe('115.00');
    expect(invoice.items[0].quantity).toBe('2.0000');
    expect(invoice.payments[0].amountNio).toBe('115.00');
  });
});
