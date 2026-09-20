# Issue #429 — fulfillment retention E2E must execute RLS under a non-bypassing role

**Issue:** #429 `test(e2e): fulfillment retention RLS policies run under a superuser`
**Branch:** `test/429-fulfillment-e2e-rls`
**Base:** `main` @ `4b13e4e`
**Status:** implementation and independent verification complete; single-PR delivery authorized

## Objective

Make the fulfillment-retention HTTP E2E build its schema from the full migration set and run the Nest application under a write-capable PostgreSQL runtime role with `NOSUPERUSER NOBYPASSRLS`. Its cross-tenant assertions must prove production RLS enforcement rather than pass through explicit service filters while PostgreSQL bypasses every policy.

## Why this is the final observation

The residual E2E creates fake invoice tables and text-form policies but connects as `postgres`; PostgreSQL superusers bypass RLS even with `FORCE ROW LEVEL SECURITY`. The policies are therefore decorative. This was noted when #418 closed and is now tracked as approved issue #429.

The separate historical #425 observation is closed as not applicable to production: production has no operational data yet. Staging-only attempts do not create a production/DGI reconciliation requirement.

## Scope

- Extend `test/support/migration-built-schema.helper.ts` with a dedicated runtime application role scoped to the scratch schema.
- Convert `test/fulfillment/fulfillment-retention.e2e-spec.ts` from five manual migrations, fake invoice tables, and hand-written policies to `createMigrationBuiltSchemaFixture()`.
- Run the Nest application DataSource as the restricted runtime role; keep administrator access only for infrastructure/seeding that the app role should not perform.
- Assert the runtime connection has `rolsuper = false` and `rolbypassrls = false`.
- Prove a cross-tenant access path is denied by production policies, not only by service-level predicates.
- Preserve retention, DGI invoice-preservation, and sync behavior assertions.
- Verify all existing helper consumers remain green.

## Constraints

- Runtime role: `LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`.
- Grant only required scratch-schema usage plus table/sequence DML privileges; no ownership, migration, role-management, or cross-schema privileges.
- Full migration set remains the sole schema/policy source; no copied tables or policies.
- Destroy all application/admin sessions before fixture cleanup drops roles.
- Offline-first POS/SQLite behavior and production service code are out of scope.
- DGI invoice rows must remain preserved; no delete path may be added.
- Stop if production logic must change; report the concrete defect instead of widening scope.
- No commit or PR until explicitly authorized after verification.

## Testing mode

- **Mode:** strict TDD enabled by `AGENTS.md`.
- **RED:** on the current E2E fixture, assert the application connection has neither `rolsuper` nor `rolbypassrls`; it must fail because the app runs as `postgres`. Also demonstrate that a Tenant A row remains visible after binding Tenant B on that superuser connection.
- **GREEN:** after conversion, role attributes are false and production RLS denies the cross-tenant row under the app role.
- **REFACTOR:** delete all fake schema/policy setup and reuse the migration-built helper.

## Delivery forecast

- Forecast was approximately 300–450 lines. Actual source/test churn is **524 lines** (404 additions / 120 deletions) across the helper and E2E, plus this tracker.
- Strategy: `single-pr` with an explicit maintainer-approved size exception. The user authorized one commit and PR after reviewing the measured 524 source/test lines; the helper addition is only 58 lines and is not independently valuable without the E2E that proves the runtime role.
- Route: delegated direct writer because implementation touches multiple non-trivial files and a shared test helper.

## Tasks

- [x] **T1 — Add a least-privilege runtime role to the migration-built fixture**
  - Provision, expose, and clean up runtime role credentials.
  - Grant schema usage and only required table/sequence DML privileges.
  - Preserve existing migration and SELECT-only reader roles and consumers.
  - Route: delegated writer.

- [x] **T2 — Convert fulfillment-retention HTTP E2E**
  - Observe RED on the current superuser fixture.
  - Replace manual migrations, fake invoice tables, and copied policies with the migration-built helper.
  - Run Nest/TypeORM under the runtime role.
  - Assert role attributes, production policy catalog, and actual cross-tenant RLS enforcement.
  - Preserve all retention/DGI assertions.
  - Route: same delegated writer; one writer thread for shared helper and consumer.

- [x] **T3 — Verify both database conditions and helper regressions**
  - Run focused E2E on provisioned `omnifood` and a fresh `template0` database.
  - Run current helper consumers: readiness tenant-binding, fulfillment retention DB spec, and invoices DB spec.
  - Run schema-build ratchets, focused ESLint, and `test:no-only`.
  - Obtain independent verification because native assessment is currently unavailable.

## Candidate edit surfaces

- `apps/admin_backend/test/support/migration-built-schema.helper.ts`
- `apps/admin_backend/test/fulfillment/fulfillment-retention.e2e-spec.ts`
- `apps/admin_backend/test/support/fulfillment-test-db.helper.ts` only if schema-targeted seed helpers require an existing narrow adaptation.
- `apps/admin_backend/test/support/device-sync-e2e.helper.ts` only if device credential helpers require an existing narrow adaptation.

## Verification commands

Run from `apps/admin_backend/`:

```bash
DB_HOST=127.0.0.1 DB_PORT=5432 DB_USERNAME=postgres DB_PASSWORD=postgres DB_DATABASE=omnifood npx jest --config ./test/jest-e2e.json fulfillment/fulfillment-retention --runInBand
bash -lc 'set -euo pipefail; export PGPASSWORD=postgres; dropdb -h 127.0.0.1 -p 5432 -U postgres --if-exists omnifood_429_fresh; createdb -h 127.0.0.1 -p 5432 -U postgres -T template0 omnifood_429_fresh; trap "dropdb -h 127.0.0.1 -p 5432 -U postgres --if-exists omnifood_429_fresh" EXIT; DB_HOST=127.0.0.1 DB_PORT=5432 DB_USERNAME=postgres DB_PASSWORD=postgres DB_DATABASE=omnifood_429_fresh npx jest --config ./test/jest-e2e.json fulfillment/fulfillment-retention --runInBand'
DB_HOST=127.0.0.1 DB_PORT=5432 DB_USERNAME=postgres DB_PASSWORD=postgres DB_DATABASE=omnifood npm run test:db -- fulfillment-retention
DB_HOST=127.0.0.1 DB_PORT=5432 DB_USERNAME=postgres DB_PASSWORD=postgres DB_DATABASE=omnifood npx jest --config ./test/jest-e2e.json onboarding/readiness-tenant-binding --runInBand
DB_HOST=127.0.0.1 DB_PORT=5432 DB_USERNAME=postgres DB_PASSWORD=postgres DB_DATABASE=omnifood npm run test:db -- invoices.service.db.spec.ts
DB_HOST=127.0.0.1 DB_PORT=5432 DB_USERNAME=postgres DB_PASSWORD=postgres SCHEMA_CHECK_DB=omnifood_schema_build_test bash scripts/verify-schema-build.sh
npx eslint test/support/migration-built-schema.helper.ts test/fulfillment/fulfillment-retention.e2e-spec.ts
npm run test:no-only
```

## Acceptance criteria

- Migration-built schema and production policies only; no copied invoice tables or policies.
- Runtime role is non-superuser, non-bypassing, non-owner, and scoped to the scratch schema.
- HTTP E2E exercises production RLS enforcement for cross-tenant access.
- Existing retention and invoice-preservation assertions remain green.
- Existing helper consumers remain green under both database conditions.
- No scratch schema, role, or fresh database leaks.

## Progress and evidence

- Strict RED observed on the former fixture: the app connection reported `rolsuper=true`, and a Tenant A invoice remained visible after Tenant B context was bound.
- The migration-built helper now provisions a third `migbuilt_app_*` runtime role with no superuser/BYPASSRLS/ownership/DDL authority; it receives scratch-schema usage, table SELECT/INSERT/UPDATE/DELETE, required sequence privileges, and an explicit revoke on the migrations ledger.
- The HTTP E2E now uses the full migration set and runtime credentials. Fake invoice tables, five manual migration calls, and hand-written policies are gone.
- GREEN proves role attributes, non-ownership, exact privilege boundaries, production uuid-form policy catalog, FORCE RLS, and direct positive/negative cross-tenant reads on the restricted app connection.
- DGI invoice preservation, tenant-scoped purge, sync, and HTTP isolation assertions remain green. Admin reads are documented as service/data-preservation evidence only; the separate restricted-app test is the RLS proof.
- Public-schema boundary now fails closed if PUBLIC or the runtime role has any table DML/TRUNCATE/REFERENCES/TRIGGER grant. It passes in both provisioned (80 public tables) and fresh (zero public tables) conditions without adding destructive public revokes.
- Writer verification: all eight required commands passed. Independent verification repeated all eight and returned PASS; a correction pass resolved both LOW findings, and independent re-verification found no blocker, medium, or low findings.
- Provisioned E2E 6/6; fresh E2E 6/6 with database removed; fulfillment DB 4/4; readiness 5/5; invoices 6/6; schema build both scenarios/zero drift; focused ESLint and no-only passed.
- No `migbuilt_*` role/schema/session or fresh database leaked.
- Native assessment remained unavailable because the package-local Gentle AI binary is missing; the candidate was therefore treated as high risk and independently verified.
- Historical #425 production impact is closed as not applicable because production has no operational data. No production data-loss claim is needed or made.

## Next step

Create the authorized work-unit commit and single PR with the measured size-exception rationale. After checks pass, request explicit merge confirmation and conclude the session.
