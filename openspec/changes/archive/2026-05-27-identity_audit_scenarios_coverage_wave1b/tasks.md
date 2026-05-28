# Tasks: Identity Audit Scenarios Coverage Wave1B

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 380-560 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (Slice 1 immutability) -> PR 2 (Slice 2 nightly gap detector) |
| Delivery strategy | ask-always |
| Chain strategy | feature-branch-chain |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Enforce append-only audit logs at DB level | PR 1 | Base: main; includes trigger migration + immutability evidence tests |
| 2 | Add nightly ACTIVE-stream gap detector with dedup evidence | PR 2 | Base depends on PR 1; scheduler + service + table + specs/tests |

## Phase 1: Foundation (Schema + Module Wiring)

- [x] 1.1 Create `apps/admin_backend/src/migrations/<ts>-EnforceAuditLogImmutability.ts` to add reject function + `BEFORE UPDATE OR DELETE` trigger on `audit_logs`, plus rollback drop.
- [x] 1.2 Create `apps/admin_backend/src/migrations/<ts>-CreateAuditIntegrityAlerts.ts` for `audit_integrity_alerts` and unique index `(tenant_id, device_id, user_id, signature)`.
- [x] 1.3 Create `apps/admin_backend/src/modules/identity/entities/audit-integrity-alert.entity.ts` with tenant-scoped fields and timestamps for evidence.
- [x] 1.4 Modify `apps/admin_backend/src/modules/identity/identity.module.ts` to register new entity/service providers.
- [x] 1.5 Modify `apps/admin_backend/src/core/app/app.module.ts` to import `ScheduleModule.forRoot()` once at root.

## Phase 2: Slice 1 - Immutability Trigger

- [x] 2.1 RED: Create `apps/admin_backend/src/migrations/<ts>-EnforceAuditLogImmutability.spec.ts` asserting `UPDATE/DELETE` on seeded `audit_logs` row throws immutability error.
- [x] 2.2 GREEN: Implement trigger migration SQL until spec passes, verifying original row remains unchanged after failed mutation.
- [x] 2.3 Extend `apps/admin_backend/src/modules/identity/controllers/audit.controller.spec.ts` to verify ingest INSERT path still succeeds with trigger present.

## Phase 3: Slice 2 - Nightly Gap Detector

- [x] 3.1 RED: Create `apps/admin_backend/src/modules/identity/services/audit-integrity.service.spec.ts` for ACTIVE-only gap detection, tenant isolation, and dedup (no duplicate unchanged alerts).
- [x] 3.2 GREEN: Create `apps/admin_backend/src/modules/identity/services/audit-integrity.service.ts` with nightly scan query over `(tenant_id, device_id, user_id)` and signature generation.
- [x] 3.3 Implement persistence branch: insert new gap signatures into `audit_integrity_alerts`, update `last_seen_at` for unchanged gaps, emit events only for new signatures.
- [x] 3.4 Add nightly cron hook `0 2 * * *`, `timeZone: 'America/Managua'`, `waitForCompletion: true`, invoking `runNightly()` without cross-tenant leakage.

## Phase 4: Verification + Documentation

- [x] 4.1 Add/adjust integration evidence in migration or repository-level tests proving DB-level mutation rejection and rollback safety.
- [x] 4.1a Corrective: replace mocked immutability assertions with real Postgres-backed UPDATE/DELETE rejection evidence.
- [x] 4.1b Corrective: add real DB evidence that INSERT path remains valid with trigger installed.
- [x] 4.1c Corrective: resolve lint regression (`@typescript-eslint/require-await`) in migration spec.
- [x] 4.2 Add scenario-aligned tests for: tenant `T1` gap detected, `T2` hidden, non-`ACTIVE` rows ignored, unchanged gaps not re-alerted.
- [x] 4.2a Corrective: add runtime assertions for new-gap side effects (`alertRepository.insert` + `eventEmitter.emit`) and mixed ACTIVE/non-ACTIVE filtering behavior.
- [ ] 4.3 Update change docs under `openspec/changes/identity_audit_scenarios_coverage_wave1b/` if task execution reveals contract clarifications from open questions.
