# Tasks: Identity Audit Wave1B Warning Followups

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 220-360 |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | Single PR (migration harness + teardown parity + OpenSpec closure) |
| Delivery strategy | ask-on-risk (mapped from ask-always) |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Runtime proof for migration + deterministic teardown fix + docs consistency closeout | PR 1 | Single review-safe slice; include tests and verify evidence |

## Phase 1: Foundation / Test Harness Setup

- [x] 1.1 RED: Create `apps/admin_backend/src/migrations/1765000000000-CreateAuditIntegrityAlerts.spec.ts` skeleton with failing `up`, `down`, `up->down->up` scenarios using real Postgres `DataSource`.
- [x] 1.2 Add isolated-schema harness helpers in that spec (`create schema`, `set search_path`, catalog probes, `drop schema`, `destroy`) with explicit timeout budget.
- [x] 1.3 Add `AlertStorageState` assertions in the spec to verify table/index existence contract after each migration stage.

## Phase 2: Core Implementation / Warning Root Cause Fix

- [x] 2.1 GREEN: Implement migration runtime flow in `1765000000000-CreateAuditIntegrityAlerts.spec.ts` to execute real `up`/`down` and satisfy all RED scenarios.
- [x] 2.2 REFACTOR: Keep spec deterministic by resetting schema state between scenarios and removing duplicate setup/teardown code.
- [x] 2.3 Modify `apps/admin_backend/src/core/app/app.module.masterdata.spec.ts` to add teardown parity (`afterAll` with `module.close()`), matching `app.module.spec.ts` lifecycle expectations.
- [x] 2.4 Keep `apps/admin_backend/package.json` default `test` command unchanged unless evidence proves runner-level config is still required; document decision in verify notes.

## Phase 3: Verification / Integration Evidence

- [x] 3.1 Run targeted migration spec (`npm test -- 1765000000000-CreateAuditIntegrityAlerts.spec.ts`) and capture passing evidence for `up`, `down`, and determinism scenarios.
- [x] 3.2 Run default backend validation (`npm test`) from `apps/admin_backend` and verify no forced worker-exit warning appears in parallel mode.
- [x] 3.3 If warning persists, capture single confirmed residual source and stop scope expansion; create follow-up note instead of broad hygiene edits.

## Phase 4: OpenSpec Consistency / Cleanup Closure

- [x] 4.1 Update `openspec/changes/identity_audit_wave1b_warning_followups/verify-report.md` with canonical archive path `openspec/changes/archive/2026-05-27-identity_audit_scenarios_coverage_wave1b/` and resolved references.
- [x] 4.2 Record Wave1B task `4.3` closure in current follow-up artifacts only (no edits under `openspec/changes/archive/2026-05-27-identity_audit_scenarios_coverage_wave1b/`).

## Phase 5: POS Follow-up Fixes

- [x] 5.1 RED/GREEN: Add widget test for compact-height `PinPad` rendering without overflow and implement responsive spacing/aspect ratio.
- [x] 5.2 RED/GREEN: Add user-management widget test validating new user save invokes repository persistence.
- [x] 5.3 REFACTOR: Ensure user dialog uses stable injected ViewModel and await save before dismissing.

## Phase 6: Warning Follow-up Corrections

- [x] 6.1 Fix unsafe assignment/member-access lint errors in `apps/admin_backend/src/migrations/1765000000000-CreateAuditIntegrityAlerts.spec.ts`.
- [x] 6.2 Improve assertion quality in `apps/admin_backend/src/core/app/app.module.masterdata.spec.ts` and `apps/pos_app/test/ui/features/identity/user_management_view_test.dart`.
- [x] 6.3 Raise changed-file evidence quality for touched Flutter files (`user_management_view.dart`, `lock_screen_view.dart`, `app_drawer.dart`, `main.dart`) with focused widget coverage.
- [x] 6.4 Sync `apply-progress.md` test-case counts with executed evidence.

## Phase 7: Final Verify-Blocker Corrective

- [x] 7.1 RED/GREEN: Harden `1765000000000-CreateAuditIntegrityAlerts.spec.ts` to assert catalog state on the same `QueryRunner` connection used by migration `up/down`.
- [x] 7.2 REFACTOR: Stabilize migration runtime harness teardown/search_path handling for deterministic `down` and `up/down/up` behavior.
- [x] 7.3 RED/GREEN: Remove duplicated bootstrap in `1764000000000-EnforceAuditLogImmutability.spec.ts` through shared isolated-schema harness and explicit timeout budget.
- [x] 7.4 Verification evidence refresh: run targeted backend migration specs + default `npm test`, then reconcile `apply-progress.md` evidence totals with this corrective batch.
