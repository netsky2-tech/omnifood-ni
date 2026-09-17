# Offline Human Authorization Specification

## Purpose
Provide reusable, device-attributed evidence that enrolled POS software reported fresh local PIN reauthentication, without claiming cryptographic proof of physical PIN entry or protection from a compromised device or process.

## Requirements

### Requirement: Versioned Authorization Assertion Contract
Each assertion MUST use a versioned contract bound to tenant, canonical enrolled terminal, epoch sequence and digest, authorizer, operator, operation type, exact canonical operation digest, assertion ID, local sequence/audit linkage, and declared application-sandbox/software trust level. It MUST contain no PIN or verifier material.

#### Scenario: Exact assertion binding
- GIVEN POS software successfully authorizes operation O under acknowledged epoch E
- WHEN it creates an assertion
- THEN the assertion MUST contain all required bindings and a unique replay-relevant identity
- AND it MUST declare software trust as application-sandbox evidence
- AND it MUST not claim physical-entry proof or non-repudiation.

### Requirement: Reusable Backend Admissibility Verification
The backend MUST expose reusable verification that runs under tenant row-level isolation and checks transport attribution, canonical tenant and terminal binding, acknowledgement history and floor, policy eligibility, exact assertion bindings, integrity facts, and duplicate/replay-relevant identity. DeviceSyncPrincipal MUST authenticate transport only and MUST never become a human principal.

#### Scenario: Admit a valid assertion
- GIVEN an assertion arrives through the enrolled terminal's authenticated Device Sync transport
- WHEN reusable verification evaluates it under the tenant context
- THEN it MUST return an immutable admissibility result/receipt and verification facts only when every binding and policy check passes.

#### Scenario: Deny substitution or transport-only authority
- GIVEN an assertion has a foreign tenant/terminal, stale epoch, mismatched operation digest, duplicate identity, or only a DeviceSyncPrincipal identity
- WHEN verification runs
- THEN it MUST deny admissibility
- AND MUST NOT create or infer human authority from the transport principal.

### Requirement: Domain Consumption Boundary
The verifier MUST return immutable admissibility facts and MUST NOT own a consuming domain's transaction. Each consumer MUST atomically consume the admissibility result with its business effect and idempotency decision.

#### Scenario: Atomic consumer retry
- GIVEN a consumer receives an admissible receipt for an operation
- WHEN it commits the business effect and assertion consumption, including a retry
- THEN the consumer MUST produce at most one business effect
- AND the prerequisite verifier MUST remain independent of that transaction.

### Requirement: Online Re-enrollment Token Lifecycle
Integrity recovery MUST be online-only and require a single-use token bound to the tenant and canonical terminal, expiring 15 minutes after issuance. Only an active same-tenant OWNER or MANAGER MAY issue it. Issuance, redemption, expiry, revocation, denial, and race outcomes MUST be immutable audit facts; wrong-tenant, wrong-terminal, expired, revoked, reused, and offline redemption MUST be denied.

#### Scenario: Valid redemption
- GIVEN an active same-tenant OWNER or MANAGER issued an unrevoked token for terminal D within the last 15 minutes
- WHEN D redeems it online through authenticated transport
- THEN redemption MUST succeed once, restore only the authorized recovery state, and record immutable issuance and redemption facts.

#### Scenario: Invalid or racing redemption
- GIVEN a token is expired, revoked, already redeemed, presented offline, or bound to another tenant or terminal
- WHEN redemption is attempted, including concurrent attempts
- THEN redemption MUST fail closed
- AND at most one concurrent attempt MAY succeed
- AND the outcome MUST be immutably audited.

### Requirement: Rollout and Rollback Safety
The capability MUST activate only when both tenant cohort approval and a compatible POS/backend build pair are present. Unsupported clients MUST fail closed. Rollback MUST preserve epochs, acknowledgements, assertions, audit facts, pending domain records, and consumption evidence.

#### Scenario: Compatibility gate
- GIVEN either the tenant is outside the approved cohort or the build pair is incompatible
- WHEN the client or backend evaluates enablement
- THEN human authorization assertion creation and acceptance MUST remain disabled
- AND no fallback authorization path MAY be enabled.

#### Scenario: Non-destructive rollback
- GIVEN a participating release is rolled back or disabled
- WHEN the rollback completes
- THEN all authorization and pending-operation evidence MUST remain available for reconciliation without loss or duplicate business effect.

### Requirement: Observability and Ownership
The system MUST provide tenant-scoped monitoring and immutable audit facts for policy publication and acknowledgement, lag and disconnection, assertion outcomes and stable reasons, integrity failures, recovery lifecycle, rollout gates, retries, and consumer outcomes without logging PINs or verifier material. Each tenant OWNER MUST own acceptance and monitoring of delayed revocation and epoch lag.

#### Scenario: Safe operational investigation
- GIVEN an OWNER or authorized operations role investigates a delayed or rejected authorization
- WHEN telemetry and audit facts are queried
- THEN they MUST identify tenant, terminal, epoch, authorizer, operation digest identifier, reason, and lifecycle correlation
- AND MUST exclude PINs and reusable verifiers.

### Requirement: Accepted Residual Threat Boundary
The capability MUST explicitly treat rooted devices, modified APKs, runtime hooks, compromised processes, copied verifiers, collusion, and device theft as outside or residual risks of the application-sandbox trust model. It MUST NOT represent an assertion as cryptographic human non-repudiation.

#### Scenario: Compromised client fabrication
- GIVEN a rooted or modified terminal fabricates a successful local authorization
- WHEN the backend verifies the resulting assertion
- THEN it MAY attribute the claim to the enrolled terminal and evaluate protocol bindings
- BUT it MUST NOT claim to detect or prevent the compromise or prove physical PIN entry.

### Requirement: DSI Capability Boundaries
DSI-6 MUST consume this reusable contract while defining its own eligibility, canonical operation, idempotency, and atomic business effect. DSI-7 MUST remain the owner of device transport lifecycle, and DSI-8 MUST remain the owner of acceptance; none may be absorbed into this capability.

#### Scenario: Separate downstream adoption
- GIVEN DSI-6 adopts the reusable admissibility receipt
- WHEN its later specification is authored
- THEN it MUST define its consumer policy and atomic consumption separately
- AND DSI-7 and DSI-8 responsibilities MUST remain separate.
