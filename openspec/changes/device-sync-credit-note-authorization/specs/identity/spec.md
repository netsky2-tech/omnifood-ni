# Delta for Identity

## ADDED Requirements

### Requirement: Credit-note local PIN authorization eligibility

The POS MUST require explicit local PIN reauthentication for each credit note, accept only an active same-tenant `MANAGER` or `OWNER`, and record the human actor, role, and method as immutable authorization history. The operating manager or owner MAY authorize their own credit note; dual custody is not required. `DeviceSyncPrincipal` MUST remain transport-only and MUST NOT supply or synthesize human identity, role, or permission.

#### Scenario: Eligible manager self-authorizes
- GIVEN an active same-tenant manager is operating the canonical terminal
- WHEN the manager enters the correct local PIN for a credit note
- THEN the POS MUST authorize that credit note
- AND record the manager identity, `MANAGER` role, and `PIN` method in immutable evidence.

#### Scenario: Wrong or inactive actor is denied
- GIVEN the selected actor has an incorrect PIN, is inactive, or is not a manager or owner in the tenant
- WHEN authorization is attempted
- THEN the POS MUST deny authorization
- AND MUST NOT create syncable authorization evidence.

### Requirement: Verifiable authorization evidence integrity

Authorization evidence MUST be immutable, single-use, tenant-scoped, terminal-bound, and verifiable against the exact versioned canonical payload digest. Evidence MUST include `authorizationAuditId`, actor identity and role, authorization method, canonical terminal identity, target credit note, origin invoice and items, amounts, reason/policy, and all fields required to prevent substitution. Integrity verification MUST be specified by outcomes and MUST NOT require an unstated signature algorithm.

#### Scenario: Evidence substitution fails closed
- GIVEN evidence whose actor, role, tenant, terminal, target, origin, item, amount, reason, version, or digest differs from the submitted credit note
- WHEN the backend verifies the evidence
- THEN it MUST reject the record with a stable deterministic authorization error
- AND MUST not attribute authority to the device principal.

#### Scenario: Evidence cannot depend on elapsed time
- GIVEN valid evidence created offline with a timestamp affected by clock age or drift
- WHEN it is later synchronized
- THEN the backend MUST not reject it solely because a TTL elapsed or the device clock differs.

### Requirement: Append-only rejection remediation

A definitive authorization rejection MUST preserve the rejected evidence and fiscal history and MAY be remediated only by appending new explicit local PIN authorization evidence bound to the unchanged or newly approved exact payload. Legacy pending credit notes lacking evidence MUST remain preserved and MUST require this local reauthorization; the backend MUST provide no evidence-free grace bypass.

#### Scenario: Legacy pending record is reauthorized
- GIVEN a pending local credit note has no authorization evidence
- WHEN an eligible manager or owner explicitly reauthenticates locally
- THEN the original pending record MUST remain preserved
- AND a new bound authorization event MUST be appended for synchronization.

#### Scenario: Rejected evidence remains inspectable
- GIVEN the backend definitively rejects authorization evidence
- WHEN the operator remediates the record
- THEN the rejected evidence and prior fiscal history MUST remain unchanged
- AND only newly appended evidence MAY be submitted.
