# Schema Bootstrap

## Goal

Make the admin backend schema reproducible from an empty PostgreSQL database, so that a new environment (staging, disaster recovery, new tenant infrastructure) can be provisioned entirely from migrations.

Closes #280.

## Authority and constraints

- Reported as #280 with measured evidence.
- Existing environments (developer databases, CI, the running deployment) already hold these tables with no ledger row for any newly authored migration, so **every bootstrap statement must be idempotent**.
- Migrations must remain the single source of truth for the schema.
- No fiscal or business data may be modified; this work only creates missing structure.
- DGI rule preserved: no table drops and no row deletion.

## Measured baseline

| Metric | Count |
| --- | --- |
| Tables created by `src/migrations` | 46 |
| Tables declared by `@Entity` | 66 |
| Entity tables with no creating migration | 26 |

Bootstrap prerequisites by first migration that needs them:

| First migration | Required tables |
| --- | --- |
| `1760000000000-CreateSecurityProfilesAndIdentityColumns` | `users`, `audit_logs` (+ `tenants` as FK root) |
| `1767000000000-AddNegativeStockPolicyToInsumos` | `insumos` |
| `1769000000000-AddRecipeVersionIdToInvoiceItems` | `invoice_items` |
| `1770000000000-AddTenantIdToInvoiceItems` | `invoices` |
| `1771000000000-AddRecipeVersionIngestionColumns` | `recipe_versions`, `recipe_details` |
| `1794000000000-CreateChangeLogTable` | `tenants` |
| `1796000000000-AddProductTaxFields` | `products` |

The earliest existing migration is `1759000000000-CreateBaseCashierSessions`, so the bootstrap must sit between `1759000000000` and `1760000000000`.

## Confirmed traps

1. `docs/plans/inventory/00_bootstrap_base_tables.sql` defines 19 tables but is a hybrid of initial and final state: it already contains `tax_rate`, which `1796000000000` then adds with a bare `ALTER TABLE products ADD COLUMN tax_rate` (no `IF NOT EXISTS`). Applied as-is on a fresh database, the migration fails. It also contains `negative_stock_policy` and `recipe_version_id`, whose migrations do guard with `IF NOT EXISTS`.
2. `users.tenant_id` is `uuid` in the database while `user.entity.ts` declares `@Column() tenant_id: string`.
3. `users.role` is the enum type `users_role_enum`.
4. `users.pin_hash` must exist at bootstrap time because `1761000000000` alters it; `1763000000000` drops it afterwards with `IF EXISTS`.
5. `chk_users_security_version_positive` must NOT be pre-created, because `1783000000000` adds it without `IF NOT EXISTS`.
6. `audit_logs.id` is `character varying` backed by `audit_logs_id_seq`; `1793000000000` casts it to varchar and resets the default.
7. `tenants.id` defaults to `uuid_generate_v4()`.
8. Three creates in the current set are not idempotent and fail wherever the table already exists without a recorded migration: `1785000000000-AddTenantCapabilityEvent`, `1794000000000-CreateTenantTopologyRevisions`, `1795000000000-CreateTenantFulfillmentRecords`.

## Dependency DAG

1 -> 2 -> 3 -> 4 -> 5 -> 6.

Task 2 and Task 3 may iterate together against the harness, but the identity tables must come first because the earliest referencing migration needs them.

Critical path: the harness (1) then the bootstrap content (2, 3), because every later task is verified through the harness.

## Tasks

### Task 1: Build the reproducible schema-build harness

- **Status:** done
- **Goal:** One reproducible command that provisions an empty local database, applies the migration set, and reports the outcome.
- **In scope:** a scratch database and the exact commands to build it; the reference schema source for comparison.
- **Out of scope:** changing application code.
- **Acceptance:** the command runs against an empty database and surfaces migration failures clearly, without ever touching the developer's `omnifood` database.
- **Safety:** the harness must target a dedicated database name. Running migrations against an unintended database already caused one incident in this repository.
- **Commit:** pending
- **Evidence:** `scripts/verify-schema-build.sh` recreates a scratch database, builds, applies the full migration set, and diffs the result against the `@Entity` declarations. Verified: it refuses `omnifood` and `omnifood_prod`, and on an empty database it reproduces the #280 failure with exit code 1 and lists the missing tables.

### Task 2: Author the bootstrap migration for identity tables

- **Status:** done
- **Goal:** Create `tenants`, `users`, and `audit_logs` with idempotent DDL matching the real database shape.
- **Dependencies:** Task 1.
- **In scope:** one migration ordered between `1759000000000` and `1760000000000`; the three tables plus the `users_role_enum` type.
- **Out of scope:** backfilling data; altering existing environments' rows.
- **Acceptance:** the migration applies cleanly on an empty database and is a no-op on a database that already holds the tables; `pin_hash` present, `chk_users_security_version_positive` absent.
- **Commit:** `599b545`
- **Evidence:** the harness failure moved past `1760000000000` to `1767000000000`, proving the identity bootstrap applies. A second gap surfaced and was closed in the same migration: `users.hashed_refresh_token` was also never created, because `1783000000001` only UPDATEs it.

### Task 3: Port the inventory and sales base tables into the bootstrap

- **Status:** done
- **Goal:** Create the remaining base tables the migration set assumes, trimmed to the pre-migration state.
- **Dependencies:** Task 2.
- **In scope:** the 19 tables from `docs/plans/inventory/00_bootstrap_base_tables.sql`, adjusted so later guarded and unguarded migrations both apply.
- **Out of scope:** changing the tables' entity definitions.
- **Acceptance:** every migration in the set applies from an empty database with no `already exists` failure.
- **Commits:** `0c1fc73` (inventory and sales), `aa878d7` (extensions, loyalty, datafonos)
- **Evidence:** the harness reports PASS: 66 entity tables declared, 73 tables created, 0 missing. Two further gaps were found and closed while iterating: nothing installed `uuid-ossp` although `1788000000000` relies on `uuid_generate_v4()`, and `loyalty_programs`, `loyalty_rewards`, `customer_loyalty_account_projection`, and `datafonos_equipos` existed only as entity declarations.
- **Known deviation:** `customer_loyalty_account_projection.customer_id` carries no foreign key because `customers` is created at `1789000000000`, after the bootstrap window.

### Task 4: Make the remaining creates idempotent

- **Status:** done
- **Goal:** Guard the three creates that break on databases already holding their tables.
- **Dependencies:** Task 3.
- **In scope:** `1785000000000-AddTenantCapabilityEvent`, `1794000000000-CreateTenantTopologyRevisions`, `1795000000000-CreateTenantFulfillmentRecords`, plus focused tests.
- **Out of scope:** rewriting unrelated migrations.
- **Acceptance:** applying each migration where the table already exists succeeds instead of failing.
- **Commit:** `035a265` (also guards `1794000000001-AddTenantTopologyRevisionsRls`)
- **Evidence:** the harness gained a second scenario that deletes ten ledger rows and re-runs the set over the existing schema. Policy definitions are unchanged, only wrapped in catalog guards.
- **Known follow-up:** twelve further migrations still issue bare `CREATE POLICY` statements (44 policies in total). They are listed in the evidence log and are not exercised by scenario 2.

### Task 5: Add the empty-database regression test

- **Status:** done
- **Goal:** Prove the empty-database path in automation so it cannot silently regress again.
- **Dependencies:** Tasks 2, 3, and 4.
- **In scope:** a database-backed spec that builds the schema from scratch and asserts every entity table exists.
- **Out of scope:** asserting full column-level equivalence for every table.
- **Acceptance:** the test fails if any entity table is missing after a clean build.
- **Commit:** `41bcb68`
- **Evidence:** the check runs in `admin-backend-ci.yml` inside the job that already provides PostgreSQL, so a missing creating migration now fails CI instead of surfacing during a deploy.

### Task 6: Verify equivalence and document

- **Status:** done
- **Goal:** Compare the built schema against the reference schema and document the bootstrap contract.
- **Dependencies:** Task 5.
- **In scope:** table-level comparison against a reference database, documented findings, updated deployment runbook.
- **Out of scope:** resolving every historical column drift.
- **Acceptance:** differences are enumerated and classified as either fixed or recorded as follow-up.
- **Commit:** `e065642`
- **Evidence:** an independent comparison against the developer reference database found **0 columns** present there and missing from the migration-built schema. Comparing tables alone had hidden a second gap of the same class: `products.product_type` and `products.category_code` were declared by the entity, created by no migration, and absent from a fresh build. The harness now extracts entity columns and fails on any missing one (838 declared columns, 0 missing), and it aborts loudly on a construct it cannot parse rather than skipping it.
- **Follow-up, not fixed here:** type drift between environments. `products.product_type` is `varchar` in the reference database but an enum type in a fresh build; `invoice_items.tenant_id` is `uuid` in the reference but `varchar` in the migration. Both come from environments provisioned by `synchronize`, and reconciling them is separate work.
- **Follow-up, not fixed here:** the twelve migrations listed in the evidence log still issue bare `CREATE POLICY` statements.

## Decisions

- 2026-04-17: Blocked the staging deploy rather than hand-bootstrapping the base schema, so the root cause is fixed instead of worked around.
- 2026-04-17: The bootstrap creates the pre-migration state and lets the migrations build the rest, because migrations are the source of truth.

## Evidence log

- 2026-04-17: Reproduced #280 locally on a scratch database: `1759000000000-CreateBaseCashierSessions` applies, then `1760000000000-CreateSecurityProfilesAndIdentityColumns` fails with `relation "users" does not exist`.
- 2026-04-17: The harness now reports PASS: `entity tables declared: 66`, `tables created: 73`, `missing entity tables: 0`, with `EnforceOnboardingFiscalTenantRls1809000000001` applying last. The schema builds from an empty database.
- 2026-04-17: Column-level verification added. Both scenarios report `entity columns declared: 838`, `missing entity columns: 0`. An independent comparison against the developer reference database found 0 reference columns missing from the built schema.
- 2026-04-17: Migrations still issuing bare `CREATE POLICY` statements, none exercised by the partial-ledger scenario: `1768000000000` (4), `1776000000000` (4), `1780000000000` (5), `1782000000000` (4), `1784000000000` (1), `1785000000000-AddBatch6bCostingLifecycle` (2), `1802000000000` (4), `1806000000000` (2), `1807000000000` (6), `1808000000000` (2), `1809000000000` (3), `1809000000001` (1).
- 2026-04-17: The Railway deploy reached the migration phase and applied `CreateBootstrapIdentityTables1759000000001` and `CreateBootstrapInventorySalesTables1759000000002`, then failed with `permission denied to create extension "uuid-ossp"` from `CreateBootstrapExtensions1759000000003`. The harness had not caught it because it ran the migrations as a superuser. Decision: extensions are infrastructure and are installed during provisioning by an administrator; the migration role never needs extension privileges.
- 2026-04-17: The harness now provisions a restricted role, pre-installs the extension as the administrator, and runs both scenarios with `NODE_ENV=production` and only the migration credentials. Verified empirically: both name guards exit 1, a provisioning failure exits 2 rather than reporting PASS, and both scenarios report 66 tables and 838 columns with 0 missing.
