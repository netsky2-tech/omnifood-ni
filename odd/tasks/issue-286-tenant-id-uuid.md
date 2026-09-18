# Issue #286 — Converge `tenant_id` on `uuid`

**Issue:** [#286](https://github.com/netsky2-tech/omnifood-ni/issues/286) — `fix(db): reconcile column type drift between synchronize-provisioned and migration-built databases`
**Decision authority:** user comment on #286, 2026-09-18T04:41:22Z ("Decision: converge on `uuid`", five phases). Two of its claims are refined below with measured evidence; neither is overturned.
**Status:** Phase 1 **complete**. Phases 2–5 planned, not started. No code written.

---

## Objective

Every `tenant_id` column becomes `uuid`; every RLS policy guarding a tenant column is rewritten to the target predicate form in the same transaction as its column; the foreign keys the type mismatch made undeclarable get declared; and the schema build check learns to assert column types so the drift cannot return.

## Safety and scope constraints

- The last environment state that left `varchar` and `uuid` mixed produced a real production-shaped failure: `ERROR: operator does not exist: character varying = uuid` when joining `onboarding_telemetry_events` to `tenants`. The end state must be uniform, not partially migrated.
- Every unit runs as one transaction. PostgreSQL makes the column change impossible while a policy depends on the column (see Mechanics §1), so no window exists where isolation is off — provided drop, alter and create stay in one migration.
- **Review workload:** the policy rewrite alone is ~94 policies. At the repository's existing policy-block style this does not fit in 400-line units; see "Phase 2 slicing" for the arithmetic and the two options.

---

## Phase 1 — COMPLETE

Verify in every environment that each stored `tenant_id` value is a valid UUID. A single non-UUID value aborts the `::uuid` cast mid-migration with rows already processed.

| Environment | Provisioned by | `tenant_id` varchar columns | rows scanned | NULL | empty | non-UUID |
| --- | --- | --- | --- | --- | --- | --- |
| local `omnifood` @ 127.0.0.1:5432 | TypeORM `synchronize` | 33 (32 tables + 1 view) | 197 | 0 | 0 | **0** |
| staging `nhilos-pos` / `Postgres` (`tokaido.proxy.rlwy.net`, db `railway`) | migrations only | 44 (43 tables + 1 view) | 11 | 0 | 0 | **0** |

Both **PASS**. Staging was reached with the Railway CLI (`~/.local/bin/railway`, 5.57.9) through `DATABASE_PUBLIC_URL`.

### Reproduce

```sql
SELECT format($f$SELECT %L, count(*),
  count(*) FILTER (WHERE tenant_id IS NULL),
  count(*) FILTER (WHERE tenant_id::text = ''),
  count(*) FILTER (WHERE tenant_id::text <> ''
    AND tenant_id::text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
  FROM public.%I;$f$, c.table_name, c.table_name)
FROM information_schema.columns c
WHERE c.table_schema = 'public' AND c.column_name = 'tenant_id'
  AND c.data_type IN ('character varying', 'character', 'text')
  AND c.table_name NOT IN (SELECT viewname FROM pg_views WHERE schemaname = 'public')
ORDER BY c.table_name;
```

Feed the output back through `\gexec`, or write it to a file and run it with `psql -At -f`.

### Two caveats that decide whether this evidence means anything

1. **It must run as a role with `rolbypassrls`.** As the runtime role, RLS hides every other tenant's rows — and the non-UUID values along with them. The check then reports a clean PASS over a filtered view of the data. The staging verification ran as `postgres` (`rolsuper = t`, `rolbypassrls = t`) with 32 RLS tables present in `public`. Any future verification query inherits this requirement.
2. **The sample is thin.** 11 rows on staging (1 `onboarding_sessions`, 10 `onboarding_telemetry_events`), 197 locally. A manual check that was true when taken proves nothing about the data at migration time. Its durable form is the in-migration pre-flight in Unit 0.

### Environment note

`v_sys_parametros_config_active` is a **view** carrying a `tenant_id` column, present in both environments. Any loop over `information_schema.columns` must exclude views or the migration will attempt to `ALTER` a view.

---

## Measured scope

Source: staging `pg_catalog` plus `apps/admin_backend/src/migrations/**` on `main`.

| Metric | Value |
| --- | --- |
| `tenants.id` (the FK target) | `uuid` |
| varchar `tenant_id` tables | 43 |
| tables carrying RLS policies | 30 |
| policies on varchar-`tenant_id` tables — **all must change** | **94** |
| policies already in the target form | 4 (`product_inventory_mapping_versions`) |
| policies with a pre-existing index loss | 4 (`invoices`) |
| total policies in `public` | 102 |
| indexes referencing `tenant_id` | 124 |
| existing foreign keys on `tenant_id` | **0** |
| migration files containing the breaking predicate form | 18 |

---

## Mechanics — measured, not assumed

### 1. PostgreSQL forbids the column change while a policy depends on it

```
ERROR:  cannot alter type of a column used in a policy definition
DETAIL:  policy catalog_values_tenant_select on table catalog_values depends on column "tenant_id"
```

Verified on the local database inside a transaction that was rolled back; the type and all four policies were unchanged afterwards. **The failure is loud and immediate**, which is the good outcome: there is no silent partial migration.

### 2. The required order follows from §1

```sql
DROP POLICY <every policy on the table>;
ALTER TABLE <table> ALTER COLUMN tenant_id TYPE uuid USING tenant_id::uuid;
CREATE POLICY <the same policies> ... USING (tenant_id = current_setting('app.tenant_id', true)::uuid) ...;
```

All three steps in one migration, therefore in one transaction.

### 3. Three predicate forms exist in the migration sources

| Form | Extent | With a varchar column | With a uuid column |
| --- | --- | --- | --- |
| `tenant_id = current_setting('app.tenant_id', true)` | **54 lines across 18 files** | works; the planner strips the implicit relabel and produces an `Index Cond` | **breaks:** `operator does not exist: uuid = text` |
| `tenant_id = current_setting('app.tenant_id', true)::uuid` | 4 lines, `1802000000000` | `operator does not exist: character varying = uuid` | correct; `Index Cond` |
| `tenant_id::text = current_setting(...)` | 1 line, `1782000000000` (`invoices`) | n/a | works, but degrades to a `Filter` — the index stops restricting rows |

Breaking-form counts per file: `1781000000000` (10), `1807000000000` (7), `1768000000000` (5), `1776000000000` (5), `1785000000000` AddBatch6bCostingLifecycle (4), `1785000000000` AddTenantCapabilityEvent (4), `1795000000000` (4), `1784000000000` (2), `1794000000001` (2), `1806000000000` (2), `1808000000000` (2), and one each in `1780000000000`, `1809000000000`, `1809000000001`, `1809010000000`, `1809020000000`, `1809040000000`, `1809050000000`.

**The decision comment says "all 102 RLS policies must change in the same migration." Measured: 94 must change.** The other eight keep working: four are already correct, four merely lose their index.

### 4. `pg_policies` is not a reliable source for the authored predicate text

A policy written as a bare compare is reported by `pg_policies` as:

```
((tenant_id)::text = current_setting('app.tenant_id'::text, true))
```

because PostgreSQL deparses the **implicit** `varchar → text` coercion as an explicit cast. An author-written `::text` renders identically. **The two are indistinguishable from `pg_policies`** — verified by reading `catalog_values_tenant_select`, written bare at `1768000000000-CreateCatalogValues.ts:51`, reported with `::text` by the catalog.

Consequence, and the reason this is written down: **never generate this migration by dumping `pg_policies` and replaying it.** The replay bakes in `(tenant_id)::text`, which after the type change is exactly the index-losing form from §3. Extract the structural metadata — it is reliable — and hand-write the predicate:

```sql
SELECT tablename, policyname, cmd, permissive, roles,
       (qual IS NOT NULL) AS has_qual, (with_check IS NOT NULL) AS has_with_check
FROM pg_policies WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

This re-run produces 102 rows and must be taken fresh immediately before writing each unit.

### 5. Index evidence (`EXPLAIN`, staging, `enable_seqscan = off`)

| Column | Predicate | Plan |
| --- | --- | --- |
| varchar | bare / `::text` | `Index Only Scan ... Index Cond: (tenant_id = current_setting(...))` |
| varchar | `::uuid` | `ERROR: operator does not exist: character varying = uuid` |
| uuid | `::text` | `Index Only Scan ... Filter: ((tenant_id)::text = ...)` — no longer restricts rows |
| uuid | `::uuid` | `Index Only Scan ... Index Cond: (tenant_id = (... )::uuid)` |

The target form is `::uuid` on the setting side. `product_inventory_mapping_versions` already does this in all four of its policies — **`1802000000000-CreateProductInventoryMappingVersions.ts` is the reference implementation to copy.** No expression index on `tenant_id::text` exists anywhere, so the `::text` form has nothing to fall back on.

---

## Decisions — both open questions are resolved

### Decision 1 — `products.product_type` converges on the **enum**

Recorded by the user on 2026-09-18. The evidence, all measured:

| Evidence | Says |
| --- | --- |
| The entity **today** | `@Column({ type: 'enum', enum: ProductType, default: ProductType.SIMPLE })` |
| The entity **in history** | `c314381` *introduced* the column already as `enum`; before that commit the column did not exist. A varchar form never existed on the entity. |
| Migration `1759000000002` | creates `products_product_type_enum` (`SIMPLE, COMPOUND, PREPARED, VARIANT_PARENT`) and declares the column with it |
| The create DTO | `@IsEnum(ProductType)` — no value outside the four labels is writable through the API |
| Code | 3 references, all against `ProductType` members. No index or constraint on the column |
| Staging | enum; **`products` has 0 rows** |
| Local dev | `character varying(20)`, holding only `SIMPLE` (32 rows) |

**The issue's framing was wrong.** It called this column "synchronize-provisioned". `synchronize: false` is fixed in `data-source.ts` and a spec asserts it inside and outside tests. The varchar form actually lives in **two test harnesses** that hand-create `products` (`test/fulfillment/fulfillment-rollout-pilot.e2e-spec.ts:145`, `modules/fulfillment/services/fulfillment-rollout.service.db.spec.ts`) — deliberately simplified fixtures, like the varchar tenant fixture in the predicate work — and in the local dev database, whose `varchar(20)` **has no provenance in this repository**: no `.sql` declares it, the harnesses declare it without a length, and the entity never did.

**Why every existing check missed it.** The bootstrap group is `IF NOT EXISTS` throughout (29 × `CREATE TABLE IF NOT EXISTS`, 3 × `ADD COLUMN IF NOT EXISTS`). The schema build check *does* re-run `1759000000002` in scenario 2 against a schema where the tables already exist — it re-runs, does nothing, and reports PASS. **This class of drift is structurally undetectable by the current harness**, and the ratchet hardcodes `column_name = 'tenant_id'` in both assertions, so non-tenant column types have no detector at all. Same defect class as the `1782000000000` re-run problem fixed in Unit 0.

**Consequence for Phase 2:** `product_type` needs **two** things, not one — a reconciling migration (a no-op where the column is already the enum, and a loud failure on a value outside the labels, since only the local database's value set is known), **and** a harness assertion so it cannot return. Feasibility: local is `{SIMPLE}` ⊂ the labels; staging is already the enum and empty; every other environment is unknown, so the migration must fail loudly rather than coerce.

### Decision 2 — adopt `::uuid` predicates, and close the tenant-binding guard gap **first**

Recorded by the user on 2026-09-18: the guard gap is closed before any of the 94 policies is touched.

The question was framed as "what should an empty `app.tenant_id` do". Measured, the reachable states are:

| Setting state | Text predicate (today) | `::uuid` predicate |
| --- | --- | --- |
| **UNSET** | 0 rows | **0 rows** — `current_setting(..., true)` is NULL, `NULL::uuid` is NULL, the comparison is NULL, so it denies quietly |
| **empty string** | 0 rows (quiet deny) | `set_config` **accepts it**, and the first policy evaluation raises `invalid input syntax for type uuid: ""` |

So **UNSET is safe in both forms**, and the only hazard is a literal empty string — whose failure is **deferred and opaque**, not a clean rejection at the boundary.

**And the hazard is reachable.** `core/database/tenant-transaction.ts` exports a guarded `bindTenantContext()` / `resolveTenantContextId()` that throws `TenantContextRequiredError` before any SQL, but **three services re-implemented that helper privately and unguarded**:

| File | What it does |
| --- | --- |
| `modules/fulfillment/services/fulfillment-retention.service.ts:29` | private copy, no validation |
| `modules/fulfillment/services/fulfillment-rollout.service.ts:86` | private copy, no validation |
| `modules/sales/services/invoices.service.ts:1179` | private copy via a SQL constant, no validation |

Roughly **14 write sites can pass a blank** against ~6 correctly guarded ones. The most exposed are `modules/identity/guards/sync-transport.guard.ts:99` (`deviceClaims.tenant_id` passed raw, on a sync route), `modules/inventory/production.service.ts:138`, `modules/inventory/inventory-purchase.service.ts:128,274`, `modules/inventory/services/product-inventory-mapping.service.ts:24,49`, `modules/sales/services/inbound-sync.service.ts:235`, `modules/identity/services/tenant-capability.service.ts:88`, `modules/fulfillment/services/tenant-topology-revision.service.ts:104`, and `modules/identity/services/device-sync-credential.service.ts:106,245` (a `.trim()` with no emptiness check). Correctly guarded: `modules/catalog/catalog.service.ts:102` and `modules/inventory/product.service.ts:42` (a local `requireTenant`), `modules/identity/human-authorization/rls/ohac-tenant-transaction.ts:37`, and `device-sync-credential.service.ts:400,448,503`.

**Consequence for Phase 2:** the prerequisite is not a behaviour choice, it is a bounded hardening — delete the three private duplicates, route every writer through the shared guarded helper, and add the missing check at the raw sites. Roughly 14–17 call sites across ~10 files. Choosing "the empty setting denies" without closing the gap would mean choosing that a programming error surfaces as an opaque 500 in production.

### Still open


**The tenant guard is closed and now unified on 401 (#337).** Measured before changing anything: 21 files throw `UnauthorizedException('Tenant context is required')` and 19 more define a private `requireTenant` doing the same, all answering 401. Only two mechanisms answered 400 — `AllExceptionsFilter`'s mapping of `TenantContextRequiredError` and the OHAC helper's `requireTenantId` — and they were the outlier.

**Why 401 is the right status, from measurement not taste:** the tenant is credential-derived. `GetTenantId` in `core/decorators/tenant.decorator.ts` returns `request.devicePrincipal?.tenantId ?? request.user?.tenant_id` and never reads a body or header field. A missing tenant therefore means the presented credential did not establish a tenant scope, which is an authorization failure rather than a malformed request.

**Recorded follow-up, deliberately not done:** the **19 private `requireTenant` copies**. They already answer 401, so nothing is inconsistent; consolidating them is a mechanical refactor across 19 files in unrelated domains with no open design question. An earlier draft of this plan would have folded it into the status change, which would have buried the only real decision in kilobytes of repetitive diff.


**Tables with a varchar `tenant_id` but no RLS policy** — `tenant_fulfillment_records`, `promotions`, `customers`, `customer_point_transactions`, `audit_integrity_alerts`, `forensic_alerts` and the legacy/privacy tables. They still need the column change; they carry no policy work. Whether to add policies to them is out of scope for #286 and must not be smuggled in.

---

## Phase 2 slicing — proposed review units

Principle: one migration per unit, one transaction per unit, each unit carrying the tables **and every policy guarding them** so the drop → alter → create cycle is self-contained.

The 43 varchar tables plus `invoices` (already `uuid`, but its predicates need rewriting) partition cleanly into six domain batches. All counts below are measured, not estimated.

| Unit | Domain | Tables | Policies | Table names (policies in parentheses) |
| --- | --- | --- | --- | --- |
| **0** | Pre-flight guard + harness coverage | — | — | **DONE — merged as #319, #323, #321.** The tenant-column ratchet, the predicate-form assertion scoped to uuid columns, the adaptive predicate fix, and the forward `invoices` migration. The non-UUID pre-flight was re-scoped: the `ALTER` is already the guard. |
| **0b** | Tenant-binding guard gap | — | — | **Prerequisite, from Decision 2, before any policy is touched.** Delete the three private unguarded copies of `bindTenantContext`, route every `set_config('app.tenant_id', ...)` writer through the shared guarded helper, and add the missing emptiness check at the raw sites. ~14–17 sites across ~10 files. No migration. |
| **0c** | Harness coverage for non-tenant column types | — | — | **New, from Decision 1.** The ratchet hardcodes `tenant_id`, so `products.product_type` drift and the `IF NOT EXISTS` non-reconciliation class are both invisible. Extend the check so they cannot return. |
| **1** | Inventory & Kardex | 10 | 27 | `inventory_kardex` (8), `inventory_purchase_documents` (4), `inventory_sync_outbox` (3), `inventory_sync_receipts` (4), `inventory_remediation_receipts` (2), `kardex_correction` (1), `kardex_recalculate_queue` (1), `production_batch_history` (4), `product_import_sessions` (0), `staging_importacion_productos` (0) |
| **2** | Onboarding & fiscal | 10 | 21 | `onboarding_activation_attempts` (4), `onboarding_activation_check_results` (4), `onboarding_activation_follow_ups` (4), `onboarding_telemetry_events` (4), `onboarding_sessions` (0), `onboarding_idempotency_records` (0), `onboarding_template_applications` (0), `onboarding_template_seed_links` (0), `fiscal_config_revisions` (4), `sys_parametros_config` (1) |
| **3** | OHAC / human authorization | 9 | 22 | `human_auth_policy_epochs` (2), `human_auth_policy_snapshots` (2), `human_auth_recovery_events` (2), `human_auth_recovery_tokens` (3), `human_auth_rollout_cohorts` (3), `human_auth_tenant_publication_state` (3), `human_auth_terminal_ack_floor` (3), `human_auth_terminal_ack_history` (2), `human_auth_verification_events` (2) |
| **4** | Tenant lifecycle & devices | 7 | 16 | `tenant_capability_event` (4), `tenant_topology_revisions` (2), `tenant_fulfillment_records` (4), `device_sync_credentials` (4), `device_sync_credential_events` (2), `audit_integrity_alerts` (0), `forensic_alerts` (0) |
| **5** | Catalog, loyalty & legacy import | 6 | 4 | `catalog_values` (4), `promotions` (0), `customers` (0), `customer_point_transactions` (0), `legacy_import_integrity_reports` (0), `legacy_onboarding_migration_receipts` (0) |
| **6** | Sales | 2 | 8 | `invoice_items` (4, varchar → uuid), `invoices` (4, already uuid — `::text` → `::uuid` only) |
| **7** | Declare the foreign keys | — | — | Phase 3. Only possible once a column is `uuid`. 43 candidate constraints; none exist today. |
| **8** | `products.product_type` | 1 | 0 | **Decided (Decision 1): converge on the enum.** Reconciling migration — a no-op where the column is already the enum, a loud failure on a value outside the labels. Depends on 0c. |

Totals: 44 tables, 98 policies touched. 98 + the 4 that need no change = 102. ✔

### Unit 0b — task breakdown (the prerequisite from Decision 2)

The guard already exists once, as `bindTenantContext()` / `resolveTenantContextId()` in `core/database/tenant-transaction.ts`, and it throws before any SQL is issued. The work is adoption, not invention. Split it because the foundation is independently reviewable and everything else depends on its shape.

| Task | What | Files |
| --- | --- | --- |
| **0b-1** | **DONE — #331.** Widen the helper so both an `EntityManager` and a `QueryRunner` can bind (some sites hold a query runner, not a manager), and map `TenantContextRequiredError` to **400** in `AllExceptionsFilter`, which today sends every non-`HttpException` to 500. Without the mapping the guard would trade an opaque SQL error for an opaque 500. | `core/database/tenant-transaction.ts`, `main.ts`, plus specs |
| **0b-2** | **DONE — #333.** Delete the three private unguarded copies (`fulfillment-retention.service.ts:29`, `fulfillment-rollout.service.ts:86`, `invoices.service.ts:1179`) and call the shared helper. | 3 services |
| **0b-3** | **DONE — #334.** Route the remaining raw writers through the shared helper, one blank-rejection test per touched service. The exposed set includes `identity/guards/sync-transport.guard.ts:99` (raw device claim on a sync route), `inventory/production.service.ts:138`, `inventory/inventory-purchase.service.ts:128,274`, `inventory/services/product-inventory-mapping.service.ts:24,49`, `sales/services/inbound-sync.service.ts:235`, `identity/services/tenant-capability.service.ts:88`, `fulfillment/services/tenant-topology-revision.service.ts:104`, and `identity/services/device-sync-credential.service.ts:106,245`. Split by module group if the review size demands it. | ~10 files |

Already guarded, so no change: `catalog.service.ts:102` and `product.service.ts:42` (a local `requireTenant`), `identity/human-authorization/rls/ohac-tenant-transaction.ts:37`, and `device-sync-credential.service.ts:400,448,503`.

**Unit 0b is CLOSED.** Enumerating every writer of `app.tenant_id` on `main` (`34677f6`) confirms no writer can pass a blank: `catalog.service.ts:102` and `product.service.ts:42` sit behind a private `requireTenant`, `device-sync-credential.service.ts` sites at 393/441/496 carry inline emptiness checks, and everything else — including the eleven raw sites and the three private copies — now calls the shared `bindTenantContext`. The one apparent exception, `device-sync-credential.service.ts:231`, is a JSDoc comment mentioning `set_config`, not a call site.

**The original done condition was over-specified and is corrected here.** It read "every writer passes through `resolveTenantContextId`". An equivalent inline emptiness check also closes the hole, and three sites do exactly that. The substantive requirement — no blank can reach `set_config` — is what mattered and it is met; requiring one specific helper was an unnecessary constraint.

**Two behaviours recorded rather than changed:**
- `device-sync-credential.service.ts:241` — `renewAccessToken` keeps the binding conditional on `dto.declarativeTenantId?.trim()`, because that DTO field is **optional** and about ten existing tests exercise renewal without it. A blank-but-present value therefore skips binding silently: no SQL, no rejection. Making it unconditional would throw for legitimate calls.
- The `inbound-sync.service.ts` binding now sits inside that method's pre-existing `try`/`catch`, so a binding failure is caught there.

Then Phase 2 may touch the 94 policies.

### The size arithmetic, stated plainly

At the repository's existing style each policy costs a one-line `DROP POLICY IF EXISTS` plus a ~16-line `DO $$ ... IF NOT EXISTS ... CREATE POLICY ... $$` block. With a mirrored `down()` that is roughly **34 review-facing lines per policy**.

| Unit | Policies | Approximate review-facing lines |
| --- | --- | --- |
| 1 | 27 | ~950 |
| 2 | 21 | ~740 |
| 3 | 22 | ~780 |
| 4 | 16 | ~570 |
| 5 | 4 | ~165 |
| 6 | 8 | ~300 |

**Units 1–4 exceed the 400-line review budget and must be split further**, at roughly 11 policies per PR. That means the policy rewrite alone is **~9 pull requests** plus Unit 0, Unit 7, Unit 5 and Unit 6. Phase 2 is on the order of 3,000 review-facing lines.

### How the predicate is carried: one shared definition (DECIDED)

Decided by the user on 2026-09-18, superseding this plan's earlier recommendation of explicit per-policy SQL. The reason changed after Unit 0b: four duplicated tenant guards were exactly what produced that gap, and writing the predicate 94 times recreates the same shape at larger scale.

| | Explicit per-policy SQL | **One shared definition (chosen)** |
| --- | --- | --- |
| Pull requests | ~9 | ~3 |
| Review-facing lines | ~3,000 | far less; the repeated part becomes data |
| Places the cast can be wrong | 94 | **1** |
| What the unit carries | 94 near-identical blocks | the shared emitter plus a list of `(table, policy_name, cmd, has_check)` rows |

The predicate lives in one place, so a wrong cast cannot be introduced 94 times. The SQL is no longer visible line-by-line in each migration, which is the cost accepted — and the harness assertion below is what makes that cost acceptable, because the *outcome* is machine-checked rather than proofread.

**The shared emitter's contract, to be written once in the first slice:**
- Input: the target predicate string, defined once as the target form `tenant_id = current_setting('app.tenant_id', true)::uuid`.
- Per row: `(table, policy_name, cmd, has_check)`; `cmd` drives `USING` and/or `WITH CHECK` exactly as the four shapes already established for the `invoices` policies.
- Order per table: `DROP POLICY IF EXISTS` for every policy, then the column `ALTER`, then the guarded `CREATE POLICY` — the order PostgreSQL forces, all inside one transaction.
- `down()` mirrors it, restoring the previous predicate form.
- Rows come from the `pg_policies` **structural** metadata (which is reliable), never from its predicate text (which is a deparse and cannot distinguish a bare compare from a written cast).

### Harness extensions (Unit 0)
### Harness extensions (Unit 0)

1. **Column-type assertion** — for every tenant-scoped column the entities declare, assert the type is `uuid`. This is Phase 5 and the fourth layer of `apps/admin_backend/scripts/verify-schema-build.sh`, alongside tables, columns, RLS enforcement and the tenant predicate. It is also the check that would have caught this drift in the first place.
2. **Predicate-form assertion** — every policy on a tenant column must compare via `current_setting('app.tenant_id', true)::uuid`; a `tenant_id::text` comparison fails the build.
3. **Non-UUID pre-flight** — the Phase 1 query as a guard that aborts before any `ALTER`. Keep it even though Phase 1 passed: the sample is thin, and the guard is what makes the pass irrelevant.

Each new assertion must be proven able to fail by mutating the scratch database, the same way the four existing layers were.

---

## Unit 0 — Guards and harness coverage (IN PROGRESS)

Branch `feat/tenant-uuid-type-guards`, worktree `/home/octavio_morales/omnifood-ni-worktrees/issue-286-unit-0`, based on `origin/main` @ `2cd59a6`.

### Design decision: the column-type assertion is a ratchet, not a hard assertion

Asserting "every tenant-scoped column is `uuid`" would fail today — 44 are varchar — and leave CI red until every Phase 2 unit lands. The repository already holds the canonical answer for this shape of problem, the fail-closed ratchet specified in `openspec/changes/restore-admin-backend-ci-baseline` (issue #234):

> Actual normalized failures are a subset of the reviewed manifest and no integrity guard fails.
> Manifest direction: **Downward only.** Additions need a separately approved baseline-change decision.

Unit 0 follows that convention instead of inventing one. The manifest is `apps/admin_backend/scripts/schema-tenant-type-manifest.txt` — deliberately **not** `ratchet-manifest.json`, which is A1b's lint/test-failure manifest and an unrelated concern.

| # | Assertion | Direction it enforces | Fails today? |
| --- | --- | --- | --- |
| A | Every varchar/text `tenant_id` column in the built schema appears in the manifest | No new drift | No — the manifest is generated from today's state |
| B | Every manifest entry still exists and is still varchar | No stale entries; forces the manifest to shrink as Phase 2 lands | No |
| C | Every `tenant_id` column that is not varchar/text is `uuid` | No third type creeping in | No |
| D | For every policy guarding a `uuid` `tenant_id` column, no expression casts the column to text | Predicate form | **Yes — exactly 4, all on `invoices`** |
| E | Non-UUID values abort before any `ALTER` | Diagnostics only (see task 0.4) | No |

**Assertion D must be scoped to `uuid` columns, and that scope is the whole point.** PostgreSQL deparses an *implicit* `varchar → text` coercion as an explicit `::text`, so on a varchar column every working policy reads as `(tenant_id)::text = ...` whether or not its author wrote the cast. Asserting the form on varchar columns would flag 94 policies for a reason that does not exist. The scope is not a convenience: without it, the assertion is the `pg_policies` deparse trap wearing a harness costume.

### Tasks

| # | Task | Acceptance evidence |
| --- | --- | --- |
| 0.1 | Column-type manifest plus assertions A, B, C in `verify-schema-build.sh`, run in **both** scenarios | **DONE** — see the evidence below. |
| 0.2 | Assertion D in `verify-schema-build.sh` | **DONE** — RED captured: 5 expressions, all on `invoices`. |
| 0.3 | Migration realigning the 4 `invoices` policies to `current_setting('app.tenant_id', true)::uuid`, plus its `.spec.ts`. `invoices.tenant_id` is already `uuid`, so there is no column change. | **DONE** — `EXPLAIN` before/after: `Filter` → `Index Cond`. Harness green in both scenarios. |
| 0.5 | **Found by the harness, not in the plan:** `1782000000000` is not re-run safe. Make its predicate per table, or a re-run of that earlier migration silently reverts any later fix. | **DONE** — provenance below. |
| 0.4 | Non-UUID pre-flight guard | Verify the claim that `ALTER COLUMN ... TYPE uuid USING tenant_id::uuid` is **already atomic and loud** inside a transaction, which would make its field guard redundant: the pre-flight then buys error quality, not safety. Prove it with a non-UUID value in a rolled-back transaction. If confirmed, reduce the task to a single shared helper plus a documented note, and say so in the migration comment. |

### Evidence — task 0.1

Files: `apps/admin_backend/scripts/schema-tenant-type-manifest.txt` (new, 44 entries: 43 base-table columns and 1 view) and `apps/admin_backend/scripts/verify-schema-build.sh` (+94/−2). Does not touch `.github/workflows/`, so it cannot collide with the uncommitted A1a work in the `admin-ci-a1a` worktree.

**Green baseline.** `bash scripts/verify-schema-build.sh` exits 0. Both scenarios report:

```
non-uuid tenant columns: 44
tenant-type manifest   : 44
unlisted (new drift)   : 0
stale manifest entries : 0
```

Cross-validated by construction: the manifest was generated from the **staging** database (migration-built, 43 tables + 1 view) while the harness builds its own scratch database from the migration set. Two independent sources produced the same 44 entries. The same run also reports `RLS policies: 102` and `forced-RLS tables: 32`, matching the counts measured earlier in this document.

**Proven able to fail.** Three mutations, each reverted afterwards:

| Mutation | Result |
| --- | --- |
| Delete `column onboarding_sessions.tenant_id` from the manifest | `unlisted (new drift): 1`, naming that column; exit 1 |
| Add a fabricated `column zzz_fabricated_probe.tenant_id` to the manifest | `stale manifest entries: 1`, naming that entry; exit 1 |
| Plant a real `tenant_id varchar(128)` table **in the scratch schema** (provisioning patched to skip the drop, probe dropped and script restored afterwards) | `non-uuid tenant columns: 45`, `unlisted: 1`, naming `column drift_probe_tenant_type.tenant_id`; exit 1 |

The third mutation is the one that matters: it proves the check reads the schema, not just the manifest. The first two prove both halves of the ratchet — new drift is caught, and a manifest line that no longer matches a real non-uuid column is caught, which is what forces the list to tighten as Phase 2 lands instead of merely not growing.

### Evidence — tasks 0.2 and 0.3, and a re-run defect the harness found

**RED.** With assertion D in place and nothing else fixed, the harness exits 1 and reports exactly:

```
uuid col text casts    : 5

Policy expressions on a uuid tenant column that cast the column to text,
or never cast the setting to uuid (table | policy | command | expression):
  - invoices|credit_note_invoices_tenant_delete|DELETE|USING
  - invoices|credit_note_invoices_tenant_insert|INSERT|WITH CHECK
  - invoices|credit_note_invoices_tenant_select|SELECT|USING
  - invoices|credit_note_invoices_tenant_update|UPDATE|USING
  - invoices|credit_note_invoices_tenant_update|UPDATE|WITH CHECK
```

The scope is exact: only two tables carry policies on an already-`uuid` tenant column (`invoices` and `product_inventory_mapping_versions`), and the four correct policies of the second table are not flagged.

**Root cause, narrower than expected.** `1782000000000-AddCreditNoteProvenance.ts` has one `enableTenantRls()` method with one hardcoded predicate — `tenant_id::text = current_setting('app.tenant_id', true)` — applied to three tables: `invoices` (`uuid`), `invoice_items` and `inventory_kardex` (both `varchar`). The same string is index-friendly on a varchar column and index-losing on a uuid column. That is why `invoices` is the only offender.

**The defect the harness found.** Scenario 1 (fresh schema) went green with the forward migration, but scenario 2 stayed red at 5. Scenario 2 deletes 27 ledger rows and re-runs those migrations, including `1782000000000`, whose `DROP POLICY IF EXISTS` is unconditional. So the earlier migration dropped the corrected policies and recreated them in the text form, while `1809060000000` was not re-applied because its ledger row was still present. Verified in the catalog: after scenario 2 all four `invoices` policies read `((tenant_id)::text = current_setting(...))` again.

That is a real developer-database hazard, not a harness artifact: the ledger would claim the predicate fix was applied while the database held the wrong predicate. It is the same class of defect #285 fought.

**Fix, in two parts — both required.**
1. **Root cause:** `enableTenantRls()` now selects the predicate per table, reflecting each column's actual type, and throws on an unmapped table rather than emitting an empty predicate. A re-run is now correct.
2. **Forward migration:** `1809060000000` stays. A database that already applied `1782000000000` will never re-run it — its ledger row is present — so only the forward migration corrects it. Staging is exactly that case.

**GREEN.** After both parts, the harness exits 0 with `uuid col text casts: 0` in **both** scenarios.

**Independent verification, not the writer's word.** The spec the writer produced only asserts generated SQL strings, so the outcome was verified separately: the catalog shows all four `invoices` policies on the target predicate and `invoice_items`/`inventory_kardex` untouched; and `EXPLAIN` on `invoices.tenant_id` with `enable_seqscan = off` shows the transition on the same table and column:

```
-- previous policy form
Index Only Scan using idx_invoices_tenant on invoices
  Filter: ((tenant_id)::text = current_setting('app.tenant_id'::text, true))

-- current policy form
Index Only Scan using idx_invoices_tenant on invoices
  Index Cond: (tenant_id = (current_setting('app.tenant_id'::text, true))::uuid)
```

### Review workload — this does not fit in one unit

Measured review-facing size of the working tree:

| File | Lines |
| --- | --- |
| `scripts/verify-schema-build.sh` (ratchet + assertion D) | 139 + / 2 − |
| `scripts/schema-tenant-type-manifest.txt` (new) | 65 |
| `src/migrations/1809060000000-…Predicate.ts` (new) | 130 |
| `src/migrations/1809060000000-…Predicate.spec.ts` (new) | 151 |
| `src/migrations/1782000000000-…Provenance.ts` (root-cause fix) | 17 + / 2 − |
| `src/migrations/1782000000000-…Provenance.spec.ts` | 27 + |
| **Total** | **≈ 533** |

That is over the 400-line budget, so it must be split. The natural cut is three chained PRs, and the cut was **verified rather than assumed**: with the forward migration held out, the harness still exits 0 with `uuid col text casts: 0` in both scenarios, so the middle unit is green on its own.

| PR | Contents | Review-facing | Green standalone? |
| --- | --- | --- | --- |
| 1 — ratchet | `schema-tenant-type-manifest.txt` + the tenant-type half of `verify-schema-build.sh` | ≈ 170 | Yes — proven earlier |
| 2 — predicate form | assertion D + the `1782000000000` root-cause fix and its spec | ≈ 90 | **Yes — proven by holding out PR 3's migration** |
| 3 — forward migration | `1809060000000` and its spec | ≈ 281 | Yes, but only meaningful on a database that already applied `1782000000000` |

The ordering matters: PR 2 carries the defect fix, because without it the assertion goes red again in scenario 2 and the unit cannot be green.

### Dependency inventory — what actually blocks each `ALTER` (measured)

This was not in the plan and changes Unit 2. `pg_depend` over every varchar `tenant_id` column on staging, grouped by `deptype`:

| Dependent | `deptype` | Blocks the `ALTER`? | Count |
| --- | --- | --- | --- |
| `pg_policy` | `n` | **Yes** | 94 policies across 30 tables |
| `pg_rewrite` (view rule) | `n` | **Yes** | **1** — `v_sys_parametros_config_active` |
| `pg_class` (indexes) | `a` | No — PostgreSQL rebuilds them | 72 |
| `pg_constraint` | `a` | No — PostgreSQL rebuilds them | 62 |

Proven both ways in rolled-back transactions:

```
-- with a policy present:
ERROR:  cannot alter type of a column used in a policy definition
DETAIL:  policy sys_parametros_config_tenant_isolation on table sys_parametros_config depends on column "tenant_id"

-- with the policy dropped inside the same transaction:
ERROR:  cannot alter type of a column used by a view or rule
DETAIL:  rule _RETURN on view v_sys_parametros_config_active depends on column "tenant_id"

-- onboarding_sessions.tenant_id, with 10 tenant indexes, a PK, a unique
-- constraint on tenant_id and NOT NULL, but no policy and no view:
ALTER TABLE   ← succeeded, rollback left the type and policies untouched
```

So `sys_parametros_config` needs `DROP POLICY` → **`DROP VIEW`** → `ALTER COLUMN` → `CREATE VIEW` → `CREATE POLICY`, and it is the only table in the schema that needs the view step. The view is created by `1784000000000-CreateSystemParametersConfig.ts:76` with `security_invoker = true`, which the recreate must preserve. Unit 2 owns this; Unit 0 only had to make it visible, which is exactly what the `view` manifest marker does.

### Review budget

Unit 0 modifies one existing file and creates three: the manifest, the migration and its spec. No data migration. It stays inside 400 review-facing lines; the migration in 0.3 is ~120 lines including its spec.

### Not blockers

`products.product_type` and the empty-`app.tenant_id` behaviour remain undecided. Neither blocks Unit 0.

## Relevant files

- `apps/admin_backend/src/migrations/**` — 18 files carry the breaking predicate form; `1802000000000-CreateProductInventoryMappingVersions.ts` is the reference implementation
- `apps/admin_backend/scripts/verify-schema-build.sh` — the four-layer check; Unit 0 adds two assertions
- `docs/operations/staging-cutover.md` — §8.7 probe and §12 gate change with the empty-setting decision; §13 known limitations records the backup/R2 gap
- `apps/admin_backend/src/core/database/tenant-transaction.ts` — transaction-local tenant binding, the producer of `app.tenant_id`
- `odd/tasks/schema-bootstrap.md` — the #280 reproducibility work that surfaced this drift
- `odd/tasks/rls-policy-idempotency.md` — the #285 work that made every policy creation re-appliable
