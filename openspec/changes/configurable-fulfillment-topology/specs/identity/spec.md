# Delta for identity

## ADDED Requirements

### Requirement: Activation and Reprint Authorization Audit
The system MUST restrict emergency activation and reprints by explicit permission, require reason where configured, and append immutable tenant-scoped audit evidence containing actor, role, device, time, target, and revision or copy identity.

#### Scenario: Audited emergency activation
- GIVEN an authorized supervisor provides a reason during an active shift
- WHEN emergency activation is approved
- THEN the new revision SHALL be recorded with complete audit evidence.

#### Scenario: Unauthorized reprint
- GIVEN a cashier lacks reprint permission
- WHEN the cashier requests a copy
- THEN the request MUST be denied and no print or business effect SHALL be created.

### Requirement: Tenant-Isolated Authorization Data
Authorization and audit reads and writes MUST enforce tenant isolation through RLS, and audit records MUST remain append-only.

#### Scenario: RLS isolation
- GIVEN users and audit records exist for tenants T1 and T2
- WHEN a T1 session queries them
- THEN it SHALL receive only T1 records and MUST NOT mutate audit history.
