# Loyalty ledger identity batch — salvage from feat/loyalty-v1-production-readiness

- **Status:** CERRADO — T1–T3 implementadas en `feat/loyalty-ledger-identity`; PR abierto para revisión del dueño.
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
| T1+T2+T3 (POS) | `git log` (feat(pos): enforce the loyalty ledger identities...) | House-style tests written first (RED by compile: migrations undefined; DAO conflict RED behavioral under REPLACE) → GREEN: `loyalty_ledger_identity_migration_test` 14 (indexes+triggers, earn/redeem/reversal/idempotency duplicates incl. case-insensitive types, NULL-type legacy namespace, shape-trigger aborts on insert AND update, fail-closed upgrade with sample row ids, both drift guards, fresh/migrated parity), `loyalty_customer_code_migration_test` 5 (guarded add, idempotent re-run, duplicate rejection incl. NOCASE variants, NULL codes, parity), `loyalty_customer_dao_conflict_test` 3 (id conflict, NOCASE code conflict, original row survives). Floor 69→71; build_runner regen; analyze clean. Regression: migrations_test + loyalty_v1/v2 + customer_dao_test 33/33, customer-selection + loyalty-flow presentation 8/8. |
| T1 (backend) | `git log` (feat(backend): enforce the loyalty ledger identity constraints...) | Migration renumbered 1809220000000→1809650000000 (taken by EnforceOnboardingSessionRls). Unit spec 14/14; db spec 8/8 on real Postgres (incl. drift/duplicate fail-closed cases). |
| Ripple | `4491f2d3` | loyalty backfill db 12/12, ledger.service db 14/14, legacy-classification 7/7, loyalty e2e 19/19, loyalty-profit-aware 1/1, cutover 3/3, POS migrations/loyalty_v1/v2/customer_dao 33/33, customer-selection + loyalty-flow 8/8. The only production caller of `saveCustomer` is `createExpressCustomer` (fresh UUID, NULL code). |
| CI fixes | `(see git log for the three fix commits) | Three CI rounds: (1) unit-spec unused var + prettier (CI lint is fatal); (2) `named_invoice_integration_test` renamed a customer by re-INSERTING its row — now uses the DAO's `updateCustomer` (the T2a abort change exposed the wrong operation); (3) the customer/loyalty RLS fixture's minimal seeds violated `ck_loyalty_tx_type_semantics` — now V1-complete EARN rows; **production `customer_point_transactions` verified EMPTY via `railway connect postgres`**, so the fail-closed CHECK cannot block any deploy. Final: Admin CI ✅, POS CI ✅ (38193472817 / 38193472842). |
