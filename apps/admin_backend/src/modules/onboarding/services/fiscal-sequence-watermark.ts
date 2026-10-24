import { type EntityManager } from 'typeorm';

/**
 * Single source of truth for the cloud's highest issued invoice sequence.
 *
 * The sequence is the TRAILING digit run of the folio, matching the POS's own
 * extraction (`DgiNumberingServiceImpl._extractSequenceNumber` takes
 * `RegExp(r'(\d+)$')`). Production folios carry the DGI prefix
 * (`001-001-01-00000005`), so stripping non-digits would concatenate the
 * prefix digits with the consecutivo and compute a wrong MAX that refuses a
 * legitimate next folio. `substring ... '([0-9]+)$'` returns NULL when there is
 * no trailing digit run, so folios like `INV-828db0f9-…` (which would also
 * overflow bigint) are ignored by MAX instead of poisoning it.
 *
 * The caller MUST pass a tenant-bound manager (RLS): the query carries the
 * explicit `tenant_id` predicate on top of the row-level policy.
 *
 * Throws when the MAX cannot be read. Callers decide whether that is a
 * fail-closed recovery state (a proposal must be verified) or a historical
 * fail-safe to 0 (no proposal to verify).
 */
export async function readHighestInvoiceSequence(
  manager: EntityManager,
  tenantId: string,
): Promise<number> {
  const rows: Array<{ maxSeq?: string | number | null }> =
    await manager.query(
      `SELECT MAX(CAST(NULLIF(substring(invoice_number from '([0-9]+)$'), '') AS bigint)) AS "maxSeq"
         FROM invoices
         WHERE tenant_id = $1`,
      [tenantId],
    );
  return rows?.[0]?.maxSeq ? Number(rows[0].maxSeq) : 0;
}
