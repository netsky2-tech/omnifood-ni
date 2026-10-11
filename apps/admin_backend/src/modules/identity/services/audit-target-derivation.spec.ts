import { deriveAuditTarget } from './audit-target-derivation';

/// Round-2 F-4a: the POS never sent the entity columns, so the owner's audit
/// ledger rendered "—" and the owner could not see WHAT was voided. The
/// derivation is typed at ingestion from the action + metadata the push
/// already carries.
describe('deriveAuditTarget (round-2 F-4a)', () => {
  it('derives the invoice from a void using the metadata the POS sends', () => {
    expect(
      deriveAuditTarget('SALE_VOIDED', {
        invoice_id: '425b7b1b-fbd7-40b7-baee-1444f06a3bc9',
        reason: 'ERROR_DE_CAPTURA',
      }),
    ).toEqual({
      target_type: 'INVOICE',
      target_id: '425b7b1b-fbd7-40b7-baee-1444f06a3bc9',
    });
  });

  it('derives the invoice for a sale and a reprint', () => {
    expect(
      deriveAuditTarget('SALE_CREATED', { invoice_id: 'inv-1', total: '100' }),
    ).toEqual({ target_type: 'INVOICE', target_id: 'inv-1' });
    expect(
      deriveAuditTarget('REPRINT_REQUESTED', { invoice_id: 'inv-2' }),
    ).toEqual({ target_type: 'INVOICE', target_id: 'inv-2' });
  });

  it('a credit note targets the NOTE (new_id), not the affected invoice', () => {
    expect(
      deriveAuditTarget('CREDIT_NOTE_CREATED', {
        original_id: 'invoice-41',
        new_id: 'credit-note-44',
      }),
    ).toEqual({ target_type: 'INVOICE', target_id: 'credit-note-44' });
  });

  it('an action without a mapping derives nothing (never guesses)', () => {
    expect(deriveAuditTarget('USER_CREATED', { user_id: 'u-1' })).toEqual({
      target_type: null,
      target_id: null,
    });
    expect(deriveAuditTarget('SOMETHING_NEW', {})).toEqual({
      target_type: null,
      target_id: null,
    });
  });

  it('a known action with a missing/empty id keeps the type but no id', () => {
    expect(deriveAuditTarget('SALE_VOIDED', {})).toEqual({
      target_type: 'INVOICE',
      target_id: null,
    });
    expect(deriveAuditTarget('SALE_VOIDED', { invoice_id: '' })).toEqual({
      target_type: 'INVOICE',
      target_id: null,
    });
  });

  it('non-object metadata keeps the type but no id (the action is still known)', () => {
    expect(deriveAuditTarget('SALE_VOIDED', null)).toEqual({
      target_type: 'INVOICE',
      target_id: null,
    });
    expect(deriveAuditTarget('SALE_VOIDED', 'not an object')).toEqual({
      target_type: 'INVOICE',
      target_id: null,
    });
  });
});
