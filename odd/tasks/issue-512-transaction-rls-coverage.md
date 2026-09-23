# Issue #512 — Tenant Transaction Binding + RLS Coverage (T3)

## Objective

Bind every production access to the 26 tenant-debt tables to a tenant-bound
transaction manager (`runInTenantTransaction` / `bindTenantContext` from
`apps/admin_backend/src/core/database/tenant-transaction.ts`) so the later RLS
policy rollout is behaviorally observable instead of silently breaking pooled
reads. Binding-first, policies-second: no migration, manifest, or RLS policy
change happens in the binding slices.

Issue: <https://github.com/netsky2-tech/omnifood-ni/issues/512>

## Authority and context

- Follows issue #493 (systemic RLS coverage) and Unit 0b-3 (mapping-version
  tenant binding guard): blank tenant ids fail closed with
  `TenantContextRequiredError` / `BadRequestException` BEFORE any transaction
  opens.
- `schema-rls-coverage-manifest.txt` classifies the 26 tables below as `debt`;
  a fully protected debt entry fails the verifier as stale, so each T3 slice
  flips entries only when its migration+policy slice lands.

## Constraints

- Behaviorally inert: binding only; no migrations, no manifest edits, no RLS
  policies in this PR.
- Public service signatures preserved; error semantics and atomicity preserved;
  existing lock ordering preserved (locks stay the first DB operation).
- Fail closed: blank tenant ids throw before any SQL runs.
- Event emission that does no DB work may stay after commit
  (LowStockListener performs no DB work).
- Each review slice stays near 400 authored changed lines.
- No commit/push by the implementation agent; delivery is a human decision.

## Debt inventory — 26 tables (schema-rls-coverage-manifest.txt, `debt`)

audit_integrity_alerts, audit_logs, batches, cash_movements,
cash_shift_sessions, cashier_sessions, change_log,
customer_loyalty_account_projection, customer_point_transactions, customers,
datafonos_equipos, forensic_alerts, insumos, loyalty_programs, loyalty_rewards,
production_orders, products, promotions, recipe_details, recipe_versions,
recipes, shrinkages, suppliers, uom_conversions, users, warehouses.

## Founder decisions

1. `cashier_sessions` gets an added `tenant_id` column plus backfill (no
   pre-existing rows to preserve isolation on).
2. `datafonos_equipos` is protected as a direct (tenant-bearing) table.
3. A same-name cross-tenant catalog isolation test is required before the
   products/insumos policy slice can be declared done.

## Slices (ordered)

1. **Catalog + inventory bindings (part A — this PR).** products/insumos and
   their satellite reads (mapping versions, uom conversions) bound in
   inventory, recipe, purchase, onboarding, readiness adapters, loyalty cost
   query, and inbound sync (pooled fallback removed for products/insumos).
2. Recipes/recipe_details/recipe_versions remaining write paths.
3. Customers + loyalty (programs, rewards, point transactions, projection).
4. Cash + sessions (cash_movements, cash_shift_sessions, cashier_sessions
   including the backfill decision).
5. Warehouses, suppliers, batches, production_orders, promotions.
6. audit_integrity_alerts, audit_logs, change_log, forensic_alerts.
7. users + datafonos_equipos (direct-protection decision applied).
8. (Folded into slice 1 part A) shrinkages: bound via the device-principal
   tenant threaded from `inventory-movement.controller.ts` (`requireTenant`)
   into `ShrinkageService.recordShrinkage/recordProductShrinkage`, which now
   run inside `runInTenantTransaction`.

Then the policy slices: per-domain RLS migrations flip manifest entries from
`debt` to `direct`, each validated by the schema verifier and the same-name
cross-tenant test.

## Unbindable items (need human approval)

- None remaining from the slice 1 surfaces. Follow-up: the controller unit
  spec `src/modules/inventory/inventory.controller.spec.ts` (outside the
  authorized edit surfaces) still calls `recordShrinkage` with the old
  signature and needs a mechanical tenant-argument update once approved.

## Evidence ledger

### Part B — catalog RLS policies (this branch `fix/512-catalog-rls`)

- **Scope**: exactly `products` and `insumos` (both tenant_id uuid via
  1759000000002; FK to tenants(id); uniqueness is `(tenant_id, id)` only —
  no unique on `name`, which is why the same-name case below matters).
- **Migration**: `src/migrations/1809250000000-EnforceCatalogRls.ts`
  (`EnforceCatalogRls1809250000000`), mirroring the reviewed reference
  1809220000000: ENABLE + FORCE RLS, one `{table}_tenant_{command}` policy
  per command, predicate resolved per table through
  `resolveTenantRlsPredicate`, `DROP POLICY IF EXISTS` before a
  catalog-guarded `CREATE`, idempotent under the scenario-2 partial ledger
  (verifier: 31 ledger rows removed, expected 31).
- **Rollback boundary**: `down()` drops exactly the eight policies created
  here and removes FORCE while keeping ENABLE; never drops tables,
  truncates, or deletes rows.
- **RED (observed, migration absent)**: e2e suite
  `test/inventory/catalog-rls.db.e2e-spec.ts` run BEFORE the migration
  existed: 9 failed / 3 passed — failing class is absent row-level security:
  structural flags false with empty policy sets, unbound runtime role saw
  every row, tenant A saw tenant B's rows, tenant C's foreign-tenant INSERT
  resolved instead of being rejected, and the same-name case leaked the
  foreign row in both read and name-keyed write directions.
- **GREEN (observed)**: unit spec 13/13; behavioural e2e 12/12 — structural
  ENABLE+FORCE + exactly four command policies per table, unbound sees zero,
  tenant-local CRUD per table, foreign INSERT rejected (WITH CHECK),
  cross-tenant UPDATE/DELETE affect zero rows.
- **Same-name cross-tenant case (founder decision 3)**: two tenants each
  hold a product and an insumo with IDENTICAL names; each tenant's name
  lookup returns exactly its own row, a name-keyed UPDATE returns exactly
  its own row, and a foreign-tenant INSERT carrying the identical name is
  rejected. The spec pins the RLS-absent counterfactual explicitly (two rows
  returned/mutated, INSERT accepted) so the assertions cannot pass vacuously.
- **Atomic promotion**: manifest `products` and `insumos` moved debt →
  direct (42 direct / 5 parent-owned / 8 global / 24 debt, total 79);
  `EnforceCatalogRls1809250000000` added once to the scenario-2
  partial-ledger list, expected row count 30 → 31.
- **Validation (all observed passing)**: `npx jest
  src/migrations/1809250000000-EnforceCatalogRls.spec.ts --runInBand` (13),
  `npx jest --config ./test/jest-e2e.json --runInBand catalog-rls` (12),
  `npm run test:db` (45 suites / 256), `npm test` (258 suites / 2525, 8
  skipped pre-existing), `npm run test:e2e -- --runInBand` (61 suites / 503),
  `SCHEMA_CHECK_DB=omnifood_schema_build_test bash
  scripts/verify-schema-build.sh` (both scenarios PASS, coverage failures 0),
  `git diff --check` clean, scoped `npx eslint --no-fix` clean.
- **Next slice**: T3 slice 2 — recipes/recipe_details/recipe_versions
  remaining write paths, then their policy slice flips those manifest
  entries.

Slice 1 (parts A + B) is complete: every check above passed.

| Slice | PR / commit | Verification |
| --- | --- | --- |
| Slice 1 part A (this branch `fix/512-catalog-bindings`) | this PR | serial `nest build`; `npm run test:db` (256 pass); `bash scripts/verify-schema-build.sh` (79/79 coverage, 0 failures); scoped eslint; `git diff --check`; e2e recipe-routes 11 pass, loyalty-profit-aware 1 pass, activation-attempt-rls 8 pass (assertions untouched); shrinkage.service.spec 6 pass with binding-order + fail-closed tests |

## Known environmental failures (pre-existing, out of scope)

- `test/inventory/batch_6b_baseline_validation.spec.ts`
  (registerMovement / `MovementType.OUT`): present at HEAD commit a9a381d4;
  not touched by this work.
