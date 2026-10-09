import { Invoice } from '../entities/invoice.entity';
import { InvoiceItem } from '../entities/invoice-item.entity';
import { InvoiceItemModifier } from '../entities/invoice-item-modifier.entity';
import { Payment } from '../entities/payment.entity';

/**
 * Postgres `numeric` columns reach Node as strings: node-postgres parses
 * `numeric` to text and TypeORM's Postgres driver has no decimal hydration
 * case, while `Invoice` (+ `InvoiceItem`, `InvoiceItemModifier`, `Payment`)
 * declare their money and quantity columns as `number`.
 * `/sales/admin/invoices` returns the entity tree raw from `findAll`, so
 * the wire payload lies to the owner panel (which calls
 * `formatCurrency(invoice.total)` and `Math.abs(Number(item.quantity))`).
 * The coercion lives here, at the response boundary only, so internal
 * readers (services, sync listeners) keep seeing exactly what the driver
 * returned. Entities are never mutated; every other field is passed through
 * untouched.
 *
 * Miss-path semantics mirror `product-response.ts` exactly for the
 * non-nullable columns: a value that is already a number passes through,
 * and anything missing, null or not finite fails closed to 0
 * (`Number(null)` is 0). For the nullable decimal columns (the tip family)
 * only the null/undefined case diverges, by explicit contract: null stays
 * null, because NULL on a tip means "unknown / legacy pre-remediation" and
 * is never backfilled (D-9); coercing it to 0 would fabricate a fact the
 * row never carried. A non-null value still follows `toFiniteNumber`.
 */
export type AdminInvoiceItemModifierResponse = Omit<
  InvoiceItemModifier,
  'extraPrice'
> & {
  extraPrice: number;
};

export type AdminInvoiceItemResponse = Omit<
  InvoiceItem,
  | 'quantity'
  | 'unitPrice'
  | 'originalTaxRate'
  | 'appliedTaxRate'
  | 'taxAmount'
  | 'total'
  | 'discount'
  | 'modifiers'
> & {
  quantity: number;
  unitPrice: number;
  originalTaxRate: number;
  appliedTaxRate: number;
  taxAmount: number;
  total: number;
  discount: number;
  modifiers: AdminInvoiceItemModifierResponse[];
};

export type AdminInvoicePaymentResponse = Omit<
  Payment,
  'amount' | 'exchangeRate' | 'amountNio' | 'changeGiven'
> & {
  amount: number;
  exchangeRate: number;
  amountNio: number;
  changeGiven: number;
};

export type AdminInvoiceResponse = Omit<
  Invoice,
  | 'subtotal'
  | 'totalTax'
  | 'total'
  | 'bcnOfficialRate'
  | 'commercialRate'
  | 'totalUsd'
  | 'tipAmountNio'
  | 'tipAmountUsd'
  | 'tipPercentage'
  | 'tipEligibleBaseNio'
  | 'items'
  | 'payments'
> & {
  subtotal: number;
  totalTax: number;
  total: number;
  bcnOfficialRate: number;
  commercialRate: number;
  totalUsd: number;
  tipAmountNio: number | null;
  tipAmountUsd: number | null;
  tipPercentage: number | null;
  tipEligibleBaseNio: number | null;
  items: AdminInvoiceItemResponse[];
  payments: AdminInvoicePaymentResponse[];
};

function toFiniteNumber(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toFiniteNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  return toFiniteNumber(value);
}

function serializeInvoiceItemModifier(
  modifier: InvoiceItemModifier,
): AdminInvoiceItemModifierResponse {
  return {
    ...modifier,
    extraPrice: toFiniteNumber(modifier.extraPrice),
  };
}

export function serializeAdminInvoiceItem(
  item: InvoiceItem,
): AdminInvoiceItemResponse {
  return {
    ...item,
    quantity: toFiniteNumber(item.quantity),
    unitPrice: toFiniteNumber(item.unitPrice),
    originalTaxRate: toFiniteNumber(item.originalTaxRate),
    appliedTaxRate: toFiniteNumber(item.appliedTaxRate),
    taxAmount: toFiniteNumber(item.taxAmount),
    total: toFiniteNumber(item.total),
    discount: toFiniteNumber(item.discount),
    modifiers: (item.modifiers ?? []).map(serializeInvoiceItemModifier),
  };
}

export function serializeAdminInvoicePayment(
  payment: Payment,
): AdminInvoicePaymentResponse {
  return {
    ...payment,
    amount: toFiniteNumber(payment.amount),
    exchangeRate: toFiniteNumber(payment.exchangeRate),
    amountNio: toFiniteNumber(payment.amountNio),
    changeGiven: toFiniteNumber(payment.changeGiven),
  };
}

export function serializeAdminInvoice(
  invoice: Invoice,
): AdminInvoiceResponse {
  return {
    ...invoice,
    subtotal: toFiniteNumber(invoice.subtotal),
    totalTax: toFiniteNumber(invoice.totalTax),
    total: toFiniteNumber(invoice.total),
    bcnOfficialRate: toFiniteNumber(invoice.bcnOfficialRate),
    commercialRate: toFiniteNumber(invoice.commercialRate),
    totalUsd: toFiniteNumber(invoice.totalUsd),
    tipAmountNio: toFiniteNumberOrNull(invoice.tipAmountNio),
    tipAmountUsd: toFiniteNumberOrNull(invoice.tipAmountUsd),
    tipPercentage: toFiniteNumberOrNull(invoice.tipPercentage),
    tipEligibleBaseNio: toFiniteNumberOrNull(invoice.tipEligibleBaseNio),
    items: (invoice.items ?? []).map(serializeAdminInvoiceItem),
    payments: (invoice.payments ?? []).map(serializeAdminInvoicePayment),
  };
}

export function serializeAdminInvoices(
  invoices: Invoice[],
): AdminInvoiceResponse[] {
  return invoices.map(serializeAdminInvoice);
}
