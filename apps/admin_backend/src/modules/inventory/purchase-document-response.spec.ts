import { PurchaseDocument } from './entities/purchase-document.entity';
import { serializePurchaseDocument } from './purchase-document-response';

/**
 * Postgres `numeric` columns reach Node as strings: node-postgres parses
 * `numeric` to text and TypeORM's Postgres driver has no decimal hydration
 * case. `PurchaseDocument` declares five decimal columns as `number`
 * (quantity, unit_cost, bcn_rate, unit_cost_nio, projected_cpp_nio), so
 * `GET /inventory/purchases` returned the entity raw and the wire lied to
 * the owner panel (which wrapped `unit_cost_nio` in `Number(x) || 0`,
 * masking the defect at every call site). These cases pin the boundary
 * that restores the declared type without mutating the entity.
 *
 * `PurchaseDocument` declares NO nullable decimal columns, so the
 * null-preserving variant of the contract (`toFiniteNumberOrNull` in
 * `insumo-response.ts` / `cash-shift-response.ts`) never applies here:
 * every decimal is non-nullable and fails closed to 0 on a bad miss-path
 * value, exactly like the non-nullable columns of the sibling mappers.
 */
describe('serializePurchaseDocument', () => {
  // The override bag stays untyped on purpose: the whole point of this boundary is
  // that the driver hands back strings where the entity declares numbers.
  const makePurchaseDocument = (
    over: Record<string, unknown> = {},
  ): PurchaseDocument =>
    ({
      id: 'pur-1',
      tenant_id: 'tenant-A',
      insumo_id: 'ins-1',
      supplier_id: 'sup-1',
      invoice_number: 'F-900',
      document_type: 'PURCHASE',
      correction_reason: null,
      correction_for_purchase_document_id: null,
      fiscal_authorization_code: null,
      invoice_date: new Date('2026-09-30T00:00:00.000Z'),
      entry_date: new Date('2026-09-30T00:00:00.000Z'),
      entry_timestamp: new Date('2026-09-30T10:00:00.000Z'),
      quantity: '12.5000',
      unit_cost: '350.2500',
      currency: 'NIO',
      bcn_rate: '1.0000',
      unit_cost_nio: '350.2500',
      projected_cpp_nio: '360.1250',
      lot_code: null,
      received_date: null,
      expiration_date: null,
      created_at: new Date('2026-09-30T10:00:00.000Z'),
      ...over,
    }) as unknown as PurchaseDocument;

  it('coerces driver strings into JSON numbers for every decimal column', () => {
    const result = serializePurchaseDocument(makePurchaseDocument());

    expect(result.quantity).toBe(12.5);
    expect(result.unit_cost).toBe(350.25);
    expect(result.bcn_rate).toBe(1);
    expect(result.unit_cost_nio).toBe(350.25);
    expect(result.projected_cpp_nio).toBe(360.125);
    expect(typeof result.quantity).toBe('number');
    expect(typeof result.unit_cost).toBe('number');
    expect(typeof result.bcn_rate).toBe('number');
    expect(typeof result.unit_cost_nio).toBe('number');
    expect(typeof result.projected_cpp_nio).toBe('number');
  });

  it('"0.00" becomes 0 and a genuine numeric 0 stays 0', () => {
    const result = serializePurchaseDocument(
      makePurchaseDocument({
        quantity: '0.00',
        unit_cost: 0,
        bcn_rate: '0.0000',
        unit_cost_nio: '0.0000',
        projected_cpp_nio: 0,
      }),
    );

    expect(result.quantity).toBe(0);
    expect(result.unit_cost).toBe(0);
    expect(result.bcn_rate).toBe(0);
    expect(result.unit_cost_nio).toBe(0);
    expect(result.projected_cpp_nio).toBe(0);
    expect(typeof result.quantity).toBe('number');
    expect(typeof result.unit_cost_nio).toBe('number');
  });

  it('preserves decimal precision instead of truncating it', () => {
    const result = serializePurchaseDocument(
      makePurchaseDocument({
        quantity: '1234.5000',
        unit_cost_nio: '60.05',
      }),
    );

    expect(result.quantity).toBe(1234.5);
    expect(result.unit_cost_nio).toBe(60.05);
    // The value must survive the numeric methods consumers call on it
    // (the panel formats unit_cost_nio with Intl and feeds it to inputs).
    expect(result.quantity.toFixed(2)).toBe('1234.50');
    expect(result.unit_cost_nio.toFixed(2)).toBe('60.05');
  });

  it('leaves already-numeric values untouched', () => {
    const result = serializePurchaseDocument(
      makePurchaseDocument({
        quantity: 3,
        unit_cost: 12.5,
        bcn_rate: 36.62,
        unit_cost_nio: 458.25,
        projected_cpp_nio: 470.125,
      }),
    );

    expect(result.quantity).toBe(3);
    expect(result.unit_cost).toBe(12.5);
    expect(result.bcn_rate).toBe(36.62);
    expect(result.unit_cost_nio).toBe(458.25);
    expect(result.projected_cpp_nio).toBe(470.125);
  });

  it('keeps nullable non-numeric fields as null instead of fabricating values', () => {
    const result = serializePurchaseDocument(makePurchaseDocument());

    expect(result.lot_code).toBeNull();
    expect(result.correction_reason).toBeNull();
    expect(result.fiscal_authorization_code).toBeNull();
    expect(result.received_date).toBeNull();
    expect(result.expiration_date).toBeNull();
  });

  it('keeps every non-numeric field byte-identical', () => {
    const document = makePurchaseDocument({
      invoice_number: 'F-901',
      currency: 'USD',
      lot_code: 'LOT-7',
    });
    const result = serializePurchaseDocument(document);

    expect(result.id).toBe(document.id);
    expect(result.tenant_id).toBe(document.tenant_id);
    expect(result.insumo_id).toBe(document.insumo_id);
    expect(result.supplier_id).toBe(document.supplier_id);
    expect(result.invoice_number).toBe('F-901');
    expect(result.currency).toBe('USD');
    expect(result.document_type).toBe('PURCHASE');
    expect(result.lot_code).toBe('LOT-7');
    expect(result.invoice_date).toBe(document.invoice_date);
    expect(result.entry_timestamp).toBe(document.entry_timestamp);
    expect(result.created_at).toBe(document.created_at);
  });

  it('does not mutate the entity it serializes', () => {
    const document = makePurchaseDocument();
    serializePurchaseDocument(document);

    expect(document.quantity).toBe('12.5000');
    expect(document.unit_cost_nio).toBe('350.2500');
    expect(document.projected_cpp_nio).toBe('360.1250');
  });

  it('fails closed to 0 for non-finite values on the non-nullable decimals', () => {
    const result = serializePurchaseDocument(
      makePurchaseDocument({
        quantity: 'not-a-number',
        unit_cost: NaN,
        bcn_rate: Infinity,
        unit_cost_nio: undefined,
        projected_cpp_nio: null,
      }),
    );

    expect(result.quantity).toBe(0);
    expect(result.unit_cost).toBe(0);
    expect(result.bcn_rate).toBe(0);
    expect(result.unit_cost_nio).toBe(0);
    expect(result.projected_cpp_nio).toBe(0);
  });
});
