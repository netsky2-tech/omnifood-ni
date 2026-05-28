# Delta for Identity

## ADDED Requirements

### Requirement: Supervisor Override (PIN and TOTP)

The system MUST allow supervisors to authorize restricted actions completely offline using either their local PIN or a TOTP token.

#### Scenario: Supervisor authorizes action with PIN
- GIVEN a cashier attempts a restricted action
- WHEN the supervisor override modal is presented
- AND the supervisor enters a valid PIN
- THEN the action MUST be authorized.

#### Scenario: Supervisor authorizes action with TOTP offline
- GIVEN the POS is offline
- AND a cashier attempts a restricted action
- WHEN the supervisor override modal is presented
- AND the supervisor enters a valid TOTP token
- THEN the system MUST validate the token against the supervisor's `SecurityProfile`
- AND the action MUST be authorized.

### Requirement: Security Profile Isolation

The system MUST isolate authentication credentials (PIN hashes, TOTP seeds) into a dedicated `SecurityProfile` aggregate.

#### Scenario: Syncing user data
- GIVEN the POS syncs staff data from the cloud
- WHEN the data is saved locally
- THEN authentication details MUST be stored in the `SecurityProfile` separately from `User` data.

### Requirement: Forensic Audit Logging

The system MUST create immutable `ForensicAuditLog` entries for sensitive actions, tracking the exact authorization context with cryptographic or strict sequential validation.

#### Scenario: Action authorized by another user
- GIVEN a restricted action is authorized by a supervisor
- WHEN the audit log is generated
- THEN it MUST include `usuario_autorizador_id`
- AND it MUST include `metodo_autorizacion` (e.g., 'PIN' or 'TOTP').

#### Scenario: Drawer open triggers log
- GIVEN the cash drawer is opened
- WHEN the hardware trigger occurs
- THEN the system MUST append a drawer open event to the `ForensicAuditLog`.
