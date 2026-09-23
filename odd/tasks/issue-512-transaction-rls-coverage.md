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
9. **Strict command-policy ratchet (new final slice).** After the policy
   slices, the manifest declares an expected command set per `direct` table
   (for example `direct:SIUD`, and a narrower declared set for genuinely
   append-only tables such as the select+insert tables above) and the
   classifier enforces exactly that set, so a table that silently loses a
   command policy (or silently gains one) fails the gate. Evidence (observed
   in the `omnifood_schema_build_test` scenario-1 catalog, `pg_policies`, 142
   rows): 16 of the 42 `direct` tables currently have fewer than the four
   per-command policies — `kardex_correction`, `kardex_recalculate_queue`,
   `sys_parametros_config` (each carries exactly ONE `FOR ALL` policy row and
   ZERO per-command SELECT/INSERT/UPDATE/DELETE policies while FORCE RLS is
   on — an explicit keep-FOR-ALL-vs-per-command decision is required, not an
   assumption); `device_sync_credential_events`,
   `human_auth_policy_epochs`, `human_auth_policy_snapshots`,
   `human_auth_recovery_events`, `human_auth_terminal_ack_history`,
   `human_auth_verification_events`, `inventory_remediation_receipts`,
   `tenant_topology_revisions` (SELECT+INSERT only);
   `human_auth_recovery_tokens`, `human_auth_rollout_cohorts`,
   `human_auth_tenant_publication_state`, `human_auth_terminal_ack_floor`,
   `inventory_sync_outbox` (SELECT+INSERT+UPDATE only, no DELETE).
   `sys_parametros_config` is referenced in production through
   `SystemParametersConfigActiveView` (`fiscal-config-version.service.ts`,
   `fiscal-setup.service.ts`) and is immutable by trigger
   (`trg_sys_parametros_config_immutable` / `reject_sys_parametros_config_mutation`),
   so its zero-per-command state needs a decided target set (likely
   `direct:S`-style append-only or a documented FOR ALL equivalent), not a
   default. This slice must land together with the review of those 16
   tables: declared sets that are stricter than current reality go red on
   their own, so the review decides each table's target and the ratchet is
   born green.

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

### Slice 2 part A — transaction bindings on the five recipe/production tables

- **Mapping facts (part A keeps the `debt` classification).** All five
  slice-2 tables — `recipes`, `recipe_versions`, `recipe_details`,
  `uom_conversions`, `batches` — carry `tenant_id` DIRECTLY, so they are
  eligible for the `direct` classification, but in part A all five stay
  classified `debt` in the manifest; they become `direct` only in part B,
  when their policy slice adds FORCE RLS and flips the manifest entries (the
  manifest itself is NOT touched in this part).
  `parent-owned` is reserved for child tables WITHOUT a `tenant_id` column
  (today: `invoice_item_modifiers`, `invoice_payments`,
  `production_order_lines`, `security_profiles`, `shrinkage_details`); none
  of the five belongs there and none was reclassified.
- **Fail-closed semantics.** Under FORCE RLS, an UNBOUND access does not
  leak across tenants: `current_setting('app.tenant_id', true)` is NULL, so
  the policy predicate evaluates false/NULL and the access fails CLOSED
  (zero rows, or an error on write) — it is never a data leak. Binding makes
  the legitimate path work; the `tenant_id` WHERE predicates in the queries
  stay as defense in depth and are NOT an RLS substitute.
- **Binding work (file:line).**
  - `src/modules/inventory/recipe.service.ts:102` `createNewVersion` —
    deactivate-prior-active + version insert + details insert now ride ONE
    `runInTenantTransaction`; repositories resolve from the bound manager.
  - `:172` `findActiveVersion` — bound read.
  - `:193` `publishDraftVersion` — draft read, prior-active deactivation and
    publication save in ONE bound transaction (draft/active lifecycle
    semantics and error messages unchanged).
  - `:255` `getSnapshot` — version + components reads in ONE bound
    transaction (also serves `ProductionService.processOrder` and the
    replay close path).
  - `:352` `ingestPosVersion` error-recovery lookup — was the last pooled
    `RecipeVersion` read; now bound.
  - `:391` `persistPosVersion` — UNCHANGED (already bound in slice 1 part
    A); product lock stays the first row-level statement.
  - `src/modules/onboarding/adapters/operations-readiness.adapter.ts:62` —
    the `recipe_versions` readiness count now reads through the bound
    transaction manager (same transaction as the categories read).
  - `src/modules/inventory/production.service.ts:277-281` `processOrder` —
    the transaction keeps its requested `'SERIALIZABLE'` isolation;
    `bindTenantContext(manager, input.tenantId)` runs inside it BEFORE the
    first protected access, and the per-insumo `Batch` candidate reads moved
    from the pooled `batchRepo` to `manager.getRepository(Batch)` (:281).
    Blank or missing tenant fails closed (`TenantContextRequiredError`)
    before any SQL; `getSnapshot` (itself bound) runs before the
    transaction and fails closed for a blank tenant too.
- **Injected pooled repositories kept.** The unused `@InjectRepository`
  parameters on `RecipeService` (`recipeVersionRepo`, `recipeDetailRepo`),
  `OperationsReadinessAdapter` (`recipeVersionRepository`) and
  `ProductionService` (`batchRepo`) were deliberately kept: removing them
  would change constructor signatures for no behavioral gain, and DI
  fixtures keep providing the tokens.
- **Binding regression guards (fixtures).** Each guard fails if the binding
  is reverted, because the revert skips `runInTenantTransaction` entirely:
  no transaction opens and no transaction-local `set_config` runs.
  - `recipe-draft-lifecycle.spec.ts` — `findActiveVersion` and
    `publishDraftVersion`: asserts `dataSource.transaction` was opened,
    `txManager.getRepository(RecipeVersion)` resolved the read, and
    `txManager.query(TENANT_CONTEXT_SET_CONFIG_SQL, ['tenant-1'])` preceded
    the first repository call. Reverting to the pooled `this.recipeVersionRepo`
    fails `expect(dataSource.transaction).toHaveBeenCalled()` first.
  - `recipe.service.spec.ts` — `getSnapshot`: asserts the transaction opened,
    `manager.getRepository` resolved `RecipeVersion` AND `RecipeDetail`, and
    the `set_config` binding preceded `recipeVersionRepo.findOne`. Reverting
    to the pooled repos fails the `dataSource.transaction` assertion.
  - `recipe.service.spec.ts` — `createNewVersion` ("creates new immutable
    recipe version and computes net usable quantity"): the previously
    binding-agnostic expectations now also assert the bound behaviour —
    `dataSource.transaction` opened, `manager.getRepository` resolved
    `RecipeVersion` AND `RecipeDetail`, and
    `manager.query(TENANT_CONTEXT_SET_CONFIG_SQL, ['tenant-A'])` preceded the
    first protected access (`recipeVersionRepo.findOne`). Reverting
    `createNewVersion` to the injected pooled repositories fails
    `expect(dataSource.transaction).toHaveBeenCalled()` first. For
    `createNewVersion` this unit guard is the SOLE protection until part B:
    `recipe_versions`/`recipe_details` still have no FORCE RLS (they stay
    `debt` until the part B policy slice), so a pooled revert is invisible to
    the DB suites and e2e — only this guard catches it. The semantic
    assertions the test already made (prior-active deactivation, new version
    row, detail rows, number/`is_active` behaviour, error cases) are kept
    unchanged; the guard was appended, nothing was deleted or relaxed.
  - `operations-readiness.adapter.spec.ts` — `recipe_versions` readiness
    count: asserts `txManager.query(set_config, ['tenant-bound'])` preceded
    `recipeVersionRepo.count` and `txManager.getRepository` was called with
    `RecipeVersion`. Reverting to the pooled repository fails both.
- **Inbound-sync fail-closed (slice 2 part A).** `inbound-sync.service.ts`
  removed the pooled fallback for `recipes` (`fetchRecipeDeltas`),
  `recipe_versions` and `recipe_details` (`fetchRecipeVersionDeltas`,
  including the component-detail and component-insumo reads): a missing
  bound manager now throws `InternalServerErrorException` with the same
  shape as slice 1 — `Inbound recipe sync requires a tenant-bound
  transaction manager (app.tenant_id binding)` and `Inbound recipe version
  sync requires a tenant-bound transaction manager (app.tenant_id binding)`
  — before any SQL. Untenanted tables (catalog values, users, alerts) keep
  their previous path. `inbound-sync.service.spec.ts` covers the fail-closed
  case for `types=recipes` and `types=recipeversions` (asserting the pooled
  recipe/version/detail/insumo query builders are never touched).
- **Fixtures adapted (why).**
  - `recipe-draft-lifecycle.spec.ts` — constructed `RecipeService` with `{}
    as any` dataSource; the bound methods now open transactions, so the
    fixture's dataSource runs the callback against a manager exposing the
    mocked repos.
  - `recipe.service.spec.ts` — the duplicate-`pos_document_id` retry test
    now observes THREE transactions (failed persist, bound recovery lookup,
    retry persist) instead of two.
  - `operations-readiness.adapter.spec.ts` — the tx-manager mock maps
    `RecipeVersion` to the recipe repo mock because the readiness count now
    resolves from the manager.
  - `production.service.spec.ts` — no change needed: its manager mock
    already maps `Batch` and its `managerBatchRepo.find` delegates to
    `batchRepo.find`, so processOrder keeps its assertions green.
  - `inbound-sync.service.spec.ts`, `terminal-priming.db.spec.ts`,
    `industry-template.service.spec.ts`,
    `industry-template-safe-cutover.spec.ts`, `recipe-routes.e2e-spec.ts` —
    verified NOT affected by the binding (they do not exercise the newly
    bound code paths positionally, or run against a real database where
    binding is transparent); left untouched.

| Slice | PR / commit | Verification |
| --- | --- | --- |
| Slice 1 part A (this branch `fix/512-catalog-bindings`) | this PR | serial `nest build`; `npm run test:db` (256 pass); `bash scripts/verify-schema-build.sh` (79/79 coverage, 0 failures); scoped eslint; `git diff --check`; e2e recipe-routes 11 pass, loyalty-profit-aware 1 pass, activation-attempt-rls 8 pass (assertions untouched); shrinkage.service.spec 6 pass with binding-order + fail-closed tests |

## Known environmental failures (pre-existing, out of scope)

- `test/inventory/batch_6b_baseline_validation.spec.ts`
  (registerMovement / `MovementType.OUT`): present at HEAD commit a9a381d4;
  not touched by this work.
