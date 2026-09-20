# Issue #425 — inventory_kardex inserts fail after tenant_id UUID rebind

**Issue:** #425 `fix(db): every inventory_kardex INSERT fails on a migrated database (hashtext on a uuid)`
**Branch:** `fix/425-kardex-tenant-hash`
**Base:** `main` @ `4944367`
**Status:** implementation verified; historical-impact task blocked on production evidence; single-PR delivery authorized

## Objective

Restore `inventory_kardex` writes on fully migrated databases without weakening the running-balance invariant. Determine historical impact only from real operational evidence; never infer a lost-row count from repository state.

## Problem and evidence

`1774000000000-EnforceInventoryKardexRunningBalance.ts` created `enforce_inventory_kardex_running_balance()` while `inventory_kardex.tenant_id` was varchar and called `hashtext(NEW.tenant_id)`. `1809070000000-RebindInventoryKardexTenantColumns.ts` later converted the column to uuid without redefining the function. PostgreSQL has no `hashtext(uuid)` overload, so every INSERT reaches the `BEFORE INSERT` trigger and fails before a row is appended.

The correction must redefine the function with `hashtext(NEW.tenant_id::text)` and leave its body otherwise unchanged. A real migration-built DB test must prove both successful insertion and rejection of an invalid running-balance transition.

## Scope

- Add one reversible, idempotent migration redefining the existing trigger function.
- Add a unit spec that constrains the SQL/body and rollback definition.
- Add a migration-built DB spec that executes a real INSERT and an invalid follow-up INSERT.
- Run the focused unit, DB, migration-build, lint, and no-focused-test checks.
- Document what evidence is required to answer whether production lost kardex movements.

## Constraints

- Offline-first: local POS SQLite remains the source of truth; this cloud-side fix must not fabricate reconciliation state.
- DGI: no invoice deletion or numbering changes are involved.
- Do not alter the original migration or redesign the running-balance function.
- Do not claim historical loss or recovery without the real database/logs and an independent expected-movement source.
- No commit or PR until explicit delivery authorization is confirmed.

## Testing mode

- **Mode:** TDD enabled.
- **Source:** repository `AGENTS.md` requires test-first for meaningful logic changes.
- **Runners:** focused Jest unit spec, focused Jest DB spec, `scripts/verify-schema-build.sh`, focused ESLint, and `npm run test:no-only`.
- **Required evidence:** observed RED before implementation, then GREEN after the migration is added.

## Delivery forecast

- Forecast was approximately 300–380 authored lines; actual source/test implementation is **465 added lines** across the migration and two specs, plus this tracker.
- Strategy: `single-pr` with an explicit maintainer-approved size exception. The user authorized one commit and one PR after seeing the measured 465 source/test lines; the migration and executable acceptance proof have no safe independently green split.
- Route: delegated direct writer because implementation touches three non-trivial source/test files (multi-file writer trigger).

## Tasks

- [x] **T1 — Restore inserts and preserve running-balance enforcement**
  - Add migration `1809210000000-FixInventoryKardexRunningBalanceTenantHash.ts`.
  - Add unit and migration-built DB specs.
  - Observe the DB acceptance test fail before the migration exists for the expected `hashtext(uuid)` error.
  - Observe all required checks pass after implementation.
  - Acceptance: a valid INSERT succeeds; an invalid next balance is rejected with the invariant error; function body differs from the original only by `NEW.tenant_id::text` in `up()`; `down()` restores the prior definition.
  - Route: delegated to `gentle-ai-worker`; allowed edit surfaces are the three exact migration/spec paths.
  - Review/verification: writer strict-TDD verification passed; native assessment was unavailable because the package-local Gentle AI v3.2.1 binary is missing, so the candidate was treated as high risk; an independent verifier ran all five checks and returned PASS with no blockers. Parent spot-check re-ran the focused unit spec: 5/5 passed.

- [ ] **T2 — Bound historical impact from production evidence**
  - Establish the migration/deployment exposure interval from the real database and deploy records.
  - Compare independent expected movements (sync receipts/outbox, invoices/source documents, application or PostgreSQL logs, and offline POS SQLite ledgers) against cloud kardex rows.
  - Acceptance: report only evidenced counts/ranges and explicitly state unavailable evidence.
  - Blocker: no production database, logs, deploy records, or affected POS SQLite ledgers are available in this session.
  - Route: no write; operator/read-only operational investigation required.

## Verification commands

Run from `apps/admin_backend/`:

```bash
npx jest src/migrations/1809210000000-FixInventoryKardexRunningBalanceTenantHash.spec.ts
DB_HOST=127.0.0.1 DB_PORT=5432 DB_USERNAME=postgres DB_PASSWORD=postgres DB_DATABASE=omnifood npm run test:db -- 1809210000000
DB_HOST=127.0.0.1 DB_PORT=5432 DB_USERNAME=postgres DB_PASSWORD=postgres SCHEMA_CHECK_DB=omnifood_schema_build_test bash scripts/verify-schema-build.sh
npx eslint "src/migrations/1809210000000-*"
npm run test:no-only
```

## Progress and evidence

- Read-only mapping completed. Migration discovery is glob-based, so no registry file is required.
- TDD RED observed against the exact post-`1809070000000`, pre-fix migrated state: a real INSERT failed with `function hashtext(uuid) does not exist`.
- Added `1809210000000-FixInventoryKardexRunningBalanceTenantHash.ts`, its unit spec, and its migration-built DB spec. No original migration, helper, manifest, or unrelated file changed.
- GREEN observed by writer and independently reproduced:
  - focused unit: 5/5 passed;
  - migration-built DB acceptance: 3/3 passed;
  - schema build: both scenarios passed with every drift/coverage counter at zero;
  - focused ESLint: clean;
  - `test:no-only`: passed.
- Independent read-only comparison proved the `up()` body differs from the original by exactly one line (`NEW.tenant_id::text`) and `down()` is byte-identical to the original body.
- The real DB acceptance proves a valid INSERT persists and an invalid next balance is rejected while the persisted row count remains one.
- Independent verifier found no blockers. Low-risk follow-ups recorded but not expanded into scope: the DB harness migration filename regex is narrower than the production glob, and rollback is text-verified rather than executed as a DB round trip.
- Historical loss cannot be inferred from `inventory_kardex`: the `BEFORE INSERT` failure leaves no rejected-row marker in the ledger itself. T2 remains blocked until the real production DB/log/deploy/POS evidence is available.

## Next step

Create the authorized work-unit commit and single PR with the measured size-exception rationale. After delivery, resume #424's fourth migration-built invoice fixture; do not claim T2 complete without operational evidence.
