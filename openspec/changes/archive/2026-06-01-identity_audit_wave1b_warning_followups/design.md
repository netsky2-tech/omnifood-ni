# Design: Identity Audit Wave1B Warning Followups

## Technical Approach

Keep the change narrow: add a dedicated real-Postgres runtime spec for `1765000000000-CreateAuditIntegrityAlerts.ts`, fix Jest shutdown at the leaking test boundary instead of changing runner defaults, and close Wave1B task `4.3` through new follow-up artifacts that reference the dated archive path required by `openspec-archive-consistency`.

## Architecture Decisions

| Decision | Options | Choice | Rationale |
|---|---|---|---|
| Migration proof shape | Mocked `QueryRunner`; reuse existing spec file; dedicated runtime spec | Create `apps/admin_backend/src/migrations/1765000000000-CreateAuditIntegrityAlerts.spec.ts` with real `DataSource` + isolated schema | Matches the existing `176400...spec.ts` runtime harness pattern, proves real SQL behavior, and keeps review scope localized to the target migration. |
| Jest warning fix | Add `--forceExit`/`--runInBand`; reduce workers; close leaked Nest resources | Add teardown parity in `app.module.masterdata.spec.ts` and only inspect other bootstrap specs if warning remains | The warning is accepted debt from default parallel mode; masking it in `package.json` would hide leaked TypeORM/Scheduler handles created by `AppModule`. |
| Archive cleanup | Edit archived Wave1B files; leave stale task open; close via follow-up docs | Preserve `openspec/changes/archive/2026-05-27-identity_audit_scenarios_coverage_wave1b/` unchanged and record closure in current follow-up artifacts using canonical dated paths | The archive is evidence. The new spec explicitly forbids rewriting archived truth for consistency cleanup. |

## Data Flow

```text
Jest worker
  -> migration runtime spec
     -> Postgres DataSource.initialize()
     -> CREATE SCHEMA + SET search_path
     -> migration.up/down
     -> information_schema / pg_indexes assertions
     -> DROP SCHEMA + DataSource.destroy()

Jest parallel suite
  -> app.module.masterdata.spec.ts
     -> Test.createTestingModule(AppModule)
     -> TypeORM pool + scheduler/event providers start
     -> afterAll module.close()
     -> Nest disposes resources before worker exit

Wave1B follow-up docs
  -> current change artifacts
  -> canonical archive path references
  -> task 4.3 closed without editing archived files
```

## File Changes

| File | Action | Description |
|---|---|---|
| `apps/admin_backend/src/migrations/1765000000000-CreateAuditIntegrityAlerts.spec.ts` | Create | Runtime Postgres harness for `up`, `down`, and `up -> down -> up` determinism. |
| `apps/admin_backend/src/core/app/app.module.masterdata.spec.ts` | Modify | Add `afterAll(async () => await module.close())` and keep bootstrap pattern aligned with `app.module.spec.ts`. |
| `apps/admin_backend/package.json` | Preserve unless verification proves necessary | Default `jest` command remains unchanged; this change should fix code-level leakage, not runner policy. |
| `openspec/changes/identity_audit_wave1b_warning_followups/tasks.md` | Modify (future phase) | Record task `4.3` closure against the canonical archived folder. |
| `openspec/changes/identity_audit_wave1b_warning_followups/verify-report.md` | Modify (future phase) | Capture warning removal evidence and resolved archive references. |

## Interfaces / Contracts

```ts
type AlertStorageState = {
  tableExists: boolean;
  uniqueIndexExists: boolean;
};
```

The runtime spec will assert this contract after `up`, after `down`, and after a second `up` using catalog queries scoped to the temporary schema.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit/runtime migration | `CreateAuditIntegrityAlerts` creates table + unique index | Execute `up` against real Postgres in an isolated schema and query catalogs for object existence. |
| Unit/runtime migration | `down` removes created objects | Run `down` after successful `up`; assert table/index are absent. |
| Unit/runtime migration | Re-apply determinism | Run `up -> down -> up` in fresh runtime flow and compare resulting object state. |
| Suite | Default `npm test` exits cleanly | Verify parallel Jest run without worker-exit warning after teardown parity change; do not rely on `--forceExit`. |
| Docs/verification | Task `4.3` closure consistency | Verify follow-up artifacts cite `openspec/changes/archive/2026-05-27-identity_audit_scenarios_coverage_wave1b/` and all referenced files resolve there. |

## Migration / Rollback

No production data migration is introduced beyond proving an existing migration. Rollback is low-risk: remove the new runtime spec, revert the teardown change, and revert follow-up OpenSpec artifact updates. The migration under test already keeps `DROP ... IF EXISTS` semantics, so rollback verification remains runtime-safe.

## Risks

- Existing real-Postgres specs already run longer than Jest's default timeout in this repo; the new harness must use explicit per-test timeout budgeting or it may add flaky failures.
- If the worker-exit warning has a second source beyond `app.module.masterdata.spec.ts`, the change stays small by fixing confirmed teardown parity first and documenting any residual blocker before broadening scope.

## Open Questions

- [ ] Should the existing `1764000000000-EnforceAuditLogImmutability.spec.ts` timeout handling be normalized in the same follow-up if it blocks clean `npm test` verification, or deferred to a separate hardening change?
