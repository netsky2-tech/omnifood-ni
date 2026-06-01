# identity-audit-integrity-monitoring Specification

## Purpose

Define tenant-safe nightly monitoring that detects audit sequence gaps on active identity audit streams and records actionable evidence.

## Requirements

### Requirement: Nightly tenant-scoped gap monitoring

The system MUST execute a nightly integrity-monitoring run over identity audit streams grouped by `(tenant_id, device_id, user_id)`.
The system MUST evaluate continuity using `sequence_no` and include only rows with `forensic_status='ACTIVE'`.
The system MUST produce alert evidence when one or more sequence numbers are missing in a tenant stream.
The system MUST keep evidence tenant-scoped so one tenant cannot view another tenant's integrity results.

#### Scenario: Nightly run emits evidence for missing sequence

- GIVEN tenant `T1` stream sequences are `101,102,104` for active rows
- WHEN the nightly monitoring run executes
- THEN the system MUST record evidence for missing `103`
- AND the evidence MUST reference tenant `T1` only.

#### Scenario: Nightly run with no gaps

- GIVEN tenant `T1` active stream sequences are continuous
- WHEN the nightly monitoring run executes
- THEN the system MUST record no gap alert evidence for that stream.

### Requirement: Alert deduplication across unchanged gaps

The system SHOULD avoid emitting duplicate alerts for the same tenant stream gap when no new discontinuity appears between nightly runs.

#### Scenario: Unchanged gap is not re-alerted

- GIVEN a prior run already recorded tenant `T1` stream gap `205`
- WHEN the next nightly run sees the same unchanged gap set
- THEN the system SHOULD suppress duplicate alert evidence for that unchanged gap.

### Requirement: Runtime migration proof for audit integrity alerts table

The system MUST provide real PostgreSQL runtime evidence that migration `1765000000000-CreateAuditIntegrityAlerts.ts` creates and rolls back the alert-evidence storage objects required by identity audit integrity monitoring.

#### Scenario: Migration up creates alert integrity storage

- GIVEN a clean PostgreSQL schema
- WHEN migration `1765000000000-CreateAuditIntegrityAlerts.ts` runs `up`
- THEN the run MUST succeed without SQL errors
- AND audit-integrity alert storage objects MUST exist for evidence writes.

#### Scenario: Migration down removes alert integrity storage

- GIVEN the same schema after successful `up`
- WHEN migration `1765000000000-CreateAuditIntegrityAlerts.ts` runs `down`
- THEN the run MUST succeed without SQL errors
- AND objects created by `up` MUST be removed.

#### Scenario: Up-down-up remains deterministic

- GIVEN a schema where `up` and `down` were executed once
- WHEN `up` is executed again in a new runtime cycle
- THEN the migration MUST complete successfully
- AND resulting storage objects MUST match the first successful `up` state.
