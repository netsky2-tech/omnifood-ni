# Design: offline human authorization credential

## Changes after validation

Corrections from the fresh validation pass are applied in place:

- **R1-001 (CRITICAL):** new §5.1 drain-before-acknowledgement outbox invariant — deterministic drain-failure handling (defer ack / keep asserting / quarantine with operator visibility), reconciliation for already-interleaved terminals, stable code `OHAC_ACK_DEFERRED_OUTBOX` (§10), Q80 acceptance coverage and feature-gate text (§12, §13).
- **R1-002 (WARNING):** the identity spec delta's "Atomic Epoch Activation and Acknowledgement" is restated in convergent state-machine form with an authorization-frozen intermediate state; §16.1 tension resolved.
- **R1-003 (WARNING):** clear-data/reinstall transport restoration is restated as a DSI-7 policy sign-off gate over existing seams, not an implementation blocker (§9, §16.6).
- **R1-004 (SUGGESTION):** stable `OHAC_CREDENTIAL_BINDING_MISMATCH` failure code, distinct from tenant/terminal mismatch, with documented remediation owner (§7.1, §10) and a DSI-6 amendment item (§17).
- **R1-005 (SUGGESTION):** recovery-token pepper is deployment-secret-only, fails fast at startup, with a documented rotation rule (§9).
- **R1-006 (SUGGESTION):** live runtime validation is re-canonicalization plus schema validation; duplicate-key/unknown-field vectors are conformance-fixture-only (§7.2).
- **R1-007 (SUGGESTION):** portable-verifier cross-terminal lockout residual risk documented (§6).
- **Implementation note (2026-09-17):** §11 named table semantics and constraints but left column types, primary keys, foreign keys, index columns, the "unique accepted" mechanism, and the DELETE policies unspecified. Those points are now resolved and recorded in §11.1 so the DDL is reviewable against an explicit decision log instead of inference.

## 1. Decision and trust boundary

This change adds a software-trust authorization capability, not a human signature scheme. An enrolled POS compares a freshly entered PIN with a portable bcrypt verifier from its last **server-confirmed active** staff-policy epoch, then emits a canonical assertion. The backend attributes that claim to the submitting `DeviceSyncPrincipal`; it does not prove physical PIN entry or create a human principal.

The protocol uses the existing authenticated inbound path, `GET /v1/sync/inbound/deltas`, and its HTTPS + `SyncTransportGuard` boundary. Epochs have a digest but no detached signature. PostgreSQL acknowledgement history becomes authoritative after reconnect. SQLite, `EncryptedSharedPreferences`, and app-private storage provide no hardware rollback protection; a rooted/offline restoration remains an accepted residual risk.

### Non-negotiable boundaries

- No PIN-derived key, per-user key, escrow, epoch signature, TOTP fallback, device-only fallback, or hardware requirement.
- DSI-6 owns credit-note policy, canonical credit-note payload, assertion consumption, and the business transaction.
- DSI-7 owns transport credential loss/revocation/recovery. This change never creates or rotates `DeviceSyncCredential`.
- DSI-8 acceptance remains separate.
- Timestamps are forensic only. Epochs and assertions have no wall-clock admissibility TTL.

## 2. Repository evidence and change map

### Existing seams to retain

| Concern | Actual repository seam | Design use |
|---|---|---|
| Human staff sync | `apps/admin_backend/src/modules/identity/controllers/auth.controller.ts` `AuthController.getStaff`; `services/auth.service.ts` `getStaffForSync`; POS `data/repositories/auth_repository_impl.dart` `syncStaff` | Legacy human-JWT path only. It is not the new epoch authority. |
| Device inbound sync | `apps/admin_backend/src/modules/sales/controllers/inbound-sync.controller.ts`; `services/inbound-sync.service.ts`; `dto/inbound-sync.dto.ts`; POS `data/services/sync_service.dart::_pullInboundDeltas` | Add capability negotiation, one contiguous epoch envelope, reset commands, and ack/recovery routes under the same device-authenticated namespace. The same sync cycle anchors the §5.1 drain gate: a pull MUST NOT let the terminal advance past epoch n (ack → server floor) while a failed push leaves prior-epoch assertions unconsumed in a local outbox. |
| Current verifier exposure | `InboundSyncService.fetchUserDeltas` explicitly selects `security_profile.pin_hash`; POS inbound writes `UserEntity` and `SecurityProfileEntity` | Compatible/cohort devices stop treating raw `deltas.users` as authorization policy. Verifiers occur only inside terminal-bound epoch envelopes. Legacy projection remains for old clients until retirement. |
| PIN/override | POS `data/services/local_auth_service.dart::verifyPin`; `data/repositories/auth_repository_impl.dart::authorizeOverride`, `_pinFailures`, `_pinLockedUntil` | Reuse bcrypt comparison; replace volatile override state for this capability with a dedicated durable service/DAO. Existing login behavior is not silently changed. |
| Local profiles | POS `data/daos/security_profile_dao.dart`; `data/models/security_profile_entity.dart` | Legacy projection only after enablement. Epoch entries are immutable rows, not destructive replacements of `security_profiles`. |
| Device attribution | `identity/security/device-sync-principal.ts`; `identity/guards/sync-transport.guard.ts` | Authoritative `tenantId`, canonical `deviceId`, `credentialId`, `credentialVersion`, and scopes. Never a human actor. |
| RLS binding | `core/database/rls.interceptor.ts` documents service responsibility; `SyncTransportGuard` and `TenantCapabilityService` use transaction-local `set_config('app.tenant_id', $1, true)` | Every new service opens or receives a transaction and binds tenant before repository access. Interceptor alone is insufficient. |
| Audit v3 | Backend/POS `core/audit/v3/canonicalizer.*`; POS `audit_repository_impl.dart`; backend `identity/controllers/audit.controller.ts`; `audit-log.entity.ts` | Reuse the cross-runtime number-free canonicalizer and SHA-256 primitives/conformance style. Audit chain is linkage only, never authentication. |
| Append-only enforcement | `migrations/1764000000000-EnforceAuditLogImmutability.ts`; `1780000000000-AddDeterministicSyncSequencing.ts` | New history/event tables get FORCE RLS plus mutation-denial triggers. |
| Activation/transport bootstrap | Backend `onboarding/controllers/activation.controller.ts`, `services/activation.service.ts`; `identity/services/device-sync-credential.service.ts`; POS `domain/security/device_sync_bootstrap_coordinator.dart` | Ordered dependency for clear-data: restore transport first through existing activation/DSI-7-owned policy, then redeem human-authorization recovery. |
| Floor transactions | POS `data/daos/fiscal_config_local_dao.dart`, `audit_log_dao.dart`, `sales/sales_transaction_dao.dart` | New `@transaction` methods use positional arguments only; generated `.g.dart` files are generated outputs, not hand-edited. |
| Idempotency | `inventory/services/sale-inventory-remediation.service.ts`; migration `1780000000000-AddDeterministicSyncSequencing.ts` | Request hash + unique identity + in-transaction recheck. Consumers use the same pattern for assertion consumption. |
| Current DSI-6 barrier | `sales/guards/sync-credit-note-auth.guard.ts` | Remains fail closed until DSI-6 separately adopts the port and atomic consumption. |

### Proposed code surfaces

Names below are new, not claims that these files already exist.

**Backend, centered in `apps/admin_backend`:**

- `src/modules/identity/human-authorization/`: value contracts, `HumanAuthorizationVerifierPort`, epoch publication/projection, acknowledgement, recovery, compatibility policy, controllers, DTOs, TypeORM entities, and services.
- Register/export the capability from `identity.module.ts`; `sales.module.ts` may consume only the exported port later.
- Extend `InboundSyncResponseDto`/`InboundSyncService` with optional `humanAuthorization` data. Add ack and redemption methods to `InboundSyncController` so `SyncTransportGuard` remains authoritative.
- Add one additive TypeORM migration under `src/migrations/` and migration runtime tests.

**POS:**

- New immutable models/DAOs under `lib/data/models/human_authorization/` and `lib/data/daos/human_authorization/`.
- A domain port and application service under `lib/domain/security/` for authorization and assertion creation.
- An inbound epoch handler called by `SyncService._pullInboundDeltas`; `AuthRepositoryImpl.authorizeOverride` is not made the protocol boundary.
- Add entities/DAOs and a database version migration in `data/database/app_database.dart` and `migrations.dart`.

## 3. Architecture and data flow

```text
Backoffice user JWT                         enrolled POS / Device Sync JWT
       |                                                 |
       | staff/PIN/role change                           | GET inbound/deltas
       v                                                 v
Epoch publisher -> immutable terminal epoch ------> RECEIVE/PENDING
       |                                                 |
       |                                      validate + atomic candidate
       |                                                 |
       |<------- POST staff-policy/ack ------------------|
       | append ack; raise server floor                  | authorization frozen
       |------- durable ack receipt -------------------->|
       |                                      atomic confirm -> ACTIVE
       |                                                 |
       |                              fresh PIN + operation digest
       |                                                 v
       |                                      device-attributed assertion
       |                                                 |
Consumer request + EntityManager <---------------- Device Sync transport
       |
       v
HumanAuthorizationVerifierPort -> immutable admissibility facts
       |
       +-- consumer inserts UNIQUE assertion consumption
       +-- consumer applies business effect
       `-- one tenant-RLS transaction
```

Hexagonal dependency direction is HTTP/TypeORM/Floor adapters -> application services -> immutable contracts/policy. Domain policy does not import NestJS, TypeORM, Dio, Floor, or bcrypt.

## 4. Staff-policy epoch contract

### 4.1 Wire schema `ohac.staff-policy-epoch.v1`

All integer-like values are decimal strings to stay inside the existing number-free canonicalizer.

```json
{
  "schema":"ohac.staff-policy-epoch.v1",
  "tenantId":"uuid-lowercase",
  "targetTerminalId":"canonical SyncTransportGuard deviceId",
  "sequence":"17",
  "previousSequence":"16",
  "previousDigest":"sha256:<64-lower-hex>",
  "publisherBackendBuild":"exact-build-id",
  "targetPosBuild":"exact-requested-build-id",
  "minimumAssertionSchema":"ohac.assertion.v1",
  "policyEntries":[{
    "userId":"uuid-lowercase",
    "status":"ACTIVE",
    "role":"MANAGER",
    "permissions":["sales:void_invoice"],
    "pinVerifier":{"algorithm":"bcrypt","formatVersion":"2b","encoded":"$2b$..."},
    "attemptResetGeneration":"0"
  }],
  "digest":"sha256:<64-lower-hex>"
}
```

Rules:

1. Backend creates a terminal-specific immutable projection for `(tenantId, targetTerminalId, sequence)`. Sequence is tenant-global and contiguous; each enrolled terminal receives missing epochs one at a time. Epoch 1 uses `previousSequence:"0"` and `previousDigest:"GENESIS"`.
2. `targetTerminalId` is copied only from the enrolled canonical terminal relation used by `SyncTransportGuard`, never from a free body alias. `targetPosBuild` is the exact negotiated client build. `publisherBackendBuild`, schema IDs, cohort decision, and build pair are persisted with publication.
3. Entries are sorted by `userId`; permissions are de-duplicated and UTF-16 sorted. Status is explicit (`ACTIVE` or `INACTIVE`). The verifier requires active status, a supported role, and the operation's required permission. The source permission projection is `resolveEffectivePermissions` from `identity/security/permissions.enum.ts`, not the narrower `resolveInventoryBohPermissions` currently used by staff sync.
4. A portable verifier is the existing bcrypt encoded verifier. It is never transformed into a key. It is selected only inside the terminal-bound device-sync transaction and never exposed to non-device endpoints, logs, metrics, audit metadata, exceptions, or assertion payloads.
5. Digest input is the whole object except `digest`, canonicalized by OHAC-C14N-1 (§7), then SHA-256. HTTPS/JWT authenticates delivery; digest detects corruption/ambiguity only.
6. Publication follows staff/profile mutations. A transaction/advisory lock on tenant sequence serializes publication. Existing `GET /identity/staff` remains backward-compatible but cannot activate an OHAC epoch.

### 4.2 Local and backend records

Local immutable tables: `human_auth_policy_epochs`, `human_auth_policy_entries`; mutable singleton `human_auth_terminal_state`; durable `human_auth_attempt_state`; append-only `human_auth_local_events`. Terminal state includes tenant, terminal, state, active sequence/digest, candidate sequence/digest, server-confirmed floor, negotiated builds/schemas, integrity classification, and local authorization sequence.

Backend tables:

- `human_auth_policy_epochs`: immutable terminal projections, unique `(tenant_id, terminal_id, sequence)` and `(tenant_id, terminal_id, digest)`.
- `human_auth_terminal_ack_history`: append-only attempts/accepted acknowledgements, unique accepted `(tenant_id, terminal_id, sequence)`.
- `human_auth_terminal_ack_floor`: one mutable CAS row per terminal; trigger rejects sequence decrease or same-sequence digest change.
- `human_auth_recovery_tokens` plus append-only `human_auth_recovery_events`.
- `human_auth_verification_events`: append-only outcome facts, excluding assertion body, PIN, and verifier.
- `human_auth_rollout_cohorts`: tenant/build/schema gate state and OWNER acceptance reference.

## 5. Crash-safe epoch protocol

A database transaction cannot span SQLite and PostgreSQL. Therefore “activation and acknowledgement as one transition” is implemented as a crash-safe state machine, not a false distributed atomic commit.

```text
ACTIVE(n)
  -> RECEIVE/PENDING(n+1)        old n governs
  -> ACK_SUBMITTING(n+1)         no authorization allowed
  -> server ACK floor=n+1        no authorization allowed
  -> ACK_CONFIRMED(n+1)          no authorization allowed
  -> ACTIVE(n+1)                 new n+1 governs
```

1. **Receive.** Accept only exact tenant/terminal/build/schema, `sequence=active+1`, and matching previous sequence/digest. Verify canonical digest and all entries before writing immutable PENDING rows. Duplicate sequence+digest is a no-op; same sequence/different digest is terminal integrity loss. Stale epochs are rejected.
2. **Atomic candidate.** A positional-argument Floor `@transaction` writes the complete candidate, verifies row counts/digest, changes state to `ACK_SUBMITTING`, applies explicit higher `attemptResetGeneration` resets, and appends local lifecycle facts. The old epoch is no longer usable once `ACK_SUBMITTING` commits; authorization is frozen to avoid creating old assertions after an ack whose response may be lost.
3. **Server acknowledgement.** `POST /v1/sync/inbound/human-authorization/staff-policy/ack`, guarded by `SyncTransportGuard` + `sync:pull`, derives tenant/terminal from `devicePrincipal`. DTO: schema, sequence, digest, previous sequence/digest, POS build, assertion schema, idempotency key. In a tenant-bound transaction it locks the floor, validates the published epoch and exact next relation, appends history, and CAS-raises the floor. Same sequence+digest+request hash returns the original receipt; conflicts are terminal.
4. **Client confirmation.** Receipt schema includes terminal, sequence, digest, server floor, ack receipt ID, and server build. The POS atomically records the receipt and promotes candidate to ACTIVE. Only then can it authorize. If the final local write fails, retrying the same ack returns the receipt.
5. **Reconnect reconciliation.** Inbound negotiation always returns authoritative floor sequence/digest. Local below floor enters `ACK_SUBMITTING` if its matching candidate is intact and retries; otherwise it enters `INTEGRITY_LOSS/ROLLBACK_DETECTED`. Local above floor with a confirmed-active claim is inconsistent and fails closed. PENDING not yet submitted may be discarded only if byte-identical active state remains intact.

Lost delivery, duplicate delivery, lost ack response, duplicate ack, and process death at every boundary converge without exposing partial policy. During RECEIVE/PENDING, old policy governs. During all ack states, no policy governs. After local confirmation, only new policy governs.

### 5.1 Drain before acknowledgement (outbox invariant)

Concrete loss path in the current sync cycle: `sync_service.dart` runs `_pullInboundDeltas` even when the preceding push failed. If epoch activation were allowed to proceed regardless of outbox state, the terminal could acknowledge epoch n+1 and raise the server floor while assertions created under epoch n are still queued in that failed outbox. The next successful push then delivers those assertions below the floor, the verifier rejects them as `OHAC_STALE_EPOCH`, and the protected business effect is silently lost.

**Invariant:** a terminal MUST NOT enter `ACK_SUBMITTING` (and therefore MUST NOT cause the server floor to advance) for epoch n+1 while any local outbox that emits `ohac.assertion.v1` payloads still holds an unconsumed assertion attributed to any sequence ≤ n. Consumer-domain outboxes participate by registering as assertion-bearing outboxes with their assertions' epoch sequences; the epoch state machine consults this drain gate as the last pre-condition of the atomic candidate transaction that flips state to `ACK_SUBMITTING`. Unconsumed means queued, in-flight, or failed; an assertion counts as drained only after the backend has durably consumed it (consumer receipt) or it has been deterministically dispositioned below. A successful pull that delivers epoch n+1 in a cycle whose push failed leaves the terminal in `RECEIVE/PENDING` with epoch n still governing; the pull path cannot bypass the gate.

Deterministic drain-failure handling:

- **Defer the ack.** While prior-epoch assertions are unconsumed, the epoch stays `RECEIVE/PENDING`, epoch n continues to govern, and authorization is not frozen. New assertions keep being created under epoch n and queued. The deferral is observable (terminal-state reason `OHAC_ACK_DEFERRED_OUTBOX`, §10, plus metrics) and retried on every subsequent sync cycle.
- **Keep asserting.** A deferred epoch never blocks ordinary operations: delayed revocation already lets epoch n govern indefinitely, so a long outage degrades to older policy plus a growing epoch-lag metric — never to a floor that invalidates queued work.
- **Quarantine with operator visibility.** If an assertion cannot be delivered after a bounded, configured number of push retries — or an authorized operator explicitly intervenes — the terminal moves it to a quarantined, append-only state excluded from the drain gate. The retry bound governs the drain gate only; it imposes no admissibility TTL on the assertion itself. Quarantine is operator-visible (terminal-state classification, observability counter, runbook) and never silent: the protected operation it carried is either re-performed as a fresh authorization under the governing epoch or explicitly abandoned by an authorized operator with an immutable audit fact. Quarantine never implicitly destroys business intent.

**Reconciliation for already-interleaved terminals:** a terminal that has already acknowledged epoch m > n while holding unconsumed epoch-n assertions (the pre-existing interleaved state, possible during upgrade or in a pilot that predates this gate) is reconciled deterministically at reconnect: below-floor assertions are detected at push time, quarantined locally as `OHAC_STALE_EPOCH` with an appended `SUPERSEDED_BY_FLOOR` audit fact, retained append-only as evidence, and surfaced to operators; the protected operation is re-performed under the governing epoch as a fresh authorization before any effect can occur, or explicitly abandoned with an audit fact. Preservation proof against the §1 boundaries: no bypass (a fresh human authorization under a currently valid epoch is required); no loss (the operation is re-created or explicitly abandoned with an audit trail, and the quarantined assertion body is retained as evidence); no duplicate business effect (if the original assertion was in fact already consumed server-side, the consumer's unique `(tenant_id, assertion_id)` consumption row makes re-delivery an idempotent no-op; if it was never consumed, only the fresh authorization produces an effect).

**Feature gate:** the drain gate ships in the same POS build pair and cohort gate as the epoch-ack path (§12); no cohort is enablement-eligible unless its exact POS build includes the gate. Reconnect reconciliation of already-interleaved pilot terminals is a mandatory pre-expansion step in the deployment order (§12), and its outcomes are part of the Q80 evidence (§12, §13).

### Monotonicity claim

This prevents supported-client stale activation and lets the backend reject assertions below its recorded floor. It does **not** stop a rooted device from restoring SQLite/SharedPreferences, changing code, or fabricating a state while offline. Encrypted storage is not a monotonic counter. Until reconnect there is no backend observation; after reconnect, ack history/floor is authoritative and stale assertions fail. This residual must appear verbatim in operational/security claims.

## 6. Durable PIN attempts and reset policy

`human_auth_attempt_state` is keyed by `(tenant_id, terminal_id, user_id)` and stores failure count, window start, `backoff_until`, reset generation, revision, last outcome, and timestamps. It is not deleted on logout, restart, successful sync, epoch replacement, or app upgrade.

A positional Floor `@transaction` performs: verify ACTIVE state and entry eligibility; read attempt row; enforce backoff; synchronously compare PIN with bcrypt; update attempt state; increment terminal-local authorization sequence; append local audit linkage; and return assertion inputs. Plaintext PIN exists only in memory and is never a SQL argument, persisted field, exception, log, metric, or crash breadcrumb. The implementation may pass a synchronous comparison closure into the transaction, matching the repository's callback transaction pattern in `AuditDao.appendForensicLog`; if Floor generation cannot safely support that shape, use revision-based CAS and retry, and block implementation until concurrent success/failure tests prove equivalence.

Default policy preserves current behavior: three failures in a rolling 60 seconds cause five-minute backoff. It becomes versioned epoch policy before launch rather than a hard-coded divergent client rule.

Reset behavior:

- A successful fresh PIN check after backoff expiry resets that user-terminal count/backoff in the same transaction and appends `PIN_ATTEMPT_RESET_SUCCESS`.
- Process restart, online login, ordinary staff sync, and receipt of an unchanged reset generation do not reset it.
- An active same-tenant OWNER/MANAGER may request administrative reset. The backend audits actor/reason and increments that user's `attemptResetGeneration` in a newly published epoch. The target terminal applies it only during atomic candidate activation and appends a local reset event. Replays are no-ops.
- Reset changes attempts only; it does not activate an ineligible user or bypass epoch acknowledgement.

Residual risk (accepted and documented): lockout state is keyed per user+terminal. A locked actor who still possesses the portable verifier — which is portable across the tenant's enrolled terminals by design (§4) — could walk to another enrolled same-tenant terminal where that user's attempt state is clean and retry there. Backoff therefore bounds per-terminal automation only; it cannot stop a determined actor with physical access to multiple enrolled terminals. Mitigation beyond this change would require epoch-policy tightening (for example longer or escalating backoff, or generation-based suspension) or future enrollment controls; no hardware control is claimed (§1).

## 7. Assertion and canonicalization contract

### 7.1 `ohac.assertion.v1`

```json
{
  "schema":"ohac.assertion.v1",
  "assertionId":"uuid-v4-lowercase",
  "tenantId":"uuid-lowercase",
  "terminalId":"canonical-terminal",
  "deviceCredentialId":"uuid-lowercase",
  "deviceCredentialVersion":"3",
  "epochSequence":"17",
  "epochDigest":"sha256:<64-lower-hex>",
  "authorizerUserId":"uuid-lowercase",
  "operatorUserId":"uuid-lowercase",
  "authorizerRole":"MANAGER",
  "permissionsUsed":["sales:void_invoice"],
  "operationType":"consumer.registered-operation.v1",
  "operationSchema":"consumer.operation.v1",
  "operationDigest":"sha256:<64-lower-hex>",
  "localAuthorizationSequence":"42",
  "localAuditId":"uuid-or-stable-local-id",
  "localAuditEntryHash":"sha256:<64-lower-hex>",
  "posBuild":"exact-build-id",
  "policySchema":"ohac.staff-policy-epoch.v1",
  "trustLevel":"APPLICATION_SANDBOX_SOFTWARE",
  "authorizedAt":"RFC3339-UTC-forensic-only"
}
```

The assertion has no `signature`, PIN, verifier, or claim of human non-repudiation. `deviceCredentialId/version` record which transport material the client expected; the verifier requires equality with the current request principal. This intentionally means submission after transport credential rotation requires consumer remediation policy and cannot silently rewrite evidence.

The stable failure code for that case is `OHAC_CREDENTIAL_BINDING_MISMATCH` (§10): the assertion's recorded `deviceCredentialId`/`deviceCredentialVersion` does not equal the current request principal's, typically because `credentialVersion` bumped after transport-credential rotation. It is distinct from `OHAC_TENANT_TERMINAL_MISMATCH`, which means the submitting principal is not the asserted tenant/terminal at all. Remediation owner: the consumer's tenant-operations runbook — an authorized operator re-performs the protected operation as a fresh authorization on the terminal's current transport credential; the stale assertion is preserved append-only and is never rewritten, re-bound, or replayed. DSI-6 must adopt this code and remediation ownership (§17).

The assertion ID is replay identity. Local sequence/audit hash aid forensic continuity but are not trusted cryptographic proof. Creation is atomic with the consuming domain's local operation/outbox; this capability supplies a transaction participant/inputs, not a separate “proof outbox.”

### 7.2 OHAC-C14N-1

Use the existing TS/Dart `canonicalizeNumberFreeJson` and SHA-256 implementations already exercised by audit-v3 fixtures. OHAC-C14N-1 is a strict number-free JCS subset:

- UTF-8 input/output; object keys ordered by UTF-16 code units; JSON minimal escaping as implemented today.
- No Unicode normalization. NFC and NFD strings are distinct and must produce distinct vectors.
- JSON numbers are forbidden. Sequences and versions are canonical unsigned decimal strings: `"0"` or non-zero without sign/leading zero.
- Booleans are allowed only where a schema declares them; assertion v1 uses none.
- `null` is forbidden in epoch/assertion v1. Optional values are omitted, but v1 assertion fields above are all required.
- Unknown fields, duplicate keys, invalid UTF-8/unpaired surrogates, unsupported schemas, non-canonical UUID/digest casing, unsorted/duplicate arrays, and payloads over the existing 1 MiB bound are rejected.
- Digest format is lowercase `sha256:` + 64 hex characters over canonical bytes.

Live runtime validation rule: JSON parsers collapse duplicate keys before canonicalization, so received epochs and assertions are validated at runtime by (a) re-canonicalizing the parsed object and requiring exact digest equality with the transmitted `digest`, and (b) schema-validating required fields, enums, formats, and unknown-field rejection. Duplicate-key and other parser-edge behaviors are therefore proven by the shared conformance fixtures for the TS/Dart canonicalizers, not claimed as live transport detection; re-canonicalized digest equality plus schema validation are the live guarantees.

A shared fixture directory (for example `fixtures/human-authorization/v1/`) is consumed by Dart and TypeScript tests. Vectors cover reordered keys, escaped controls, astral Unicode, UTF-16 ordering, NFC/NFD distinction, empty arrays, forbidden number/null, duplicate keys, leading-zero sequence, unknown field, one-byte mutation, max size, and exact expected canonical UTF-8/hex digest. Consumers own their operation schema and must provide its already validated exact digest; OHAC does not reinterpret domain payloads.

## 8. Backend verification and consumption boundary

```ts
interface HumanAuthorizationVerifierPort {
  verify(
    manager: EntityManager,
    principal: DeviceSyncPrincipal,
    request: HumanAuthorizationVerificationRequest,
  ): Promise<HumanAuthorizationVerificationResult>;
}
```

The request contains the assertion, expected tenant/terminal, exact operation type/schema/digest, required roles/permissions, supported contract/build set, and consumer correlation. The implementation assumes the consumer has opened a transaction and executes `set_config` defensively, then confirms `current_setting('app.tenant_id')` equals `principal.tenantId` before reads.

Verification checks, in order:

1. cohort enabled and POS/backend/assertion/policy schema pair supported;
2. strict schema/canonical digest syntax and unique replay-relevant assertion identity;
3. principal is `DEVICE_SYNC`, has the needed transport scope, and exactly matches assertion tenant, canonical terminal, credential ID/version;
4. operation type/schema/digest exactly equal consumer-provided values;
5. acknowledged epoch exists with matching digest and terminal, and assertion sequence is not below or above the server floor;
6. immutable epoch entry matches authorizer, role, active status, and every required permission/`permissionsUsed` value;
7. operator and audit/local-sequence fields are well formed; consumer-specific self/dual-custody policy remains outside;
8. trust level is exactly software sandbox.

It returns a frozen value containing assertion ID, tenant, terminal, credential facts, epoch facts, authorizer/operator facts, permissions used, operation binding, local audit linkage, trust level, and stable decision/reason. It does not return secrets, synthesize a JWT user, or mutate request identity.

The verifier may append a verification outcome to `human_auth_verification_events` using the supplied manager. It MUST NOT insert assertion consumption or commit/rollback the transaction. Duplicate verification of an unconsumed assertion is harmless and returns the same facts; verification alone cannot prevent replay.

Each consumer must own a table with a unique constraint at least on `(tenant_id, assertion_id)` plus its operation/idempotency identity and digest. In one tenant-RLS transaction it rechecks idempotency, invokes the verifier, inserts consumption, applies the protected effect, and commits. A matching retry returns the prior receipt; mismatched reuse is `ASSERTION_REPLAY`/`IDEMPOTENCY_CONFLICT`. Concurrent reuse has one unique-index winner and no second effect. DSI-6 must implement this in its invoice/Kardex transaction.

## 9. Integrity loss and recovery

### Detection and classification

| Classification | Detection | Result |
|---|---|---|
| `AUTH_STATE_MISSING` | Device credential survives but epoch/state tables or required rows are absent | Disable OHAC; online token recovery allowed. |
| `DIGEST_MISMATCH` / `SCOPE_MISMATCH` | Recomputed digest or tenant/terminal/build differs | Quarantine local capability; token recovery. |
| `LOCAL_ROLLBACK` | Local sequence below server floor after reconnect | Quarantine; token recovery. |
| `ACK_INCONSISTENT` | local/server floor or same-sequence digest conflict | Quarantine; security investigation plus recovery. |
| `UNSUPPORTED_SCHEMA_BUILD` | negotiation fails | Disabled, not auto-repaired; upgrade/downgrade to supported pair. |
| `TRANSPORT_STATE_MISSING` | clear-data/reinstall removed Device Sync material too | OHAC endpoint unreachable; restore transport first. |

**Authorization-state loss with surviving transport:** the active `DeviceSyncPrincipal` redeems an OHAC recovery token online. Recovery creates a bootstrap candidate from the server floor/latest contiguous policy, then uses the normal ack protocol. Offline authorization remains disabled until ACTIVE.

**Clear-data/reinstall:** no token may bypass transport identity. Existing activation/bootstrap or the future DSI-7 recovery contract must first establish an active `DeviceSyncCredential` bound to the same canonical terminal. Only then can a newly valid OHAC token be redeemed. If the 15-minute token expires while transport is restored, issue another. OHAC redemption never provisions, confirms, rotates, or revokes device credentials. The prerequisite restores human-authorization state only; it never creates, restores, or re-binds Device Sync credentials.

This is a DSI-7 policy sign-off gate, not an implementation blocker: the ordered transport-then-recovery path is implementable against existing seams — backend `onboarding/controllers/activation.controller.ts` and `onboarding/services/activation.service.ts`, POS `domain/security/device_sync_bootstrap_coordinator.dart` — so no new implementation capability is required. What is externally gated is DSI-7's documented sign-off of the transport-restoration policy (§16.6); pilot coverage of the clear-data path activates only after that sign-off.

### Token API

- `POST /identity/human-authorization/recovery-tokens` — `AuthGuard`, `AuthoritativeCurrentUserGuard`, `RolesGuard`, `@Roles(OWNER, MANAGER)`, `TenantInterceptor`. DTO: `terminalId`, `reason`, `requestId`. Verify active issuer and same-tenant enrolled canonical terminal in a tenant-bound transaction. Return `{tokenId, token, expiresAt}` once.
- `DELETE /identity/human-authorization/recovery-tokens/:tokenId` — same guards; DTO reason/request ID; idempotently revoke if unredeemed.
- `POST /v1/sync/inbound/human-authorization/recovery/redeem` — `SyncTransportGuard`, `sync:pull`. DTO: token, redemption idempotency key, POS build, policy/assertion schemas, local integrity classification. Tenant/terminal come only from principal.

Plaintext format is `ohr1.<tokenId>.<256-bit-random-secret>`. Store token ID plus HMAC-SHA-256(secret, dedicated server pepper), never plaintext. Expiry is server-issued-at + exactly 15 minutes. Redemption locks the token row, validates hash/tenant/terminal/expiry/revocation/build/cohort, marks one successful redemption, creates recovery receipt/candidate metadata, and appends events atomically. Same principal + same idempotency key/hash returns the receipt after a lost response; a different retry is denied. At most one concurrent redemption succeeds.

The server pepper is sourced exclusively from deployment secret configuration (injected environment/secret manager). It has no default value, is never committed in code, and is never derived from tenant or user material. The service MUST fail fast at startup if the pepper is missing or empty. Rotation rule: rotating the pepper makes tokens issued under the previous pepper unverifiable; redemption of those tokens is denied like any other verification failure. Rotation is therefore an operational runbook event that (a) appends a rotation audit event, (b) treats outstanding unredeemed tokens as dead and issues new tokens to operators as needed, and (c) switches issuance to the new pepper atomically with deployment. Receipts of tokens already redeemed are unaffected.

Issuance, denial, expiry observation, revocation, redemption, and race loss append immutable events with actor/principal, tenant, terminal, token ID, reason code, and correlation—but no plaintext/hash/verifier. Expired status is derived; the first observation/sweeper appends `EXPIRED` idempotently.

## 10. API failures

| Code | Retry | Meaning/action |
|---|---|---|
| `OHAC_TEMPORARY_UNAVAILABLE` | Yes | network/5xx/deadlock; retain state/outbox |
| `OHAC_ACK_RESPONSE_LOST` | Yes | retry identical ack |
| `OHAC_ACK_DEFERRED_OUTBOX` | Yes — after drain or operator disposition | ack deferred: unconsumed prior-epoch assertions in a local outbox (§5.1) |
| `OHAC_SEQUENCE_GAP` | Yes after pull | request next contiguous epoch |
| `OHAC_ORIGIN_PENDING` | Consumer-defined retry | verifier was not consumed |
| `OHAC_COHORT_DISABLED` / `OHAC_UNSUPPORTED_BUILD` | No until deployment change | capability disabled, zero fallback |
| `OHAC_MALFORMED_ASSERTION` / `OHAC_DIGEST_MISMATCH` | Terminal | quarantine assertion |
| `OHAC_TENANT_TERMINAL_MISMATCH` | Terminal/security | no effect; investigate |
| `OHAC_CREDENTIAL_BINDING_MISMATCH` | Terminal after re-authorization | assertion credential binding ≠ current principal (e.g. `credentialVersion` bumped); preserve assertion, re-authorize under current credential (§7.1) |
| `OHAC_STALE_EPOCH` / `OHAC_ACK_INCONSISTENT` | Terminal/recovery | fail closed; reconcile/re-enroll |
| `OHAC_INELIGIBLE_AUTHORIZER` | Terminal | append-only reauthorization if consumer permits |
| `OHAC_ASSERTION_REPLAY` / `OHAC_IDEMPOTENCY_CONFLICT` | Terminal except identical retry | preserve first result |
| `OHAC_RECOVERY_EXPIRED/REVOKED/USED/BINDING_MISMATCH` | Terminal | issue a new token only after cause review |
| `OHAC_TRANSPORT_RECOVERY_REQUIRED` | Ordered dependency | restore DSI-7/activation transport first |

HTTP mapping: malformed 400, unauthenticated transport 401, policy/binding/cohort 403, replay/idempotency/sequence conflict 409, unsupported contract 422, transient 503. Machine code, retryability, and correlation ID are stable; messages never echo sensitive input.

## 11. Migrations, RLS, and immutability

Backend migration is additive and creates the tables in §§4/9 with foreign keys where current canonical entities are stable, unique/check constraints, indexes for terminal floor/lag and token lookup, `ENABLE` + `FORCE ROW LEVEL SECURITY`, and SELECT/INSERT/update policies using `current_setting('app.tenant_id', true)`. History, epoch, verification-event, and recovery-event tables reject UPDATE/DELETE via dedicated triggers. Mutable floor triggers prohibit regression/digest rewrite. Token rows allow only legal state transitions; lifecycle history remains append-only. Down migration must not erase evidence after rollout; operational rollback disables code/gates and retains tables.

Local migration is additive. It does not backfill an ACTIVE epoch from `security_profiles`, because that would fabricate acknowledgement. Existing installations start `UNENROLLED` and require online epoch bootstrap/recovery. Constraints enforce one terminal state, unique epoch sequence/digest, attempt scope, and assertion/local sequence identity. Migration or integrity-check failure sets fail-closed status before authorization UI is enabled.

### 11.1 Storage decisions resolved at implementation time

The constraints above are normative. Where they name a requirement but not its DDL, the following decisions apply. Each is marked **design-specified** (the requirement comes from this design) or **implementer-chosen** (this document was silent).

| # | Decision | Status |
|---|---|---|
| 1 | Epoch and floor sequences are stored as `bigint` with `CHECK (sequence >= 0)`, matching the signed-Int64 domain the contracts already enforce. Sequence arithmetic and floor comparison happen in SQL, so the floor trigger cannot be fooled by string ordering. | implementer-chosen |
| 2 | `digest` columns are `varchar(71)` with `CHECK (digest ~ '^sha256:[0-9a-f]{64}$')`. `previous_digest` additionally accepts the literal `GENESIS`, because the first epoch chains from it. | implementer-chosen |
| 3 | `tenant_id` is `varchar(128)`, matching existing migrations. `terminal_id` is `varchar(128)` and MUST equal the `SyncTransportGuard` device identifier. | design-specified (terminal identity), implementer-chosen (width) |
| 4 | `human_auth_policy_epochs` stores the scalar publication facts (`schema`, `tenant_id`, `terminal_id`, `sequence`, `previous_sequence`, `previous_digest`, `publisher_backend_build`, `target_pos_build`, `minimum_assertion_schema`, `cohort_decision`, `digest`) plus `payload jsonb NOT NULL` holding the canonical epoch body including `policyEntries`. No eighth backend entries table is invented, because this design names exactly seven and the verifier must read the same canonical entries the contract parser already validates. | implementer-chosen |
| 5 | `human_auth_terminal_ack_history` carries a `status` discriminator (`ACCEPTED`, `REJECTED`) and enforces the design's "unique accepted `(tenant_id, terminal_id, sequence)`" with a **partial** unique index `WHERE status = 'ACCEPTED'`, so rejected attempts remain storable and auditable. Receipt replay uses a partial unique index on `(tenant_id, terminal_id, idempotency_key)`. | design-specified (uniqueness), implementer-chosen (mechanism) |
| 6 | `human_auth_terminal_ack_floor` holds one mutable row per `(tenant_id, terminal_id)` — the primary key — plus `revision` for compare-and-set. Its trigger rejects `NEW.sequence < OLD.sequence` and `NEW.digest <> OLD.digest` at equal sequence, while allowing an increase and an idempotent same-sequence/same-digest write. It also rejects tenant or terminal re-identification. | design-specified (rejection rules), implementer-chosen (revision column, key) |
| 7 | Append-only tables are `human_auth_policy_epochs`, `human_auth_terminal_ack_history`, `human_auth_recovery_events`, and `human_auth_verification_events`; each gets `BEFORE UPDATE OR DELETE` row and statement triggers calling one shared guard function. `human_auth_verification_events` is deliberately **not** unique on `assertion_id`, because duplicate verification of an unconsumed assertion is harmless. | design-specified |
| 8 | `human_auth_recovery_tokens` stores `token_id uuid`, the HMAC-SHA-256 hex in `secret_hmac varchar(64)`, `issued_at`, `expires_at`, `revoked_at`/`revoked_by`/`revocation_reason`, `redeemed_at`/`redemption_credential_id`, and `status` constrained to `ISSUED`, `REVOKED`, `REDEEMED`. `EXPIRED` is **derived** from `expires_at` and is never stored, matching §9. | design-specified (states, derivation), implementer-chosen (columns) |
| 9 | DELETE policies are created only on mutable tables that need them; append-only tables get none, because their triggers deny deletion outright. `human_auth_rollout_cohorts` is keyed `UNIQUE (tenant_id, pos_build, backend_build)` and defaults to disabled, so an absent row and a disabled row both mean not enablement-eligible. | implementer-chosen |
| 10 | Foreign keys are added only to stable canonical entities: cohort and operator references to `users` and tenant-scoped ownership to `tenants` where that table is the canonical tenant registry. Epoch, ack, recovery, and verification evidence tables intentionally carry no cross-table FK on `terminal_id`, because terminals are addressed by device identity rather than a canonical entity row. | design-specified ("where stable"), implementer-chosen (scope) |
| 11 | `I-2` is split into three additive migrations rather than one, to keep each within the review budget: `1809000000000-CreateHumanAuthorizationCore.ts` (epochs, ack history, ack floor), `1809010000000-CreateHumanAuthorizationRecovery.ts` (recovery tokens, recovery events), and `1809020000000-CreateHumanAuthorizationObservability.ts` (verification events, rollout cohorts). All three are additive, none reads another's tables, and each defines its own enforcement functions so any one can be reverted without unbinding another's triggers. | implementer-chosen (deviates from the single file named in `tasks.md` `I-2`) |
| 12 | `down()` removes only the enforcement objects this migration added (triggers, then guard functions) and **retains all three tables with every row**. Dropping a table is an explicit operator action outside the migration path, because §11 forbids erasing evidence after rollout and §12 forbids lowering a floor or reactivating an epoch, and a migration cannot detect whether rollout already happened. `up()` is idempotent, so re-applying after a revert is safe. | design-specified ("must not erase evidence") |

### 11.2 Epoch projection decisions resolved at implementation time

Implementing the epoch projection (slice 2b-2) required resolving three points this design left open. They are recorded here because the epoch's source of truth was never provisioned by §4.1, §6 or the `I-2` migration set.

| # | Decision | Status |
|---|---|---|
| 13 | No dedicated staff-policy table exists, so an epoch projects from `users` (`id`, `tenant_id`, `role`, `is_active`) joined to `security_profiles` (`pin_hash`, `custom_permissions`). `status` is derived from `users.is_active` because no status column exists, and permissions resolve through `resolveEffectivePermissions`, which §4.1 rule 3 requires instead of the narrower `resolveInventoryBohPermissions` used by the auth and roles paths. | design-specified (fields), implementer-chosen (source tables) |
| 14 | `attemptResetGeneration` has no storage anywhere in the repository; it exists only as a contract field. This design requires the backend to increment it on an administrative reset (§6), so a hardcoded `"0"` would be a silent deviation from a normative rule whose purpose is durable PIN-attempt reset. It therefore needs a persisted per-user generation column before the projection can be faithful, which is a separate additive migration and is tracked as its own slice rather than smuggled into the projection. | design-specified (semantics), implementer-chosen (storage) |
| 15 | `pinVerifier.formatVersion` is derived from the bcrypt prefix of `pin_hash` (`$2a$`, `$2b$`, `$2y$`). A hash whose prefix is not one of those values is a projection failure, not a silently defaulted `"2b"`. | implementer-chosen |
| 16 | **Publication trigger (user decision).** A staff or profile mutation marks the tenant dirty in its own transaction, and a serialized publisher holding an advisory lock on the tenant sequence builds and inserts the immutable epoch. The mutation never computes a digest, so the hot identity write path stays free of canonicalization and lock contention, while publication still follows mutations as §4.1 rule 6 requires. The publisher is idempotent: it compares the projected payload digest against the terminal's newest epoch and inserts only on change, so a repeated or lost signal cannot produce a duplicate epoch. The dirty marker needs durable storage, which is a separate additive migration tracked as its own slice. | design-specified (follows mutations, advisory lock), user-decided (dirty marker plus serialized publisher) |
| 17 | **Terminal fan-out (user decision).** §4.1 rule 1 calls the sequence tenant-global and contiguous while the epoch row is unique per `(tenant_id, terminal_id, sequence)`, and §4.1 rule 2 requires `targetTerminalId` from the canonical enrolled-terminal relation plus the exact negotiated client build. The repository provisions no terminal registry and no persisted per-terminal build: terminal identity resolves at request time through `device_sync_credentials` to `onboarding_activation_attempts.trusted_terminal_id`, and `targetPosBuild` is negotiated per pull. Therefore the publisher persists one immutable **terminal-agnostic policy snapshot per `(tenant_id, sequence)`** and the per-terminal epoch row is materialized on that terminal's first pull from the canonical relation and the negotiated build, inside one transaction guarded by the unique key so the insert is idempotent. The snapshot needs durable storage, which is a separate additive migration tracked as its own slice. | user-decided (snapshot plus on-pull materialization) |
| 18 | **Empty-policy revocation (user decision).** The v1 contract rejects an empty `policyEntries` with `INVALID_FIELD`/`policyEntries`, so an epoch cannot express revocation of the final PIN-enabled user. Publication therefore fails closed: no epoch row is inserted, the previously published epoch continues to govern, and the failed attempt is observable. Revoking the last PIN-enabled user is an administrative operation, not an epoch, and its representation is explicitly deferred rather than smuggled into v1. | user-decided (fail closed, representation deferred) |
| 19 | **Tenant-global sequence source (user decision).** The publisher derives the next tenant sequence as `COALESCE(MAX(sequence), 0) + 1` from `human_auth_policy_snapshots` while holding `pg_advisory_xact_lock(hashtext(tenant_id))`, so contiguity holds because the lock serializes publishers and the store is append-only with no delete path; no dedicated counter table is provisioned. The derivation itself lands with the publisher service, not with the snapshot migration. | user-decided (derived sequence, no counter table) |
| 20 | **`attempt_reset_generation` access (user decision).** The column must be mapped on the `User` entity with a mapping spec so the publisher reads it through the ORM instead of a second raw access path; that mapping belongs to a later slice and is not part of the snapshot migration. | user-decided (ORM mapping with spec) |

### 11.3 Publisher prerequisites observed before implementation

The publisher cannot be built from §4.1 and decision 16 alone: three referenced inputs are still unprovisioned in the repository, verified read-only against `main` at `c88833a`.

| # | Gap | Consequence for the publisher slice |
|---|---|---|
| 1 | No tenant-global policy sequence exists. `human_auth_policy_epochs.sequence` is only unique per `(tenant_id, terminal_id)`, and `human_auth_tenant_publication_state.revision` is a marker CAS revision with no relation to any sequence. | The publisher slice must provision the tenant-global sequence it advances, and must define how contiguity is enforced while terminals lag. |
| 2 | No terminal registry exists and nothing guarantees one epoch row per enrolled terminal. Enrolment is only reachable through `device_sync_credentials` → `onboarding_activation_attempts.trusted_terminal_id`; the nearest tenant-level device list is the `tenant_topology_revisions.topology.devices[]` blob. | Decision 17 removes the need for eager enumeration and for backfilling terminals enrolled later, because materialization happens on the terminal's own pull. |
| 3 | No per-terminal build is persisted. Only nullable `onboarding_activation_attempts.pos_build` exists from enrolment time, and no build negotiation is implemented. | Decision 17 takes `targetPosBuild` from the negotiated pull, so the publisher never needs a persisted build; a missing negotiated build must fail closed. |
| 4 | `human_auth_tenant_publication_state` has no TypeORM entity, `HumanAuthorizationModule` is registration-only, and it is imported by neither `identity.module.ts` nor `app.module.ts`. | The publisher slice must add the dirty-marker entity, the publisher service, and the module registration, and must be imported from `identity.module.ts` per §2. |
| 5 | `users.attempt_reset_generation` exists in DDL only; the `User` entity does not map it. | Reading the generation requires either mapping the column on the entity or a deliberate raw-SQL read in the publisher. |

No OHAC `.db.spec.ts` or end-to-end spec exists, so the publisher slice must also establish its own database-level coverage, which the `T-2` migration runtime suite is expected to own.

## 12. Compatibility, rollout, rollback, and operations

Negotiation adds exact `ohacPosBuild`, supported policy/assertion schema arrays, and local floor to inbound query/headers. The backend returns `DISABLED`, `UPGRADE_REQUIRED`, `RECOVERY_REQUIRED`, or the next epoch. Activation requires both an explicit tenant cohort row with OWNER delayed-revocation acceptance and an allowlisted exact POS/backend build pair. Version alone never enables it.

Deployment order:

1. Add schema, port, disabled routes, RLS/immutability, metrics, dashboards, and runbooks.
2. Deploy backend epoch publication/ack/recovery with all cohorts disabled.
3. Release POS storage/state machine/canonicalization with assertion creation disabled.
4. Record tenant OWNER acceptance; enable internal Q80 pilot for one exact build pair. Enablement requires the exact POS build to include the §5.1 drain-before-ack gate; a build pair without it is not enablement-eligible.
5. Physically test on Q80: offline PIN authorization under software trust, power loss at every epoch/ack boundary, restart-persistent backoff, reconnect floor rejection, clear-data ordered recovery, printer/load coexistence, and no hardware-attestation claim. Additionally run the push-failure/epoch-interleaving scenario: with a test hook forcing push 5xx while pull succeeds, queue prior-epoch assertions, deliver a newer epoch, and prove the terminal defers the ack (`OHAC_ACK_DEFERRED_OUTBOX`) with epoch n still governing; then prove both deterministic exits — drain succeeds and the ack proceeds, or bounded-retry quarantine with operator visibility followed by re-authorization without loss or duplicate effect — and prove §5.1 reconciliation of a pre-interleaved terminal (fresh authorization under the governing epoch, quarantined assertion retained, consumer unique-consumption idempotency).
6. Expand only after numeric thresholds for lag, duplicate effect, recovery, integrity loss, and rejection reasons are approved.

Rollback disables creation and acceptance by cohort/build pair, preserves all evidence, freezes/quarantines pending protected operations, and leaves non-OHAC sync unchanged. Never lower an ack floor, reactivate an old epoch, delete consumption, or accept evidence-free records.

Observability uses IDs/digests, never PINs/verifiers/token secrets/assertion bodies: epoch publication/lag, ack retries/floor conflicts, integrity classes, backoff/reset outcomes, verification reason, consumer correlation/outcome, recovery lifecycle, cohort/build decisions, and disconnected duration. Tenant OWNER owns delayed-revocation acceptance/lag monitoring; Platform Operations owns service health/runbook; Security/Risk owns anomalies; Support follows recovery without bypass; each consumer owns atomic consumption reconciliation.

## 13. Strict-TDD strategy

Every slice follows RED -> GREEN -> TRIANGULATE -> REFACTOR. Required evidence:

- Shared TS/Dart canonical fixtures first, including adversarial Unicode and forbidden numeric/null behavior.
- Pure domain tests for epoch relations, eligibility, build/cohort gates, assertion bindings, attempt/backoff/reset, and stable error taxonomy.
- Floor real-database tests with crashes/fail hooks around every transaction write; process restart; concurrent PIN attempts; ack response loss; rollback detection. Assert positional `@transaction` generation.
- TypeORM unit and real PostgreSQL tests for RLS cross-tenant denial, FORCE RLS, CAS floor monotonicity, append-only triggers, token races, idempotent ack/redeem, and consumer unique assertion race.
- Nest integration tests using real `SyncTransportGuard` principal attribution; prove human JWT staff path cannot ack/redeem and Device Sync cannot issue tokens.
- Contract tests proving verifiers appear only in eligible terminal epoch envelopes and never logs/errors/telemetry.
- Consumer harness transaction test: verifier success followed by forced effect failure leaves neither consumption nor effect; concurrent reuse produces one effect.
- Drain-gate tests (§5.1): ack blocked while prior-epoch assertions are unconsumed even when the same cycle's pull succeeds; deterministic deferral with `OHAC_ACK_DEFERRED_OUTBOX`; quarantine after the configured retry bound with operator-visible state and append-only retention; reconciliation of a pre-interleaved terminal with re-authorization and consumer unique-consumption idempotency proving no duplicate effect.
- Recovery-token configuration tests: startup fails fast when the deployment-secret pepper is absent or empty; tokens issued under a previous pepper are denied after rotation, with a rotation audit event.
- Physical Q80 acceptance listed in §12. Hardware security probes are optional hardening, not release proof.

## 14. Dependency-aware delivery slices and line forecast

Critical path:

```text
canonical fixtures/contracts
 -> backend migration + epoch publication
 -> POS epoch state/ack protocol
 -> durable PIN/assertion creation
 -> verifier port + recovery
 -> pilot evidence
 -> later DSI-6 adoption
```

Suggested system-valid slices (not tasks or a chosen PR plan):

1. Cross-runtime canonical contracts and disabled additive persistence.
2. Device inbound epoch/ack state machine with no assertion creation.
3. Durable PIN attempts and assertion creation behind cohort/build gate.
4. Transaction-compatible verifier, recovery lifecycle, audit/observability.
5. Pilot hardening and Q80 evidence.

Estimated implementation: 1,400–2,200 changed lines including generated-independent tests/migrations, excluding generated Floor output. Each useful slice is likely 250–550 lines; some migration + runtime-test atoms may exceed the 400-line review budget. Because delivery is `ask-always`, final PR strategy remains the user's decision after `sdd-tasks`; do not silently select chained PRs or weaken transaction boundaries.

## 15. Rejected alternatives

- Per-user/asymmetric or PIN-derived signing keys: rejected by product and unsafe with low-entropy PINs/software compromise.
- Detached epoch signatures: unnecessary under the accepted authenticated transport contract and explicitly out of scope.
- EncryptedSharedPreferences/SQLite as anti-rollback: encryption is not a monotonic hardware counter.
- TTL-based revocation: violates approved disconnected admissibility.
- Device principal as manager: destroys the human/device boundary.
- Central verifier consumption table: cannot be atomic with arbitrary consumer effects; a verifier result alone does not prevent replay.
- Token redemption without Device Sync after clear-data: bypasses canonical terminal identity and improperly absorbs DSI-7.
- Continuing `GET /identity/staff` or raw `deltas.users` as epoch authority: lacks sequence/digest/ack and can leak verifier material outside the negotiated terminal-specific envelope.

## 16. Normative tensions and blockers

1. **Specification wording tension (resolved by R1-002):** “durably activate and acknowledge ... as one crash-safe state transition” cannot be literally atomic across SQLite, HTTPS, and PostgreSQL. This design gives crash-safe convergence and freezes authorization during the distributed gap. The applied correction restates the identity delta's requirement and crash scenario in exactly this convergent state-machine form (explicit intermediate acknowledgement-pending freeze), so the delta and this section no longer contradict; the original tension is retained here as history.
2. **Current inbound RLS gap:** `InboundSyncService` uses injected repositories rather than one explicit tenant-bound transaction, while `TenantInterceptor` only documents service responsibility. Epoch/verifier reads must not copy that pattern; implementation is blocked until the new path demonstrably binds RLS in its transaction.
3. **Current duplicate staff channels:** `GET /identity/staff` is human-auth scoped and `fetchUserDeltas` already sends PIN hashes via Device Sync. OHAC must consolidate authorization authority into terminal epochs without breaking legacy login. A compatibility/deprecation matrix is required before cohort enablement.
4. **Permission source mismatch:** current staff sync uses `resolveInventoryBohPermissions`, while actual app authorization uses `resolveEffectivePermissions`. Epoch publication must use the latter; operation-specific permissions absent from `AppPermission` must be added by their owning change, not invented here.
5. **Audit entity incompleteness:** some existing services create `AuditLog` without the full hash-chain fields required by its entity. OHAC lifecycle audit must use dedicated complete append-only records or a corrected audit service; it must not imitate incomplete writes.
6. **Transport recovery authority (reframed by R1-003 as a policy gate):** clear-data transport restoration policy remains DSI-7/activation-owned. OHAC defines ordering but cannot make that external lifecycle safe. This is a DSI-7 policy sign-off gate, not an implementation blocker: the ordered path is implementable against the existing activation/bootstrap seams (§9), and pilot coverage of clear-data recovery is gated on DSI-7's documented policy sign-off.
7. **Rollout thresholds:** proposal requires numeric alert/expansion thresholds. Their absence blocks cohort expansion, not dark deployment.

## 17. Required DSI-6 amendments after this design is approved

Do not edit DSI-6 in this phase. Its proposal/spec/design must later be amended to:

- replace references to a human signature, credential ID, private key, or monotonic human-signing sequence with `ohac.assertion.v1` software-trust facts;
- state terminal-acknowledged epoch admissibility, no TTL, server ack floor, and indefinitely delayed disconnected revocation;
- define DSI-6's exact versioned operation schema/digest and required role/permissions, including its approved self-authorization policy;
- call `HumanAuthorizationVerifierPort` with DSI-6's `EntityManager` after tenant RLS binding;
- add a DSI-6-owned unique assertion-consumption row and persist it atomically with credit note, invoice, audit, payment/refund, and Kardex effects;
- define identical retry versus assertion replay/idempotency conflict using assertion ID + exact operation digest;
- retain `SyncCreditNoteAuthGuard` fail-closed behavior until compatible cohort/build and OHAC capability are operationally proven;
- remove any assumption that an acknowledgement embedded with a credit note can retroactively establish the epoch: ack must already be durable at verification;
- preserve DSI-7 terminal admissibility as a separate prerequisite and DSI-8 acceptance as separate scope;
- update shared conformance tests to consume OHAC fixtures plus DSI-6-owned operation vectors;
- map the stable `OHAC_CREDENTIAL_BINDING_MISMATCH` code (distinct from `OHAC_TENANT_TERMINAL_MISMATCH`) in DSI-6's error and remediation surface, with tenant operations as the documented remediation owner: re-authorization under the terminal's current transport credential, the stale assertion preserved append-only and never silently rewritten (R1-004);
- register DSI-6's local credit-note outbox as an assertion-bearing outbox in the terminal drain gate (§5.1) and honor ack-deferral/quarantine dispositions, so a failed push can never interact with epoch acknowledgement to silently lose a credit-note authorization.
