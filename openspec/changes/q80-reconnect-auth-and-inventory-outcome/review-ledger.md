## Planning amendment before Slice 6

| ID | Severity | Status | Resolution / evidence |
|---|---|---|---|
| Q80-PLAN-001 | BLOCKER | resolved by restructuring | Checkout requires backend tenant-owned immutable authority projection before local hydration; tenant inference/default fallback is forbidden. |
| Q80-PLAN-002 | BLOCKER | resolved by restructuring | POS SQLite/Floor migration, codegen, sync hydration, and local authority projection are isolated as 5B4A1 before runtime wiring. |
| Q80-PLAN-003 | CRITICAL | resolved by restructuring | Runtime writers are separated: 5B4A2 covers `SaleViewModel.processSale`; 5B4B separately covers `ActivationControlledSaleRunner.executeControlledOfflineSale`. |
| Q80-PLAN-004 | CRITICAL | resolved by restructuring | Slice 6 is explicitly backend outcome/persistence only and cannot absorb projection or checkout composition prerequisites. |

No implementation evidence is claimed by this planning amendment; all new work units remain unchecked until applied and reviewed.

## 5B4A0 implementation record

| ID | Severity | Status | Evidence |
|---|---|---|---|
| 5B4A0-001 | review-required | pending review | Inbound DTOs explicitly project tenant-owned insumos, recipes, published/effective recipe versions, and version-keyed immutable components. Focused Jest suite: 10 passed; backend build and `git diff --check` passed. Review must confirm no POS/Slice-6 wiring is included. |

## 5B4A0 risk-review closure

| ID | Severity | Status | Resolution / evidence |
|---|---|---|---|
| R1-001 | BLOCKER | resolved | Incremental currently-effective recipe-version selection now uses `created_at`, `published_at`, or `fecha_inicio_vigencia` after the cursor. Focused Jest proves a version created/published before `since` but becoming effective after it is emitted: 12 tests passed. |
| R1-002 | BLOCKER | resolved | Before emitting components, the service batch-loads every referenced insumo under the authenticated tenant and fails closed if an ID is missing or returned from another tenant. Focused Jest covers both missing and foreign insumos: 12 tests passed. |

### 5B4A0 risk re-review and budget exception

**PASS — zero findings.** Scoped risk re-review confirmed future-effective recipe-version cursor coverage, tenant-owned component-insumo validation, no downstream POS/Slice 6 contamination, and correct checkbox state. User approved the retained **363-line** 5B4A0 source+test exception after review PASS.

## 5B4A1 pre-write workload gate

| ID | Severity | Status | Evidence |
|---|---|---|---|
| 5B4A1-WORKLOAD-001 | blocker | open — delivery decision required | The 300 authored source+test-line cap cannot include additive tenant/version/component Floor entities/DAOs, 49→50 migration, codegen, sync validation/atomic hydration, and meaningful fail-closed tests. Conservative minimum is 430 authored lines (generated output excluded). No 5B4A1 source/test/generated work or checkbox advance was retained. Approve `size:exception >=430` or split 5B4A1a schema/DAO/codegen from 5B4A1b sync hydration/tests. |

## 5B4A1 provider-failure reconciliation

| ID | Severity | Status | Resolution / evidence |
|---|---|---|---|
| 5B4A1-RECON-001 | BLOCKER | rolled back; re-plan required | Retained Floor/hydration draft omitted immutable component facts from 5B4A0 (gross quantity, shrink, component type, UOM) and lacked complete inbound/migration fail-closed coverage. Completing safely would exceed the user-approved 430 authored source+test-line exception. Only incomplete 5B4A1 entity/DAO/migration/sync/test/generated changes were rolled back. `build_runner` succeeded after rollback; `git diff --check` passed. 5B4A1 remains unchecked. |

## 5B4A1a schema work-unit record

| ID | Severity | Status | Evidence |
|---|---|---|---|
| 5B4A1a-001 | review-required | rejected by 4R; reimplementation required | The former POS Floor schema work was removed after 4R found backend/POS contract mismatch and missing schema invariants. Its entities/DAO/schema test, 49→50 migration/database registration, and matching generated output are not retained. A later independently budgeted 5B4A1a owns a corrected schema/DAO/migration. |
| 5B4A0c-001 | review-required | implemented; review needed | Backend contract alignment is owned by 5B4A0c only: immutable version identity is explicit, actual version lifecycle/technical fields and component nullability/order are projected, and missing/foreign/ambiguous linkage remains fail-closed. POS schema/hydration/runtime work remains excluded. |

## 5B4A0c fresh risk-review correction (Q80)

| ID | Severity | Status | Resolution / evidence |
|---|---|---|---|
| R1-001 | BLOCKER | resolved — GREEN | `RecipeService` now rejects a repost for every version that is not explicitly inactive `DRAFT` with no publish timestamp. Published/effective/legacy-ambiguous version identity and components are therefore immutable. The focused test proves no version save or component delete occurs; explicit inactive draft replacement remains covered. |
| R1-002 | CRITICAL | resolved — GREEN | Inbound component lookup is scoped by selected immutable version IDs without a tenant predicate that could hide malformed foreign rows. Every returned row is validated for selected-version linkage and tenant ownership before emission; the focused test returns a foreign row and proves the linkage-only query plus fail-closed rejection. |
| R1-003 | BLOCKER | resolved — GREEN | Restored `sale_view_model_test.mocks.dart` to the retained generated content, removing the rejected `AuthorityProjectionDao` import/mock residue. The affected Flutter test compiles and passes (18 tests). |

Correction boundary: 5B4A0c plus rejected-draft generated cleanup only. No POS schema/hydration/runtime wiring, Slice 6, ACK/remediation, DGI, or `Zone.Identifier` changes were made. Focused backend tests: 32 passed; backend build and `git diff --check` passed. The correction adds approximately 55 authored source/test lines (far below the 300-line correction budget); existing 5B4A0c diff is excluded from that correction count.

## 5B4A1a corrected reimplementation — workload gate

| ID | Severity | Status | Resolution / evidence |
|---|---|---|---|
| 5B4A1a-WORKLOAD-002 | BLOCKER | open — delivery size decision required | A fresh complete reimplementation against 5B4A0c needs four tenant-owned Floor fact entities, fail-closed immutable/tenant/link/effective-at DAO behavior, migration/database registration, and all reviewed SQLite test cases. Conservative authored source+test forecast is 600–750 lines (generated output excluded), exceeding the normal 300-line budget. No source/test/generated artifact was retained. Approve `size:exception` (recommended 750) or amend into independently complete bounded work units. |

## 5B4A1a1 — 4R rejection cleanup decision

| ID | Severity | Status | Evidence / required follow-up |
|---|---|---|---|
| 5B4A1a1-4R-001 | BLOCKER | rejected; cleanup complete | The draft mismatched the backend/POS authority contract. Removed the authority entity declarations, schema-50 database registration, 49→50 migration/list/callback wiring, focused schema test, and matching authority-only Floor output. Define the complete corrected contract/field nullability in OpenSpec before reimplementation. |
| 5B4A1a1-4R-002 | BLOCKER | rejected; cleanup complete | The draft lacked required schema invariants. The corrected design must specify tenant-aware keys/unique constraints/references/indexes/checks and prove fresh-create and upgrade schemas are equivalent without destructive callback table drops. |
| 5B4A1a1-4R-003 | review-required | verification complete | `identity_sales_migrations_test.dart` passed 20 before and after cleanup; targeted analyzer passed; `git diff --check` passed. `Zone.Identifier`, 5B4A0/5B4A0c, unrelated Q80 work, and unrelated generated output were preserved. |

Persisted task state: 5B4A1a1 is unchecked/rejected pending design correction; 5B4A1a2, 5B4A1b, 5B4A2, and 5B4B remain unchecked. No design/spec was modified in this cleanup.

## 5B4A1a1 — D7-compliant schema foundation completion

| ID | Status | Resolution / evidence |
|---|---|---|
| R1-001 / R3-001 (linkage) | closed | `authority_recipe_versions` links directly via `(tenant_id, product_id)` without requiring an inferred or fabricated `recipe_id`, exactly matching `5B4A0c`. |
| R4-001 / R3-002 (composite keys/FKs) | closed | All authority entities and migration DDL declare composite primary keys `(tenant_id, id)` and composite foreign keys. Unique composite index on `(tenant_id, version_id, ordinal)` enforces deterministic component sequencing. |
| R1-002 / R3-003 (immutability) | closed | SQLite `BEFORE UPDATE` and `BEFORE DELETE` triggers on versions and components raise ABORT. Verified in schema test. |
| R4-002 / R1-003 (fresh-create parity) | closed | Floor annotations natively declare composite primary keys, foreign keys, and unique indices so generated DDL matches migration DDL. In addition, `inventoryMovementAppendOnlyCallback` installs immutability triggers on fresh installs via `onCreate`. |
| R3-004 (schema test) | closed | Focused test verifies migration 49→50 preserves v49 data, tables are created, nullable UOM round-trips, and update/delete triggers abort mutations. |
| 5B4A1a2 (DAO invariants) | deferred | Public DAO methods, `OnConflictStrategy.abort`, deterministic effective-at query, and invariant behavior tests remain owned by unchecked `5B4A1a2`. |

## 5B4A1a2 — Authority DAO invariants resolution

| ID | Status | Resolution / evidence |
|---|---|---|
| R1-001 / R4-001 (abort strategy) | closed | DAO inserts use explicit `OnConflictStrategy.abort` rather than replace, respecting SQLite immutability triggers. Verified with duplicate PK throw in DAO test. |
| R4-002 / R2-003 / R3-002 (effective version query) | closed | `findActivePublishedVersions` implements the exact D7 query ordered deterministically by `effective_from DESC, version_number DESC`. Verified resolution of historical vs active versions in DAO test. |
| R3-001 (component ordinal ordering) | closed | `findComponentsByVersion` orders strictly by `ordinal ASC`. Verified with out-of-order component insertion in DAO test. |
| 5B4A1b (sync hydration) | deferred | Sync mapping, batch inbound parsing, and atomic fail-closed hydration remain owned by unchecked `5B4A1b`. |

## 5B4A1b — POS authority sync mapping & hydration resolution

| ID | Status | Resolution / evidence |
|---|---|---|
| Tenant fail-closed validation | closed | `AuthorityHydrationPayload` rejects any insumo, version, or component with missing or foreign tenantId. Verified in test. |
| 5B4A0c contract mapping | closed | Maps all backend fields including `recipeVersionId`, `productId`, effective dates, yield, shrink, ordinal, component quantities, nullable UOM, and referenceVersionId. |
| Idempotent hydration | closed | Service checks for existing records before insertion, maintaining immutability while allowing safe repeat sync passes without abort exceptions. |
| 5B4A2 (checkout wiring) | deferred | Runtime checkout wiring remains owned by unchecked `5B4A2`. |

## 5B4A2 — SaleViewModel checkout wiring resolution

| ID | Status | Resolution / evidence |
|---|---|---|
| R2-001 (runtime checkout wiring) | closed for SaleViewModel | `CheckoutInventoryPreparationService` wires `ValidatedSaleInventoryAuthority` → `SaleInventoryOutcomePlanner` → `SaleTimeInventorySnapshotBuilder` directly into `SaleViewModel.processSale`. Verified in `sale_view_model_checkout_wiring_test.dart`. |
| 5B4B (Activation runner wiring) | deferred | Activation-controlled offline sale runner wiring remains owned by unchecked `5B4B`. |

## 5B4B — Activation runner checkout wiring resolution

| ID | Status | Resolution / evidence |
|---|---|---|
| Activation runner wiring | closed | `ActivationControlledSaleRunner.executeControlledOfflineSale` invokes `CheckoutInventoryPreparationService.prepare` before `saveSale`. Verified in `activation_controlled_sale_runner_test.dart` (16 passed). |
| Pre-Slice-6 chain completion | closed | All pre-Slice-6 tasks (5B4A0c, 5B4A1a1, 5B4A1a2, 5B4A1b, 5B4A2, 5B4B) are complete with passing tests. Slice 6 backend outcome/persistence is ready to begin. |

## Slice 7 — Reliability review

| ID | Severity | Status | Resolution / evidence |
|---|---|---|---|
| R3-001 | BLOCKER | confirmed — correction required | No retained migration creates `sale_correlation_id`; production uses `synchronize: false`. The first correlated movement lookup/write would fail. Correction requires an additive nullable column plus tenant-scoped partial unique index and migration/DB coverage. |
| R3-002 | CRITICAL | confirmed — correction required | D2 requires `(insumoId, recipeComponentId-or-empty)` ordering, but legacy classification sorts only by `insumo_id`. Correction requires the `RecipeDetail.id` tie-break and a reversed-input same-insumo determinism test. |
| R3-003 | WARNING | confirmed — correction required | D3 requires freezing the exact transaction-selected `acceptedAt` in generated legacy snapshots and canonical receipt evidence; current DTO/entity/persistence omits it. Do not substitute receipt `created_at`. |

Review scope: standard single `review-reliability` lens because the corrected Slice 7 authored delta is 372 lines. Independent refutation confirmed all three findings at high confidence. Correction requires a workload decision because migration and DB coverage cannot fit safely inside the remaining 28-line budget.

### Slice 7 Work-Unit Restructuring Decision (Correction Round 1)

User decision: `Dividir 7A/7B`. Do not take a size exception.

- **Sequential bounded work units:**
  - **Slice 7A (PR 7A; ≤400 lines):** Deployable Kardex sale-correlation schema foundation (entity + additive migration + DB/migration tests). Owns and resolves **R3-001**.
  - **Slice 7B (PR 7B; ≤400 lines; depends on 7A):** ACK/idempotency + LEGACY_SYNC_TIME_V1 classifier, deterministic component order, exact acceptedAt evidence, focused tests. Owns and resolves **R3-002** and **R3-003**.
- **Ownership mapping:**
  - R3-001 (BLOCKER - Missing schema migration for Kardex sale correlation): Owned and resolved by Slice 7A.
  - R3-002 (CRITICAL - Deterministic component ordering tie-break): Owned by Slice 7B.
  - R3-003 (WARNING - Freezing transaction-selected acceptedAt): Owned by Slice 7B.
- **Preserved evidence:**
  - Complete Slice 7 green behavior implementation and test suite backed up losslessly outside worktree to `/tmp/slice7-backup/` (checksums recorded in apply-progress.md).
  - Slice 7B remains pending implementation on top of Slice 7A.

### Slice 7A scoped reliability re-review

**PASS — zero findings and zero warnings.** R3-001 is resolved: the additive migration and entity are deployable with `synchronize: false`, PostgreSQL enforces tenant-scoped partial uniqueness while accepting historical nulls, and the guarded down migration protects non-null correlation evidence. Unit tests passed 4/4, isolated PostgreSQL tests passed 2/2, backend build passed, and the authored source+test delta is 285 lines.

### Slice 7B scoped reliability re-review

**PASS — zero findings and zero warnings.** Fresh-context reliability review independently validated the exact 375-line diff, 15 focused tests, 15 sales suites / 181 tests, 30 migration suites / 71 tests, backend build, and `git diff --check`. R3-002 is closed by canonical `(insumoId, recipeComponentId-or-empty)` ordering with reversed-input coverage. R3-003 is closed by one transaction-selected `acceptedAt` used for effective-time classification and frozen into generated legacy snapshots plus guarded receipt evidence. Same-hash replay, mismatch rejection, unknown outcomes, old-client compatibility, database uniqueness races, tenant isolation, and DGI immutability were verified.
