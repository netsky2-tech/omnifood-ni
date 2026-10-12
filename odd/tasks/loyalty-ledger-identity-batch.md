# Loyalty ledger identity batch — salvage from feat/loyalty-v1-production-readiness

- **Status:** EN CURSO.
- **Branch:** `feat/loyalty-ledger-identity`, from `main` = `fbcf0f6d`.
- **Origin:** owner-approved salvage (2026-10-13) of the three integrity blocks from the
  2026-09-20 branch `feat/loyalty-v1-production-readiness` (24 commits, never merged). The
  release-gate runner + probes (T1b) stay on the source branch, out of scope.
- **Verification done first:** the S23 rig (R5CWB2LQJDJ) has firstInstallTime 2026-10-02,
  AFTER LV1.4 (09-03) — its DB was created fresh WITH `customer_code`, so the
  install-vs-upgrade drift is NOT live on the fleet. This batch is structural hardening,
  not a hotfix. The café production terminal's `firstInstallTime` is still unverified
  (check at next physical connection).

## T1 · Dual-engine ledger identity constraints (SQLite + Postgres)

- **What:** four partial unique identities on `customer_point_transactions`, enforced in
  BOTH engines so an offline double-earn/double-redeem cannot insert anywhere:
  - `uq_loyalty_tx_idempotency` (tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL
  - `uq_loyalty_earn_ticket_program` (tenant_id, ticket_id, loyalty_program_id) WHERE transaction_type = 'earn'
  - `uq_loyalty_redeem_ticket` (tenant_id, ticket_id) WHERE transaction_type = 'redeem'
  - `uq_loyalty_reversal_original` (tenant_id, reversal_of_transaction_id) WHERE transaction_type = 'reversal'
- **Postgres:** migration with fail-closed drift detection (LOYALTY_LEDGER_INDEX_DRIFT on
  same-name/different-relation or INVALID indexes) + duplicate pre-checks. Renumbered
  timestamp (source used 1809220000000, taken on main by EnforceOnboardingSessionRls).
- **SQLite (Floor):** `ensureLoyaltyLedgerIdentitySchema` in the open callback + a new
  `69→70` migration (source used 53→54; taken by OHAC on main). Version bump + regen.
- **Expected:** RED→GREEN per side; Floor parity test (migrated DB == fresh-install DB).

## T2 · saveCustomer: REPLACE → abort

- **What:** `OnConflictStrategy.replace` compiles to INSERT OR REPLACE, which DELETES the
  colliding customer row (and its loyalty points). Callers only insert freshly generated
  customers; the upsert-by-id semantics are not needed. Change to `abort` so a duplicate
  id or (post-T1) duplicate case-insensitive `customer_code` raises instead of silently
  destroying the ledger.

## T3 · ensureCustomerCodeSchema (install-vs-upgrade drift hardening)

- **What:** guarded add-column + partial unique index
  `idx_customers_customer_code_unique_nocase` (COLLATE NOCASE WHERE customer_code IS NOT
  NULL), identical on migrated and fresh-install databases. NOT a live bug on the fleet
  today (verified 2026-10-13), but main carries no migration for the column and any
  pre-09-03 database would drift.

## Out of scope

- Release gate runner, classifier CLI, probes (T1b) — stay on the source branch until the
  owner decides whether the release process adopts them.
- The café terminal's firstInstallTime verification (external, next physical connection).

## Evidence log

| Task | Commit | Evidence |
|---|---|---|
