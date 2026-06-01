# Delta for identity-audit-integrity-monitoring

## ADDED Requirements

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
