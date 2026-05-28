# Design: Identity Audit Scenarios Coverage Wave1B

## Technical Approach

Add two backend slices in the existing identity module: (1) a PostgreSQL migration that makes `audit_logs` physically append-only, and (2) a nightly integrity-monitoring service that scans only `forensic_status='ACTIVE'` streams, persists tenant-scoped gap evidence, and emits one alert per newly observed gap signature. This extends the current insert-time continuity checks in `AuditController` without changing offline ingest behavior.

## Architecture Decisions

| Decision | Alternatives considered | Rationale |
|---|---|---|
| Enforce immutability with a DB trigger on `audit_logs` | Controller/service guards only | DB rejection is the only control that satisfies S-AUDIT-01 against direct SQL mutations and keeps SQLite→Postgres sync evidence defensible. |
| Add a dedicated `AuditIntegrityService` in `identity/services` | Put scan logic in controller; raw script outside Nest | Existing module keeps business rules in services, controllers thin, and makes nightly execution testable under strict TDD. |
| Persist gap evidence in a new tenant-scoped table (`audit_integrity_alerts`) | Log-only alerts; ephemeral event emission | Dedup across nightly runs requires durable state. A table gives audit evidence, rollback visibility, and no UI dependency. |
| Use Nest `ScheduleModule` cron hook at app root | OS cron/manual command only | The repo already uses Nest modules/services. `@nestjs/schedule` integrates cleanly with DI and supports `waitForCompletion` for safe nightly runs. |

## Data Flow

POS/app sync -> `POST /identity/audit` -> `audit_logs` INSERT only
                                      -> DB trigger blocks UPDATE/DELETE

Nightly cron (`identity-audit-integrity-nightly`)
-> `AuditIntegrityService.runNightly()`
-> SQL gap scan on ACTIVE rows
-> upsert `audit_integrity_alerts`
-> emit event only for newly inserted/changed gaps

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `apps/admin_backend/src/migrations/<timestamp>-EnforceAuditLogImmutability.ts` | Create | Creates reject function/trigger and drops them on rollback. |
| `apps/admin_backend/src/migrations/<timestamp>-EnforceAuditLogImmutability.spec.ts` | Create | Verifies migration SQL under RED/GREEN flow. |
| `apps/admin_backend/src/migrations/<timestamp>-CreateAuditIntegrityAlerts.ts` | Create | Creates evidence table and unique dedup index. |
| `apps/admin_backend/src/modules/identity/entities/audit-integrity-alert.entity.ts` | Create | Tenant-scoped persisted alert evidence model. |
| `apps/admin_backend/src/modules/identity/services/audit-integrity.service.ts` | Create | Runs query, computes signatures, upserts evidence, emits alert events. |
| `apps/admin_backend/src/modules/identity/services/audit-integrity.service.spec.ts` | Create | Unit tests for gap detection, tenant isolation, and dedup. |
| `apps/admin_backend/src/modules/identity/identity.module.ts` | Modify | Register new entity/service provider. |
| `apps/admin_backend/src/core/app/app.module.ts` | Modify | Import `ScheduleModule.forRoot()` and keep scheduler root-scoped. |
| `apps/admin_backend/src/modules/identity/controllers/audit.controller.spec.ts` | Modify | Add immutability rejection evidence and guard current insert path. |

## Interfaces / Contracts

```ts
type AuditGapEvidence = {
  tenantId: string;
  deviceId: string;
  userId: string;
  gapStart: number;
  gapEnd: number;
  signature: string; // sha256(tenant|device|user|gapStart|gapEnd)
};
```

Gap scan query shape:

```sql
WITH ordered AS (
  SELECT tenant_id, device_id, user_id, sequence_no,
         LAG(sequence_no) OVER (
           PARTITION BY tenant_id, device_id, user_id
           ORDER BY sequence_no
         ) AS prev_sequence_no
  FROM audit_logs
  WHERE forensic_status = 'ACTIVE'
)
SELECT tenant_id, device_id, user_id,
       prev_sequence_no + 1 AS gap_start,
       sequence_no - 1 AS gap_end
FROM ordered
WHERE prev_sequence_no IS NOT NULL
  AND sequence_no > prev_sequence_no + 1;
```

Alert dedup: unique index on `(tenant_id, device_id, user_id, signature)`. Unchanged gaps update `last_seen_at` only; new signatures insert evidence and trigger downstream alert emission.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | Gap query mapping, signature generation, dedup branches | Add `audit-integrity.service.spec.ts` first (strict TDD RED), mock repository/DataSource/EventEmitter. |
| Integration | DB immutability trigger and alert table migration SQL | Migration spec files plus repository-level test proving UPDATE/DELETE throws and row remains intact. |
| E2E | Existing audit ingest still inserts valid logs, multi-tenant gap run stays scoped | Extend `audit.controller.spec.ts`; optional focused job invocation test without waiting for wall-clock cron. |

## Migration / Rollout

Deploy in two slices. Slice 1 applies immutability trigger only. Slice 2 adds schedule dependency, evidence table, and cron job at `0 2 * * *` with `timeZone: 'America/Managua'` and `waitForCompletion: true`. Rollback reverses in dependency order: disable/remove cron provider, drop evidence table, then drop immutability trigger/function. No data rewrite or historical gap backfill is required.

## Open Questions

- [ ] Confirm whether alert evidence should remain identity-local only or also notify `NotificationsModule` listeners externally.
- [ ] Confirm acceptable retention policy for resolved/stale gap evidence rows; current design keeps them as audit trail.
