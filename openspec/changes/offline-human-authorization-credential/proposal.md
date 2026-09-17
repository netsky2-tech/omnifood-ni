# Proposal: Offline Human Authorization Credential

## Decision summary

Introduce a reusable, application-sandbox capability that lets an enrolled POS record a fresh local PIN authorization while disconnected and later synchronize a **device-attributed human authorization assertion**. The backend will evaluate the assertion against the tenant, terminal, exact operation digest, authorizer policy, and the terminal's acknowledged staff-policy epoch.

This deliberately narrows the original stronger objective. The first release does **not** try to prove physical PIN entry when the device is rooted, the APK is modified, or the POS process is compromised. It also does not introduce per-user signing keys, private-key escrow, detached epoch signatures, or a hardware-security dependency. It provides attributable evidence under the accepted software trust boundary so offline-first operations can synchronize safely.

## Problem

The POS can currently compare a manager PIN with a locally stored bcrypt verifier, but that check produces no reusable assertion for later synchronization. The backend sees only a Device Sync principal, which authenticates the terminal transport and must not be treated as a human authority. Consequently, sensitive offline operations such as DSI-6 credit notes either remain blocked at sync or would require an unsafe bypass.

The platform needs a coherent way to answer these questions after reconnection:

- Which enrolled tenant terminal claims that an eligible user completed fresh local authorization?
- Which exact operation was authorized?
- Which staff-policy epoch had that terminal acknowledged at the time?
- Has the assertion already been consumed for that operation?
- Did synchronization preserve the operation without bypass, loss, or duplication?

## Goals

1. Allow eligible users to authorize supported operations with a PIN on enrolled same-tenant terminals while disconnected.
2. Bind each assertion to the tenant, terminal, authorizer, policy epoch, and canonical digest of one exact operation.
3. Distribute portable one-way PIN verifiers and authorization policy through monotonic staff-policy epochs over existing authenticated inbound sync.
4. Record terminal epoch acknowledgement so policy changes become effective for that terminal after acknowledgement.
5. Persist PIN attempt controls per user-terminal across process restarts.
6. Fail closed after local authorization-state integrity loss and provide controlled online terminal re-enrollment.
7. Expose a reusable application/domain verification capability without absorbing the transaction rules of its consumers.
8. Preserve immutable lifecycle audit for re-enrollment token issuance, redemption, expiry, and revocation.

## Non-goals

- Resisting or detecting rooted-device, modified-APK, runtime-hook, or compromised-process fabrication of local authorization.
- Adding per-user asymmetric keys, PIN-derived signing keys, cloud-held private keys, private-key escrow, or a weaker fallback path.
- Requiring Android Keystore, StrongBox, TEE, biometrics, hardware attestation, or Q80 hardware probes for the first release.
- Adding detached signatures to staff-policy epochs; authenticity relies on HTTPS and the Device Sync JWT channel.
- Imposing a wall-clock TTL on acknowledged epochs or offline authorization solely because a terminal remains disconnected.
- Turning the Device Sync principal into a human principal.
- Defining DSI-6 credit-note eligibility, payload, limits, fiscal behavior, Kardex behavior, or transaction boundaries.
- Implementing DSI-7/DSI-8 transport credential revocation, recovery, or other device lifecycle policy.
- Creating one universal dual-custody rule. A consumer may permit self-authorization after fresh PIN reauthentication when its own policy allows it.

## Scope

### In scope

| Area | Proposed capability |
|---|---|
| Staff policy | Tenant-scoped, strictly monotonic epochs containing active users, roles/permissions, and portable one-way PIN verifiers for enrolled terminals. |
| Inbound sync | Epoch delivery through existing HTTPS + Device Sync JWT transport, with tenant/terminal validation, digest validation, atomic local activation, and acknowledgement. |
| Terminal state | Durable highest acknowledged sequence/digest, active epoch, and persistent per-user-terminal attempt/lockout state. |
| Local authorization | Fresh PIN verification against the active acknowledged epoch and creation of an assertion bound to one canonical operation digest. |
| Backend verification | Reusable policy that checks transport attribution, tenant and terminal binding, operation binding, epoch/acknowledgement admissibility, authorizer eligibility, integrity, and replay-relevant identity. |
| Recovery | Fail-closed handling of missing, corrupt, mismatched, or rolled-back authorization state; online re-enrollment using a 15-minute, single-use, tenant+terminal-bound Backoffice token. |
| Audit | Immutable records for epoch publication/acknowledgement, authorization verification outcomes, integrity failures, and re-enrollment token issuance/redemption/expiry/revocation. |
| Rollout controls | Enablement only when both the tenant belongs to an approved cohort and the POS/backend build pair is compatible. |

### Out of scope and capability boundaries

- **DSI-6** consumes this assertion capability but owns the credit-note contract, business validation, idempotency semantics, and atomic assertion consumption with the credit-note effect.
- **DSI-7 and DSI-8** remain separate changes. This proposal neither redesigns transport credentials nor merges human authority with device identity.
- Other sensitive operations may adopt the reusable capability later, but they must define their own policy and atomic consumption contract.

## Intended outcomes

- A legitimate manager can approve a supported operation while the POS is disconnected, and that operation can synchronize after reconnection without an authorization bypass.
- Reviewers and support staff can determine which terminal, user, policy epoch, and operation were associated with an assertion.
- A process restart does not reset PIN throttling or reactivate older policy state.
- Receiving and acknowledging a newer epoch makes revocation effective on that terminal; older authorization cannot be created there afterward through the supported application path.
- Corrupt or missing authorization state never causes silent fallback. The terminal requires online recovery.

## Accepted threat model and residual risks

### Security claim

The system trusts an enrolled POS application sandbox to perform the local PIN comparison and report the result. The resulting assertion is attributable to the submitting terminal through its Device Sync credential and is evaluated against backend policy history. This is software-level evidence, not a claim that the physical user interaction remains trustworthy after device or process compromise.

### Defended within the selected boundary

- Accidental or unsupported use of a Device Sync principal as human authority.
- Cross-tenant and cross-terminal assertion substitution.
- Reuse of an assertion for a different operation digest.
- Supported-client rollback below the terminal's server-recorded acknowledgement floor after reconnection.
- Volatile lockout bypass by ordinary process restart.
- Silent continuation after detectable missing, corrupt, or inconsistent local authorization state.
- Duplicate business effect when a consuming domain implements atomic, idempotent consumption.

### Explicitly accepted residual risks

- A rooted terminal, modified APK, hooked runtime, or compromised POS process can bypass the PIN check or fabricate application state. The first release does not claim protection against those attacks.
- Portable low-entropy PIN verifiers can be copied from a compromised terminal and attacked offline. Persistent attempt controls protect the supported application path, not extracted data under full compromise.
- Revocation delay can be potentially indefinite while a terminal remains disconnected. Offline assertions created under its last acknowledged epoch remain admissible when later synchronized.
- HTTPS + Device Sync JWT protects epoch delivery in transit, but there is no detached epoch signature for independent offline authenticity verification.
- Device theft and transport credential compromise remain bounded by the separate DSI-7 policy; this capability does not replace it.
- Manager/cashier collusion and authorized misuse remain business and audit risks rather than technical failures of this capability.

Each tenant **OWNER** accepts this delayed-revocation tradeoff and owns monitoring disconnected terminals and their epoch lag.

## Policy invariants

1. **Tenant isolation:** Every epoch, acknowledgement, PIN verifier, assertion, token, and audit fact is tenant-scoped. Cross-tenant use fails closed.
2. **Transport is not human authority:** Device Sync credentials authenticate transport and attribute the terminal only.
3. **Exact-operation binding:** An assertion binds to one versioned canonical operation digest and cannot authorize a different payload.
4. **Monotonic epochs:** A terminal activates only a strictly newer valid epoch. It atomically persists the epoch sequence/digest before acknowledging it.
5. **Acknowledgement governs revocation:** A staff/policy change becomes effective for a terminal after that terminal acknowledges the newer epoch. There is no epoch TTL.
6. **Acknowledgement floor:** Once the backend records a terminal acknowledgement, later assertions from that terminal cannot rely on an older sequence.
7. **Portable verifier, no human key:** Enrolled same-tenant terminals may receive one-way PIN verifiers. No per-user private signing material exists or is escrowed.
8. **Persistent attempts:** Failed-attempt counters and backoff are durable and keyed by user+terminal; restarting the process does not clear them.
9. **Fail closed on integrity loss:** Digest mismatch, tenant/terminal mismatch, sequence rollback, missing required acknowledgement, corrupt protected state, clear-data, or reinstall disables offline authorization.
10. **Zero fallback:** Integrity failure does not fall back to device-only authorization, stale cached authority, or a weaker local check.
11. **Controlled re-enrollment:** Recovery requires online use of a tenant+terminal-bound token that is single-use and expires 15 minutes after issuance.
12. **Re-enrollment authority:** Only an active same-tenant **OWNER** or **MANAGER** may issue the token. Issuance, redemption, expiry, and revocation are immutably audited.
13. **Domain-owned consumption:** The reusable verifier reports assertion admissibility; each consuming domain owns atomic consumption with its business effect.
14. **Compatibility gate:** The capability is active only for an approved tenant cohort and a compatible POS/backend build pair.

## Impacted capabilities and affected areas

| Capability | Impact |
|---|---|
| Identity and staff policy | Adds epoch publication/history, portable verifier projection, role/permission evaluation, and acknowledgement state. |
| POS authentication | Replaces volatile-only attempt handling for this flow with persistent user-terminal controls and emits operation-bound assertions after successful fresh PIN entry. |
| Device synchronization | Carries epochs and acknowledgements inbound/outbound and transports assertions without changing the device principal's meaning. |
| Backend authorization | Adds a reusable application port/service for assertion admissibility rather than coupling controllers directly to persistence. |
| Local persistence | Adds atomic epoch/acknowledgement state, attempt state, and pending assertion data with integrity checks. |
| Backend persistence | Adds tenant/terminal epoch history, acknowledgement facts, immutable recovery audit, and verification telemetry. |
| Backoffice operations | Allows active same-tenant OWNER/MANAGER token issuance and exposes recovery/audit status. |
| Consuming domains | DSI-6 integrates later and must atomically consume an admissible assertion with its credit-note transaction. |
| Support and risk operations | Adds terminal lag, recovery, failure classification, and rollout dashboards/runbooks. |

Architecture must retain inward dependencies: authorization policy and value objects belong in domain/application boundaries; HTTP, Device Sync, SQLite/PostgreSQL, and Backoffice are adapters. Infrastructure must not define the core admissibility rules.

## Success criteria

### Primary success signal

Offline-authorized operations synchronize safely with **no authorization bypass, operation loss, or duplicate business effect**. Before cohort expansion, telemetry and reconciliation must demonstrate:

- every accepted operation has one admissible assertion bound to the same tenant, terminal, operation digest, and allowed acknowledged epoch;
- rejected or malformed assertions never produce the protected business effect;
- retries are idempotent and do not duplicate the consuming operation;
- recoverable sync interruption does not lose a pending authorized operation or its assertion; and
- integrity failures take the fail-closed/re-enrollment path rather than a fallback path.

### Secondary guardrails

- Recovery completion and failure rates, including token expiry, revocation, replay, and wrong-binding failures.
- Distribution and age of terminal epoch lag, especially approved-cohort terminals beyond the tenant's operational threshold.
- Persistent PIN lockouts and reset outcomes by terminal/user without exposing PIN material.
- Authorization verification rejection rates by stable reason code.
- Support incidents, handling time, and tenant-owner interventions attributable to this capability.
- POS/backend compatibility-gate denials and accidental activation outside the approved cohort.

Numeric launch thresholds and alert limits must be agreed in the rollout runbook before pilot expansion; absence of a threshold must block expansion, not silently become acceptance.

## Observability and audit

Dashboards and immutable audit records must support tenant-scoped investigation without logging PINs or reusable verifier material.

Minimum observable facts:

- epoch publication sequence/digest and publication time;
- terminal receipt/acknowledgement sequence, digest, build version, and time;
- current lag by tenant and terminal, including disconnected duration;
- assertion verification outcome with stable reason code, terminal, authorizer, epoch sequence, operation type, and digest identifier;
- duplicate/replay detection and consuming-domain outcome correlation;
- integrity-loss classifications and fail-closed transitions;
- re-enrollment token issuer role/id, tenant, terminal, issuance, expiry, revocation, redemption, and result;
- cohort/build-gate decision; and
- sync recovery, loss reconciliation, and duplicate-effect indicators.

Tenant OWNERs monitor delayed revocation and terminal lag. Platform operations own service health, dashboards, and incident response. Security/risk reviews anomalous authorization and recovery activity. Support follows the re-enrollment runbook but cannot bypass token authority or integrity checks. Consuming-domain owners monitor and reconcile their atomic consumption behavior.

## Rollout

1. **Preflight:** Finalize schemas, canonical digest versioning, compatibility matrix, migration behavior, dashboards, alert thresholds, recovery runbook, and tenant-owner acceptance record.
2. **Dark deployment:** Deploy backend persistence and verification paths with the capability disabled. Validate that existing POS versions and ordinary sync remain unaffected.
3. **Compatible client release:** Release POS support while keeping authorization disabled unless both gates pass.
4. **Internal/pilot cohort:** Enable only approved tenants whose OWNER has accepted delayed-revocation monitoring and whose POS/backend versions are compatible.
5. **Observe and reconcile:** Compare assertions, sync outcomes, idempotency, lag, recovery, and support load. Pause expansion on any bypass, loss, duplication, unexplained integrity failure, or threshold breach.
6. **Controlled expansion:** Add cohorts explicitly; never infer enablement from version alone.

## Rollback

Rollback is feature disablement and containment, not destructive removal of evidence.

- Stop new enablement and disable assertion creation/acceptance for affected cohort/version pairs.
- Preserve epoch, acknowledgement, pending-operation, assertion, consumption, and immutable audit records.
- Quarantine rather than discard pending protected operations; reconcile them through a documented compatible recovery path so rollback does not create loss or duplication.
- Keep existing non-participating POS sync behavior unchanged.
- If a terminal's authorization state may be compromised, fail it closed and require online re-enrollment; transport credential action remains a DSI-7 decision.
- Roll back database/application versions only through compatible migrations that retain evidence and acknowledgement floors.
- Re-enable only after root cause, reconciliation, compatibility, and tenant communication are complete.

## Operational ownership

| Concern | Owner |
|---|---|
| Acceptance and monitoring of disconnected-terminal delayed revocation | Each tenant OWNER |
| Re-enrollment token issuance | Active same-tenant OWNER or MANAGER |
| Platform availability, sync health, compatibility gating, dashboards, incident coordination | Platform operations |
| Authorization/recovery anomaly review and policy governance | Security/risk |
| PIN reset, role lifecycle, tenant support process | Identity/Backoffice product owners with support |
| Atomic assertion consumption and business reconciliation | Each consuming domain; DSI-6 for credit notes |
| Transport credential lifecycle | DSI-7 owners, outside this change |

## Dependencies

- Existing authenticated HTTPS inbound sync and Device Sync JWT principal.
- Existing tenant isolation and enrolled-terminal identity.
- Staff/role lifecycle as the source of authorization policy and portable one-way PIN verifiers.
- Durable local POS storage and backend persistence capable of atomic monotonic updates.
- Versioned canonical serialization/digest shared by POS, backend, and future consumers.
- Backoffice authenticated OWNER/MANAGER authorization and immutable audit infrastructure.
- Consumer-provided transaction/idempotency boundary; specifically, DSI-6 must own atomic credit-note assertion consumption.
- Separate DSI-7/DSI-8 controls for transport/device lifecycle where applicable.

Hardware discovery may inform future hardening but is not a launch dependency for the accepted software trust model.

## Review-budget warning

This is a cross-runtime security foundation spanning POS, backend, local/backend persistence, sync contracts, Backoffice recovery, migrations, observability, and tests. Exploration estimated roughly **500–750 changed lines**, but complete production hardening may exceed that range. A single implementation PR would impose high cognitive load and make policy, serialization, migration, and consumer-boundary review difficult.

Implementation planning should therefore define independently reviewable slices while preserving one coherent protocol. Suggested review seams are: (1) epoch and acknowledgement contract/persistence, (2) POS local authorization and durable attempt controls, (3) backend verification and recovery audit, and (4) gated consumer integration. No slice may temporarily introduce a permissive fallback or reinterpret the device principal.

## Remaining technical design questions

Product and trust-policy questions are resolved for this proposal. Design must answer only the following implementation-level questions:

1. What exact local and server records, transaction ordering, and compare-and-set rules establish the highest acknowledged epoch and classify rollback or acknowledgement retry after reconnect?
2. What versioned canonical assertion fields and digest algorithm prevent cross-language ambiguity while allowing schema evolution?
3. Which assertion identifier and verification facts belong to the reusable capability, and what interface lets each consumer atomically record consumption with its own business effect?
4. Which successful-authentication and administrative events reset persistent per-user-terminal attempt state, and how are resets audited without enabling restart or sync-based bypass?
5. How are partially persisted epoch receipt, local assertion creation, outbox enqueue, token redemption, and sync acknowledgement recovered after crashes while preserving fail-closed behavior and idempotency?
6. What compatibility negotiation and data-migration sequence guarantees that mixed POS/backend versions cannot accidentally activate or misinterpret the protocol?
