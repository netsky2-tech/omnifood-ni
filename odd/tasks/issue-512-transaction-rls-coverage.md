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

| Slice | PR / commit | Verification |
| --- | --- | --- |
| Slice 1 part A (this branch `fix/512-catalog-bindings`) | this PR | serial `nest build`; `npm run test:db` (256 pass); `bash scripts/verify-schema-build.sh` (79/79 coverage, 0 failures); scoped eslint; `git diff --check`; e2e recipe-routes 11 pass, loyalty-profit-aware 1 pass, activation-attempt-rls 8 pass (assertions untouched); shrinkage.service.spec 6 pass with binding-order + fail-closed tests |

## Known environmental failures (pre-existing, out of scope)

- `test/inventory/batch_6b_baseline_validation.spec.ts`
  (registerMovement / `MovementType.OUT`): present at HEAD commit a9a381d4;
  not touched by this work.
