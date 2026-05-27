# Apply Progress — post_archive_identity_audit_quality_hardening

## Slice
- PR Slice: PR1 (Hygiene/Lint)
- Delivery mode: feature-branch-chain
- Scope applied: backend test hygiene foundations + identity lint hotspot reduction
- Explicit defer: do NOT remove `User.pin_hash` in this slice

## Task Status (cumulative)
- [x] 1.1 Add `afterAll` teardown with `await module.close()` in `app.module.spec.ts`
- [x] 1.2 Verify clean backend test exit without pg deprecation/open-handle warnings
- [x] 1.3 Replace `any` in `audit.controller.spec.ts` with strict typed mocks + DTO casts
- [x] 1.4 Enforce enum-safe role/scope narrowing in `auth.service.ts`
- [x] 1.5 Lint identity hotspots to zero errors

## TDD Cycle Evidence
| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1 | `src/core/app/app.module.spec.ts` | Unit | ✅ 4/4 baseline passing (with open-handle warning) | ✅ Approval baseline captured first | ✅ Passed after teardown addition | ➖ Triangulation skipped: structural teardown-only change | ✅ Added `afterAll` cleanup |
| 1.2 | `src/core/app/app.module.spec.ts` + targeted suite run | Unit | ✅ RED reproduced with `--trace-deprecation` stack showing TypeORM synchronize path | ✅ Added failing expectation via `createTypeOrmOptions` test for `NODE_ENV=test` | ✅ Targeted run passes with no pg warning output | ✅ Added non-test env case (`development` => true) | ✅ Refactored DB options into `createTypeOrmOptions` and disabled synchronize for test env |
| 1.3 | `src/modules/identity/controllers/audit.controller.spec.ts` | Unit | ✅ 12/12 baseline passing | ✅ Existing forensic behavior locked by spec assertions | ✅ 12/12 passing after strict typing refactor | ✅ Multiple existing forensic scenarios preserved | ✅ Removed `any` mocks/casts and `require` usage |
| 1.4 | `src/modules/identity/services/auth.service.spec.ts` | Unit | ✅ 3/3 baseline passing | ✅ Added invalid-role and invalid-scope edge tests first | ✅ 5/5 passing after enum-safe narrowing | ✅ Added 2 edge cases with different branch paths | ✅ Added explicit type guards (`isUserRole`, `isSyncScope`) |
| 1.5 | `npx eslint ...scoped files...` | Static | N/A | ✅ Lint violations surfaced first | ✅ 0 errors after refactor | ➖ Single (static pass/fail gate) | ✅ Tightened spec typing and crypto imports |

## Test/Verification Runs
- `npm test -- src/modules/identity/services/auth.service.spec.ts` ✅ (5/5)
- `npm test -- src/core/app/app.module.spec.ts src/modules/identity/controllers/audit.controller.spec.ts src/modules/identity/services/auth.service.spec.ts` ✅ (19/19)
- `npx eslint src/modules/identity/controllers/audit.controller.spec.ts src/modules/identity/services/auth.service.ts src/modules/identity/services/auth.service.spec.ts src/core/app/app.module.spec.ts` ✅ (0 errors)

## Micro-slice: Task 1.2 Warning Root-Cause Fix

### RED Reproduction
- Command: `$env:NODE_OPTIONS='--trace-deprecation'; npm test -- src/core/app/app.module.spec.ts`
- Observed warning stack (key frames):
  - `DeprecationWarning: Calling client.query() when the client is already executing a query...`
  - `PostgresQueryRunner.loadTables` → `RdbmsSchemaBuilder.build` → `DataSource.synchronize` → `DataSource.initialize`

### Structural Fix
- Introduced `createTypeOrmOptions(configService, nodeEnv)` in `app.module.ts`.
- Set `synchronize: nodeEnv !== 'test'` so Jest bootstrap avoids TypeORM synchronize path that triggered concurrent pg query warning.
- Updated `TypeOrmModule.forRootAsync` to consume `createTypeOrmOptions`.

### GREEN Verification
- `npm test -- src/core/app/app.module.spec.ts` ✅ (6/6)
- `$env:NODE_OPTIONS='--trace-deprecation'; npm test -- src/core/app/app.module.spec.ts src/modules/identity/controllers/audit.controller.spec.ts src/modules/identity/services/auth.service.spec.ts` ✅ (21/21)
- Result: no `pg` deprecation/concurrency warning emitted in targeted run.

## Known Issue / Blocker
- None for PR1 scope. Task 1.2 warning path is resolved in targeted backend run.

## Files Changed
- `apps/admin_backend/src/core/app/app.module.spec.ts`
- `apps/admin_backend/src/modules/identity/controllers/audit.controller.spec.ts`
- `apps/admin_backend/src/modules/identity/services/auth.service.ts`
- `apps/admin_backend/src/modules/identity/services/auth.service.spec.ts`
- `openspec/changes/post_archive_identity_audit_quality_hardening/tasks.md`
- `apps/admin_backend/src/core/app/app.module.ts`

---

## Slice
- PR Slice: PR2 (Coverage/Test Cleanup)
- Delivery mode: feature-branch-chain
- Scope applied: auth critical role/scope branch coverage uplift + trivial entity spec replacement
- Explicit defer: do NOT remove `User.pin_hash` in this slice

## Task Status (cumulative)
- [x] 1.1 Add `afterAll` teardown with `await module.close()` in `app.module.spec.ts`
- [x] 1.2 Verify clean backend test exit without pg deprecation/open-handle warnings
- [x] 1.3 Replace `any` in `audit.controller.spec.ts` with strict typed mocks + DTO casts
- [x] 1.4 Enforce enum-safe role/scope narrowing in `auth.service.ts`
- [x] 1.5 Lint identity hotspots to zero errors
- [x] 2.1 Add failing test cases for invalid role/scope and continuity branch edges in `auth.service.spec.ts`
- [x] 2.2 Green the new role/scope branch tests against refactored auth logic
- [x] 2.3 Remove trivial `user.entity.spec.ts` and replace with meaningful mapping assertions in `user.entity.mapping.spec.ts`
- [x] 2.4 Verify `auth.service.ts` coverage uplift over prior baseline

## TDD Cycle Evidence (PR2)
| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 2.1 | `src/modules/identity/services/auth.service.spec.ts` | Unit | ✅ 6/6 baseline passing | ✅ Added failing continuity test (`peer cashier should be masked`) | ✅ 6/6 passing after auth scope fix | ✅ Covered self, peer, and authorizer role paths | ✅ Removed weak unknown-casts in invalid role/scope tests |
| 2.2 | `src/modules/identity/services/auth.service.spec.ts` | Unit | ✅ Same safety net run | ✅ RED from new branch assertion | ✅ Green after scoped pin/totp visibility refactor | ✅ Added multi-user continuity scenario | ✅ Extracted per-user scope/visibility booleans in mapper |
| 2.3 | `src/modules/identity/entities/user.entity.mapping.spec.ts` | Unit | ✅ 1/1 baseline trivial entity test passing | ✅ Replaced trivial `toBeDefined` spec with explicit mapping assertions | ✅ 2/2 passing mapping checks | ✅ Enum contract + column metadata assertions | ✅ Deleted old trivial file and introduced meaningful replacement file |
| 2.4 | `jest --coverage src/modules/identity/services/auth.service.spec.ts` | Unit/Verify | N/A | ✅ Coverage gate invoked | ✅ `auth.service.ts` now reports `61.4%` statements / `75.51%` branches | ✅ Role/scope edge paths included in measured run | ➖ Verify-only step |

## PR2 Test/Verification Runs
- `npm test -- src/modules/identity/services/auth.service.spec.ts` ❌ RED (1 failed, peer cashier was exposed)
- `npm test -- src/modules/identity/services/auth.service.spec.ts` ✅ GREEN (6/6)
- `npm test -- src/modules/identity/services/auth.service.spec.ts src/modules/identity/entities/user.entity.mapping.spec.ts` ✅ (8/8)
- `npx eslint src/modules/identity/services/auth.service.ts src/modules/identity/services/auth.service.spec.ts src/modules/identity/entities/user.entity.mapping.spec.ts` ✅ (0 errors)
- `npm run test:cov -- src/modules/identity/services/auth.service.spec.ts` ✅ (`auth.service.ts` coverage: 61.4% statements, 75.51% branches, 50% funcs, 59.25% lines)

## PR2 Notes
- In continuity scope, non-authorizer peers are now explicitly masked (`scope: masked`, null secrets) while requester self and owner/manager authorizers retain required secrets.
- `User.pin_hash` field/schema remains untouched per PR2 boundary.

---

## Slice
- PR Slice: PR3 (Schema Removal)
- Delivery mode: feature-branch-chain
- Scope applied: remove `User.pin_hash` entity ballast + add verified reversible migration
- Decision note: dev-stage acceptance allows irreversible data loss in dropped legacy column values

## Task Status (cumulative)
- [x] 1.1 Add `afterAll` teardown with `await module.close()` in `app.module.spec.ts`
- [x] 1.2 Verify clean backend test exit without pg deprecation/open-handle warnings
- [x] 1.3 Replace `any` in `audit.controller.spec.ts` with strict typed mocks + DTO casts
- [x] 1.4 Enforce enum-safe role/scope narrowing in `auth.service.ts`
- [x] 1.5 Lint identity hotspots to zero errors
- [x] 2.1 Add failing test cases for invalid role/scope and continuity branch edges in `auth.service.spec.ts`
- [x] 2.2 Green the new role/scope branch tests against refactored auth logic
- [x] 2.3 Remove trivial `user.entity.spec.ts` and replace with meaningful mapping assertions in `user.entity.mapping.spec.ts`
- [x] 2.4 Verify `auth.service.ts` coverage uplift over prior baseline
- [x] 3.1 Remove `pin_hash` from `User` entity mapping
- [x] 3.2 Add migration to drop `users.pin_hash`
- [x] 3.3 Verify migration up/down safety (`DROP` on up, nullable `varchar` add-back on down)

## TDD Cycle Evidence (PR3)
| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 3.1 | `src/modules/identity/entities/user.entity.mapping.spec.ts` | Unit | ✅ 2/2 baseline passing | ✅ Changed mapping test to assert legacy `pin_hash` is absent (failed) | ✅ Passes after removing entity field mapping | ✅ Enum contract still validated in same suite | ✅ Simplified metadata assertion to string key lookup |
| 3.2 | `src/migrations/1763000000000-DropUserPinHash.spec.ts` | Unit | N/A (new test file) | ✅ Added migration tests referencing new class before implementation (compile fail) | ✅ Passes after migration class added | ✅ Covers both `up` and `down` paths | ✅ Used isolated `query` mock vars to satisfy strict lint (`unbound-method`) |
| 3.3 | `src/migrations/1763000000000-DropUserPinHash.spec.ts` + impacted identity suite | Unit/Verify | ✅ Impacted identity suite baseline passing | ✅ Down-path assertion requires nullable `varchar` restore SQL | ✅ `up/down` assertions pass + impacted identity specs remain green | ✅ Verified both destructive and rollback statements | ➖ Verify-focused step |

## PR3 Test/Verification Runs
- `npm test -- src/modules/identity/entities/user.entity.mapping.spec.ts` ✅ baseline (2/2)
- `npm test -- src/modules/identity/entities/user.entity.mapping.spec.ts src/migrations/1763000000000-DropUserPinHash.spec.ts` ❌ RED (missing migration module + pin_hash still mapped)
- `npm test -- src/modules/identity/entities/user.entity.mapping.spec.ts src/migrations/1763000000000-DropUserPinHash.spec.ts src/modules/identity/services/auth.service.spec.ts src/modules/identity/services/user.service.spec.ts` ✅ GREEN (12/12)
- `npx eslint src/modules/identity/entities/user.entity.ts src/modules/identity/entities/user.entity.mapping.spec.ts src/migrations/1763000000000-DropUserPinHash.ts src/migrations/1763000000000-DropUserPinHash.spec.ts` ✅ (0 errors)

## Migration Up/Down Verification Evidence
- `up`: `ALTER TABLE users DROP COLUMN IF EXISTS pin_hash`
- `down`: `ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_hash varchar NULL`
- Verified by migration unit tests that assert exact SQL for both directions.

## PR3 Notes
- `SecurityProfile.pin_hash` remains the active credential store; `User.pin_hash` mapping and schema ballast removed.
- Existing auth and user service tests remain green, confirming no functional dependency on the legacy user column.

---

## Slice
- PR Slice: Final Micro-slice (Verify Closure Hygiene)
- Delivery mode: feature-branch-chain
- Scope applied: identity/app-module lint closure + auth targeted coverage uplift
- Schema note: no new schema changes introduced in this micro-slice

## Task Status (micro-slice)
- [x] M1 Fixed `no-unsafe-member-access` in `user.service.spec.ts`
- [x] M2 Fixed Prettier/CRLF lint errors in `app.module.ts` and `app.module.spec.ts`
- [x] M3 Raised `auth.service.ts` targeted line coverage to verify-safe level

## TDD Cycle Evidence (Final Micro-slice)
| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| M1 | `src/modules/identity/services/user.service.spec.ts` + eslint gate | Unit/Static | ✅ Baseline tests passing but lint failing | ✅ Reproduced `no-unsafe-member-access` at two call-sites | ✅ Lint clean after typed `saveCalls` extraction | ✅ Both create/update payload assertions retained | ✅ Replaced unsafe index access with typed call tuple array |
| M2 | `src/core/app/app.module.ts`, `src/core/app/app.module.spec.ts` + eslint gate | Static | ✅ Functional tests already green | ✅ Reproduced CRLF/Prettier errors across both files | ✅ `eslint --fix` + re-lint produced 0 errors | ➖ Single static formatting path | ✅ Normalized formatting without behavior change |
| M3 | `src/modules/identity/services/auth.service.spec.ts` + coverage run | Unit/Verify | ✅ Prior targeted line coverage ~59.25% | ✅ Coverage gap reproduced with `test:cov` | ✅ Added meaningful auth login/refresh/null-profile tests and reached 94.44% lines | ✅ Branches include success/failure token paths and null profile path | ✅ Added `afterEach(jest.restoreAllMocks)` and expanded strict mock typing |

## Final Micro-slice Runs
- `npx eslint src/modules/identity/services/user.service.spec.ts src/core/app/app.module.ts src/core/app/app.module.spec.ts` ❌ RED (unsafe-member-access + CRLF errors)
- `npm run test:cov -- src/modules/identity/services/auth.service.spec.ts` ✅ baseline coverage (`auth.service.ts` lines: 59.25%)
- `npm test -- src/modules/identity/services/user.service.spec.ts src/modules/identity/services/auth.service.spec.ts src/core/app/app.module.spec.ts` ✅ GREEN (19/19)
- `npx eslint src/modules/identity/services/user.service.spec.ts src/modules/identity/services/auth.service.spec.ts src/core/app/app.module.ts src/core/app/app.module.spec.ts` ✅ GREEN (0 errors)
- `npm run test:cov -- src/modules/identity/services/auth.service.spec.ts` ✅ GREEN (`auth.service.ts` lines: 94.44%, branches: 95.91%)

## Final Micro-slice Notes
- Coverage uplift came from meaningful behavior tests on login success/failure, refresh success/denied, and null security profile mapping branch.
- This micro-slice intentionally avoided schema modifications.
