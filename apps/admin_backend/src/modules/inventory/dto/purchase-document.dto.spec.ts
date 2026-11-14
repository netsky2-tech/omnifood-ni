import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { PurchaseDocumentDto } from './purchase-document.dto';

/**
 * The purchase `id` is the cloud column `inventory_purchase_documents.id`,
 * typed `uuid`. It used to be validated only as a non-empty string, so a
 * terminal that sent a numeric id reached PostgreSQL and surfaced as a 500
 * (`invalid input syntax for type uuid`). A 500 tells the terminal the failure
 * is TRANSIENT: it retried the same unretryable purchase forever and, because
 * the sync pass aborted on it, no later purchase ever reached the cloud.
 *
 * A 400 is the honest answer: the record is wrong, retrying cannot fix it.
 * Measured on a real device (Samsung S23) with a purchase created by the
 * pre-fix POS build.
 */
describe('PurchaseDocumentDto — id must be a UUID', () => {
  const base = {
    insumoId: 'e1000000-0000-4000-8000-000000000001',
    supplierId: 'e1000000-0000-4000-8000-000000000002',
    invoiceNumber: 'INV-1',
    quantity: 2,
    unitCost: 10,
    currency: 'NIO',
    invoiceDate: '2026-01-03',
    entryTimestamp: '2026-01-03T10:00:00.000Z',
  };

  const errorsFor = (id: string): string[] =>
    validateSync(plainToInstance(PurchaseDocumentDto, { ...base, id }), {
      whitelist: true,
    }).map((error) => error.property);

  it('rejects the numeric id the pre-fix terminal sent', () => {
    expect(errorsFor('1794606686854')).toContain('id');
  });

  it('rejects any other non-UUID string', () => {
    expect(errorsFor('purchase-doc-1')).toContain('id');
  });

  it('rejects a non-UUID insumoId or supplierId too', () => {
    // Both are `uuid` columns. An invalid value made the insumo/supplier
    // lookup throw a 500, which the terminal read as transient and retried
    // forever.
    const errors = validateSync(
      plainToInstance(PurchaseDocumentDto, {
        ...base,
        id: '3f1a6c1e-9b7d-4b0e-8f4a-1d2c3b4a5e6f',
        insumoId: '1794606686854',
        supplierId: '1794606686854',
      }),
      { whitelist: true },
    ).map((error) => error.property);
    expect(errors).toEqual(expect.arrayContaining(['insumoId', 'supplierId']));
  });

  it('accepts a v4 UUID', () => {
    expect(errorsFor('3f1a6c1e-9b7d-4b0e-8f4a-1d2c3b4a5e6f')).not.toContain(
      'id',
    );
  });
});
