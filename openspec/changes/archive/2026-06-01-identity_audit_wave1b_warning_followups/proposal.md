# Proposal: Identity Audit Wave1B Warning Followups

## Intent

Close Issue #24 by removing the three accepted Wave1B warnings before the next audit wave: missing runtime proof for `1765000000000-CreateAuditIntegrityAlerts.ts`, unstable Jest worker shutdown in default `npm test`, and stale OpenSpec cleanup references for archived Wave1B artifacts.

## Scope

### In Scope
- Add a real Postgres up/down migration harness for `CreateAuditIntegrityAlerts`.
- Identify and fix the default parallel Jest worker-exit warning, starting with missing teardown parity.
- Reconcile archived Wave1B docs/task references so cleanup item `4.3` is consistently closed.

### Out of Scope
- Broad backend test-suite hygiene beyond the root cause needed to clear the warning.
- New identity features or audit-rule expansion beyond Wave1B follow-up hardening.

## Capabilities

### New Capabilities
- `openspec-archive-consistency`: Defines how archived change artifacts and follow-up changes keep dated archive paths and cleanup status consistent without rewriting archived evidence.

### Modified Capabilities
- `identity-audit-integrity-monitoring`: Require runtime migration proof for alert-table creation/rollback that supports integrity monitoring evidence storage.
- `infrastructure`: Require default backend validation (`npm test`) to complete in parallel mode without forced worker-exit warnings.

## Approach

Reuse the existing real-Postgres migration harness pattern from `1764000000000-EnforceAuditLogImmutability.spec.ts`, apply the same runtime up/down strategy to `1765000000000-CreateAuditIntegrityAlerts.ts`, then isolate Jest shutdown leakage by matching module teardown behavior and rerunning default parallel tests until the warning is gone or a single remaining cause is documented. Finish by updating follow-up OpenSpec artifacts instead of mutating archived truth.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/admin_backend/src/migrations/1765000000000-CreateAuditIntegrityAlerts.ts` | Modified | Runtime-proven up/down behavior |
| `apps/admin_backend/src/migrations/*.spec.ts` | Modified | Real Postgres harness coverage |
| `apps/admin_backend/src/core/app/app.module.masterdata.spec.ts` | Modified | Add deterministic teardown if confirmed root cause |
| `apps/admin_backend/package.json` | Modified | Keep `npm test` stable in default parallel mode |
| `openspec/changes/archive/2026-05-27-identity_audit_scenarios_coverage_wave1b/*` | Modified | Reference consistency review input |
| `openspec/changes/identity_audit_wave1b_warning_followups/*` | New/Modified | Proposal/specs/tasks for follow-up closure |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Worker-exit warning has multiple causes | Med | Fix incrementally, verify after each teardown change |
| Archive cleanup could blur historical record | Low | Update only follow-up artifacts/specs; preserve archived evidence |

## Rollback Plan

Revert the new migration harness, teardown/test runner adjustments, and follow-up OpenSpec edits; restore prior test configuration if warning stabilization introduces regressions.

## Dependencies

- Local/CI access to real PostgreSQL for migration runtime tests.

## Success Criteria

- [ ] `1765000000000-CreateAuditIntegrityAlerts.ts` has passing real-Postgres up/down tests.
- [ ] `npm test` in `apps/admin_backend` finishes without forced worker-exit warning.
- [ ] Wave1B follow-up docs close task `4.3` with consistent dated archive references.
