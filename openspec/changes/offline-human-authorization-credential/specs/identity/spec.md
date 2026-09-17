# Delta for Identity

## ADDED Requirements

### Requirement: Staff Policy Epochs
The system MUST publish tenant-scoped, strictly monotonic staff-policy epochs containing the active user/role/permission projection and portable one-way PIN verifiers for enrolled same-tenant terminals. Epoch authenticity MUST rely on existing authenticated HTTPS and Device Sync JWT delivery and MUST NOT claim detached epoch-signature authenticity.

#### Scenario: Deliver a valid newer policy
- GIVEN an enrolled terminal requests authenticated inbound policy synchronization for tenant T
- WHEN the backend delivers a valid epoch newer than the terminal's known epoch
- THEN the epoch MUST be scoped to T and include active eligibility data and one-way PIN verifiers
- AND the delivery MUST be accepted only through the authenticated transport
- AND no detached-signature claim MUST be made.

#### Scenario: Reject invalid policy scope or rollback
- GIVEN a terminal receives an epoch with a foreign tenant scope, invalid digest, or sequence not newer than its accepted epoch
- WHEN the terminal validates the delivery
- THEN it MUST reject the epoch and MUST NOT activate or acknowledge it.

### Requirement: Atomic Epoch Activation and Acknowledgement
The POS MUST advance a valid newer epoch through an explicit crash-safe state machine — receive/pending, an intermediate acknowledgement-pending state in which offline authorization is frozen, and the completed acknowledged state — converging after any crash to a complete state, never a partially applied epoch. Duplicate delivery and acknowledgement retries MUST be idempotent; stale or rolled-back epochs MUST be rejected. After reconnect, the backend-recorded acknowledgement floor is authoritative.

#### Scenario: Crash during activation
- GIVEN a valid newer epoch is being applied and the POS has entered the intermediate acknowledgement-pending state
- WHEN the POS process or device loses power at any point before the new epoch is completely acknowledged
- THEN recovery MUST converge to exactly one complete state: the prior complete acknowledged epoch (if the freeze had not yet committed), the completely acknowledged new epoch (after idempotent acknowledgement retry), or fail-closed integrity loss
- AND while the intermediate acknowledgement-pending state persists, the POS MUST NOT authorize any operation under either epoch
- AND recovery MUST never expose a partially applied epoch for authorization.

#### Scenario: Acknowledgement-pending freeze is not a bypass
- GIVEN the POS is in the intermediate acknowledgement-pending state after a crash or reconnect
- WHEN the POS recovers and retries the acknowledgement
- THEN it MUST either complete acknowledgement of the same sequence and digest idempotently or fail closed into integrity loss
- AND it MUST NOT fall back to authorizing under the prior epoch.

#### Scenario: Retry and server floor
- GIVEN an epoch or acknowledgement is delivered more than once or a terminal reconnects after local rollback
- WHEN synchronization retries
- THEN duplicate work MUST not change the accepted sequence/digest
- AND the server acknowledgement floor MUST prevent reliance on any older epoch.

### Requirement: Delayed Revocation
A terminal MUST evaluate offline authorization against its last acknowledged epoch. A policy change becomes effective for that terminal only after acknowledgement of a newer epoch; acknowledged epochs and their resulting offline proofs MUST have no wall-clock TTL.

#### Scenario: Disconnected terminal retains admissibility
- GIVEN a terminal is disconnected indefinitely and its last acknowledged epoch still permits a user
- WHEN the user creates an otherwise valid offline authorization
- THEN the authorization MUST remain admissible under that acknowledged epoch after reconnection.

### Requirement: Fresh Local PIN Authorization
The POS MUST authorize a supported operation only after fresh local PIN verification against an active user in the terminal's acknowledged epoch with the required role and permission. Operator/authorizer separation MUST remain consumer policy; DSI-6 MAY permit self-authorization after fresh PIN reauthentication. PINs and verifiers MUST never be included in assertions, logs, sync receipts, or error output.

#### Scenario: Eligible authorization
- GIVEN an active acknowledged epoch permits authorizer A for operation type O
- WHEN A freshly supplies the correct local PIN for O
- THEN the POS MUST create an operation-bound assertion
- AND MUST disclose neither the PIN nor the verifier.

#### Scenario: Ineligible or stale authorization
- GIVEN the user is inactive, lacks the required permission, or the epoch is not acknowledged
- WHEN the user attempts authorization
- THEN the POS MUST deny it and MUST NOT create an assertion.

### Requirement: Durable User-Terminal Attempt Controls
Failed PIN counters and backoff state MUST be keyed by user and terminal, persist across process restart, and cannot be bypassed by restarting the process. Any reset MUST be an explicit permitted authentication or administrative event and MUST produce an immutable audit fact.

#### Scenario: Restart cannot bypass backoff
- GIVEN user U on terminal D has reached a failed-attempt backoff
- WHEN the POS process restarts and U retries
- THEN the same backoff state MUST still apply.

#### Scenario: Audited reset
- GIVEN an authorized reset event is performed
- WHEN the reset completes
- THEN the attempt state MUST be reset only for its declared user-terminal scope
- AND an immutable audit fact MUST record the reset reason and actor without secret material.

### Requirement: Integrity Loss Fails Closed
Missing, corrupt, mismatched, rolled-back, reinstalled, cleared, unsupported-schema, or incompatible-build authorization state MUST disable offline human authorization. The POS MUST NOT fall back to stale authority, device-only authorization, or a weaker check.

#### Scenario: Detect integrity loss
- GIVEN protected authorization state is missing, corrupt, inconsistent, or associated with an incompatible build
- WHEN the POS attempts local authorization
- THEN it MUST fail closed and require online recovery
- AND MUST NOT create an assertion.
