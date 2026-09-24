-- =============================================================================
-- dev-cleanup-duplicate-invoice-numbers.sql
-- =============================================================================
--
-- DEVELOPMENT / STAGING ONLY. NEVER run this against a live tenant: doing so
-- is a fiscal incident. On a live environment, duplicate invoice numbers are
-- routed through SCENARIO D of docs/operations/pilot-terminal-incident-
-- procedure.md, never cleaned up with a script.
--
-- THIS SCRIPT EDITS ISSUED INVOICE NUMBERS. That is a deliberate, audited,
-- human decision in a disposable environment only. It exists here — outside
-- the migration ledger and outside every automated path — precisely because
-- migration 1809270000000-AddInvoiceNumberUniqueness must never rewrite an
-- invoice row (issue #526 AC-11): the migration fails closed and throws, and
-- a human decides what happens next.
--
-- It cannot delete: `invoices` is append-only by trigger
-- (trg_invoices_credit_note_provenance_immutable, migration 1782000000000
-- raises 'invoices are append-only: DELETE is forbidden'). So the only
-- available remediation is REASSIGNING the duplicate numbers, which is why
-- this script edits issued invoices at all.
--
-- DRY-RUN BY DEFAULT. The mutating UPDATE is inside a commented-out block at
-- the bottom. Run the SELECT first, read what it would change, and only then
-- uncomment and run the UPDATE if you accept it.
--
-- Rule (never hardcoded uuids): within each duplicated
-- (tenant_id, invoice_number) group, the EARLIEST row (by created_at, then id
-- as tiebreaker) keeps its number; every later row receives the suffix
-- '-DUP<n>' where n is its 1-based position inside the group (so the second
-- row becomes <number>-DUP2, the third <number>-DUP3, ...).
--
-- Note: the append-only trigger permits UPDATE on non-credit-note invoices,
-- so this reassignment goes through. Credit-note invoices remain immutable;
-- if a credit note is ever part of a duplicate group, stop and escalate.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- DRY-RUN: report exactly what would change, changing nothing.
-- -----------------------------------------------------------------------------
WITH ranked AS (
  SELECT
    id,
    tenant_id,
    invoice_number,
    created_at,
    row_number() OVER (
      PARTITION BY tenant_id, invoice_number
      ORDER BY created_at, id
    ) AS position_in_group,
    count(*) OVER (PARTITION BY tenant_id, invoice_number) AS rows_in_group
  FROM invoices
)
SELECT
  tenant_id,
  invoice_number                          AS current_number,
  rows_in_group,
  CASE
    WHEN position_in_group = 1 THEN 'keeps its number'
    ELSE 'renamed to ' || invoice_number || '-DUP' || position_in_group
  END                                     AS planned_action,
  id,
  created_at
FROM ranked
WHERE rows_in_group > 1
ORDER BY tenant_id, current_number, position_in_group;

-- -----------------------------------------------------------------------------
-- MUTATING BLOCK — commented out. Opt in explicitly, disposable
-- environments only, after reading the dry-run output above.
-- -----------------------------------------------------------------------------
-- WITH ranked AS (
--   SELECT
--     id,
--     tenant_id,
--     invoice_number,
--     created_at,
--     row_number() OVER (
--       PARTITION BY tenant_id, invoice_number
--       ORDER BY created_at, id
--     ) AS position_in_group
--   FROM invoices
-- )
-- UPDATE invoices i
-- SET invoice_number = i.invoice_number || '-DUP' || ranked.position_in_group
-- FROM ranked
-- WHERE ranked.id = i.id
--   AND ranked.position_in_group > 1;
--
-- After running the UPDATE, verify zero duplicate groups remain:
--   SELECT tenant_id, invoice_number, count(*)
--   FROM invoices
--   GROUP BY tenant_id, invoice_number
--   HAVING count(*) > 1;
-- That query must return zero rows before re-running
-- migration 1809270000000-AddInvoiceNumberUniqueness.
