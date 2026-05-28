# Tasks: Post-Archive Identity Audit & Quality Hardening

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~350-450 |
| 400-line budget risk | Medium |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (Hygiene/Lint) → PR 2 (Coverage) → PR 3 (Schema) |
| Delivery strategy | ask-always |
| Chain strategy | feature-branch-chain |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Test hygiene & lint fixes | PR 1 | Base: `feature/identity-hardening`. Fix open handles, mock typing, enums. |
| 2 | Coverage & test cleanup | PR 2 | Base: PR 1 branch. Uplift `auth.service` coverage, remove trivial spec. |
| 3 | Legacy schema removal | PR 3 | Base: PR 2 branch. Drop `pin_hash` entity mapping & migration. |

## Phase 1: Test Hygiene & Lint Compliance

- [x] 1.1 **REFACTOR**: Update `apps/admin_backend/src/core/app/app.module.spec.ts` to invoke `await module.close()` in `afterAll` blocks.
- [x] 1.2 **VERIFY**: Execute backend tests without `--forceExit` to confirm clean exits and no `pg` concurrency warnings.
- [x] 1.3 **REFACTOR**: Update `apps/admin_backend/src/modules/identity/controllers/audit.controller.spec.ts` to replace `any` casts with `jest.Mocked` and strict DTO interfaces.
- [x] 1.4 **REFACTOR**: Update `apps/admin_backend/src/modules/identity/services/auth.service.ts` to enforce strict TypeScript enum-safe comparisons for role logic.
- [x] 1.5 **VERIFY**: Run `npm run lint` targeting identity hotspots to confirm 0 errors/warnings.

## Phase 2: Authentication Coverage & Test Cleanup

- [x] 2.1 **RED**: Add failing test cases in `apps/admin_backend/src/modules/identity/services/auth.service.spec.ts` covering invalid roles and scope edge cases.
- [x] 2.2 **GREEN**: Ensure the test runner successfully evaluates the new branches against the refactored enum logic.
- [x] 2.3 **REFACTOR**: Delete the trivial `apps/admin_backend/src/modules/identity/entities/user.entity.spec.ts` file entirely.
- [x] 2.4 **VERIFY**: Check jest coverage metrics to confirm `auth.service.ts` branch/line coverage improves over baseline.

## Phase 3: Legacy Schema Removal

- [x] 3.1 **REFACTOR**: Remove the `pin_hash` property from `apps/admin_backend/src/modules/identity/entities/user.entity.ts`.
- [x] 3.2 **REFACTOR**: Generate TypeORM migration `apps/admin_backend/src/migrations/<timestamp>-DropUserPinHash.ts` containing the `DROP COLUMN pin_hash` instruction.
- [x] 3.3 **VERIFY**: Validate the migration applies cleanly, and that the `down` method safely adds the column back (`varchar NULL`).

## Final Micro-slice: Verify Closure Hygiene

- [x] M1 **LINT**: Fix `no-unsafe-member-access` in `apps/admin_backend/src/modules/identity/services/user.service.spec.ts`.
- [x] M2 **LINT**: Resolve scoped Prettier/CRLF issues in `apps/admin_backend/src/core/app/app.module.ts` and `app.module.spec.ts`.
- [x] M3 **COVERAGE**: Raise `auth.service.ts` targeted coverage with meaningful branch tests to clear verify closure risk.
