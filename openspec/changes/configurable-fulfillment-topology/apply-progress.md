# Apply Progress: Configurable Fulfillment Topology

**Mode**: Strict TDD
**Delivery**: `ask-on-risk` resolved to `feature-branch-chain`

## Cumulative Completed Tasks

- [x] 1.1–1.3
- [x] 2.1A–2.2C
- [x] 2.2D.1
- [x] 2.2D.2a
- [x] 2.2D.2b
- [x] 3.1–3.2
- [x] 4.1–4.2
- [x] 5.1

## 2.2D.2a Evidence

| TDD stage | Evidence |
|---|---|
| RED | Historical SQLite harness failed before the candidate because fulfillment was absent and invalid contexts mutated state. |
| GREEN | `flutter test test/data/repositories/sales/sales_repository_fulfillment_checkout_test.dart` → exit 0, 2/2 tests passed. |
| TRIANGULATE | Valid checkout/replay plus missing, cross-tenant, stale-revision, and hash-mismatch no-mutation paths passed. |
| REFACTOR | Candidate retained; no further refactor was required. |

| Work-unit evidence | Result |
|---|---|
| Focused test / runtime harness | Same real in-memory Floor SQLite command passed: invoice, inventory, fulfillment, print, outbox, and DGI advancement committed atomically; replay remained idempotent. |
| Rollback boundary | Revert `sales_repository_impl.dart` and `sales_repository_fulfillment_checkout_test.dart`; no unrelated behavior is removed. |

**Scoped authored diff**: 365 lines (116 additions + 15 deletions production; 234 additions harness).
**Excluded test SHA-256**: `28ceeb6ee1800d65cab052d5ab86346c58f29134b9c866a700f9fc4a142dcc28` (unchanged).
**Evidence revision**: `sha256:99429369d37ad1ffa4791cd2ed44de077ccf76203bdf09692ae417e7501a6fc9`

## 2.2D.2b Evidence

| TDD stage | Evidence |
|---|---|
| Correction RED | Semantic validation `sha256:4ee8dec9c064627c18d75231ee38915721b871e114e3a59da9cae308782e9faf` found that passing tests had removed immutable context-forwarding proof. |
| GREEN | Final formatted candidate: check-only Dart format passed (1 file/0 changed); changed-test analyzer passed with no issues; required combined repository + SQLite + DGI tests passed 31/31; diff and staged diff checks passed. |
| REFACTOR | Smallest test-only correction; production unchanged. |

| Work-unit evidence | Result |
|---|---|
| Semantic proof | Exact immutable tenant/snapshot ID/revision/hash/channel identity, one fulfillment transaction invocation, and legacy no-context DGI/no-callback behavior. |
| Final formatted test boundary | `apps/pos_app/test/data/repositories/sales/sales_repository_impl_test.dart`: 160 additions + 96 deletions = 256 changed lines. |
| Complete child boundary | Before this passive wording adjustment: 180 additions + 99 deletions = 279 changed lines across test, tasks, and apply-progress; under the 400-line review cap. |
| Rollback boundary | Revert only that test file correction without removing 2.2D.2a behavior. |

**Native correction evidence revision**: `sha256:8e52e779448b2b5da4448fabc7066292cb94aaad0297d9b7904c2e4250bee11b`.
**Native settle**: complete, remediating failed revision `sha256:4ee8dec9c064627c18d75231ee38915721b871e114e3a59da9cae308782e9faf`.
**Final normalized ordinary-delivery evidence revision**: `sha256:dc249544cf0ca159f0c6c67b4559902eb40df8247f3704a1bb27e28991462f82`.

## 3.1a Progress — Real-PostgreSQL GREEN Complete

- Added the additive `tenant_topology_revisions` migration, TypeORM entity, immutable database trigger, and a tenant-scoped revision service. The service represents no stored revision as `{ provisioned: false, revision: 0 }`, serializes create operations with a transaction-scoped advisory lock, and raises `TopologyRevisionConflictError` for a stale `baseRevision` (for later HTTP 409 mapping).
- Added a real-PostgreSQL-focused DB test that exercises first creation, next revision, stale-base rejection, persisted snapshot preservation, and SQL-level mutation rejection. It does not infer any topology fields or provision existing/new tenants automatically.
- Blank/whitespace `tenantId` is rejected before `createQueryRunner`/transaction creation. No controller, DTO, permission, RLS, audit, onboarding, POS/DGI, defaults, or checkbox changes were made. Overall task `3.1` remains unchecked by explicit slice instruction.

| TDD stage | Evidence |
|---|---|
| RED | With explicit Docker PostgreSQL credentials, the new whitespace-ID test resolved `{ provisioned: false, revision: 0 }` instead of rejecting (focused test failed). |
| GREEN | Added pre-transaction tenant validation; focused `test:db` passed 1/1 against a temporary `postgres:16-alpine` container on an isolated non-default loopback port; container removed. |
| TRIANGULATE | Passed empty base, revisions 1/2, stale base, same-base concurrent writers (exactly one success/one `TopologyRevisionConflictError`), immutable history, and blank ID/no transaction. |
| REFACTOR | Prettier check and ESLint check passed; no further refactor. |

**Implementation/test files changed**: `apps/admin_backend/src/migrations/1794000000000-CreateTenantTopologyRevisions.ts`; `apps/admin_backend/src/modules/fulfillment/{domain/topology-revision-conflict.error.ts,entities/tenant-topology-revision.entity.ts,services/tenant-topology-revision.service.ts,services/tenant-topology-revision.service.db.spec.ts}`. This progress artifact was updated with the evidence above.

**Workload / PR boundary**: 3.1a only, chained feature-branch slice; no generated artifacts. Rollback boundary: revert only the listed migration and fulfillment files.

**Verification**: `corepack pnpm --filter admin_backend build` and `git diff --check` passed. **Status consumed**: authoritative `both`/OpenSpec status; `actionContext` allowed the dedicated worktree roots. Remaining tasks: `- [ ] 3.1 RED: immutable revision, base conflict \`409\`, legacy compatibility, RLS isolation, append-only audit, and cross-tenant rejection; GREEN add fulfillment DTOs/controllers/services, TypeORM migrations/entities, permissions and policies; generate/review TypeORM artifacts here; REFACTOR pipes.`

## 3.1b Progress — Real-PostgreSQL GREEN Complete

- Added DTOs `CreateTenantTopologyRevisionDto` (strict class-validator: baseRevision, contractVersion, topology, hash) and `TenantTopologyResponseDto`.
- Added controller `FulfillmentTopologyController` with route `/fulfillment/topology`:
  - `GET /current`: Authenticated for all tenant staff roles (OWNER, MANAGER, CASHIER, WAITER); returns current revision or `{ provisioned: false, revision: 0 }`.
  - `POST /revisions`: Restricted to OWNER role via `AuthoritativeCurrentUserGuard` and `RolesGuard`; maps `TopologyRevisionConflictError` to HTTP 409 Conflict.
- Added additive migration `1794000000001-AddTenantTopologyRevisionsRls.ts` enforcing PostgreSQL Row-Level Security (RLS) with SELECT and INSERT policies scoped to `app.tenant_id`.
- Bound `app.tenant_id` session variable in `TenantTopologyRevisionService.inTransaction`.
- Registered `FulfillmentModule` and `TenantTopologyRevision` entity in `AppModule`.

| TDD stage | Evidence |
|---|---|
| RED | Controller unit tests failed initially without controller/DTOs; E2E suite failed before schema & migration setup. |
| GREEN | Controller unit tests passed 8/8 (`fulfillment-topology.controller.spec.ts`); DB spec with real PostgreSQL RLS passed 1/1 (`tenant-topology-revision.service.db.spec.ts`); full HTTP E2E with real PostgreSQL passed 8/8 (`test/fulfillment/fulfillment-topology.e2e-spec.ts`). |
| TRIANGULATE | Verified 401 unauthenticated, 403 non-owner, 400 invalid payload, 201 valid revision, 409 stale base revision, and complete tenant isolation across Tenant A & Tenant B in both DB RLS and HTTP E2E. |
| REFACTOR | ESLint and Prettier passed with 0 errors/0 warnings; NestJS build succeeded. |

## 5.1 Progress — Rollout Proof & Observability (GREEN Complete)

- Implemented `FulfillmentRolloutService` and `FulfillmentRolloutController` providing catalog backfill discrepancy scanning, emergency rollback feature gate, and live telemetry dashboard.
- Unit and triangulation tests covering missing BOM, foreign tenant insumo leaks, and safe unrouted product fallbacks (8/8 tests passed).
- Real PostgreSQL 16 DB integration tests with dynamic schema isolation and zero mocks (2/2 tests passed).
- Complete HTTP E2E pilot journey test with Supertest and native PostgreSQL 16 proving multi-tenant RLS, 3 fulfillment channels, outbox batch sync, duplicate reconnect replay, and dashboard aggregation (1/1 test passed; full fulfillment E2E suite 18/18 passed).
- Flutter POS SQLite integration test covering legacy tenant compatibility, channel semantics, unrouted offline fallback, and authorized copy reprint (4/4 tests passed; full POS fulfillment suite 32/32 passed).
- Created operational runbook in `docs/fulfillment-rollout-runbook.md`.

| TDD stage | Evidence |
|---|---|
| RED | Unit tests failed before service implementation; DB and E2E suites failed before controller, service, and routes wiring. |
| GREEN | Jest unit tests 8/8 passed; PostgreSQL 16 DB tests 2/2 passed; E2E pilot 1/1 passed; Flutter pilot 4/4 passed. |
| TRIANGULATE | Verified missing recipe BOM, cross-tenant leak, unrouted fallback, rollback toggle on/off, 3 channels (PRINT_ONLY, KDS_ONLY, KDS_AND_PRINT), and replay idempotency. |
| REFACTOR | ESLint passed with 0 errors / 0 warnings; Flutter analyze passed with 0 issues; NestJS build succeeded. |

