# DSI-6 design: bound offline credit-note authorization evidence

## 1. Decision and readiness

**Status: BLOCKED — fail closed.** DSI-6 cannot create its own server-verifiable human authorization credential and must not enable device-synced credit-note admission until a separate prerequisite OpenSpec change is approved, implemented, provisioned, and verified.

Suggested prerequisite:

- **Change name:** `offline-human-authorization-credential`
- **Capability name:** `offline-human-authorization-credentials`
- **Purpose:** provision PIN-gated human signing credentials and signed, terminal-acknowledged authorization-policy/staff epochs that the backend can verify without trusting POS-supplied actor metadata.

This prerequisite is not initialized by DSI-6. DSI-6 consumes its frozen contracts and verified runtime capability; it does not implement, provision, rotate, recover, or revoke those credentials.

| Decision | Outcome |
|---|---|
| Admission posture | Existing blanket device credit-note rejection remains the production behavior until every prerequisite gate in section 12 passes. |
| Human policy | One active same-tenant `MANAGER` or `OWNER`; local PIN only; self-authorization requires an explicit per-credit-note reauthentication. |
| Revocation | Human role/status revocation takes effect on a terminal when that terminal atomically installs and acknowledges a newer signed policy/staff epoch. Evidence created under the terminal's last acknowledged valid epoch remains admissible; there is no wall-clock TTL. |
| Authority source | Backend verifies the credential, signed epoch, terminal acknowledgement history, and epoch sequence boundary. Current `users` state alone neither proves nor retroactively invalidates an offline authorization. |
| Terminal | Evidence is bound to the canonical physical terminal from `TerminalIdentityService` and authenticated device context. |
| Financial binding | `CN-AUTH-V1` binds payment status and every received payment field, in addition to all refund-driving invoice, line, modifier, amount, tax, actor, origin, policy, tenant, and terminal fields. |
| Roles on the wire | Evidence uses exact uppercase `MANAGER|OWNER`; existing invoice provenance metadata remains exact lowercase `manager|owner`. Mapping is explicit and one-way. |
| Unicode | Both Dart and TypeScript normalize every schema string to NFC while constructing the canonical object. Verification repeats the same normalization and compares the resulting canonical bytes; it never has a reject-or-normalize choice. |
| Local consistency | Credit note, items/payments/effects, evidence, audit-chain row, and pending sync readiness commit in one Floor transaction. |
| Backend consistency | Verification, evidence consumption, invoice/items/payments/Kardex effects, and receipt commit in one tenant-bound `SERIALIZABLE` transaction. |
| Retry | Exact identity/payload/evidence retry returns the stored result; conflicting reuse fails closed. |
| History/output | Remediation is append-only. DGI lineage and no-deletion rules remain. No authorization field is printed. |

The existing SHA-256 audit chain remains useful tamper evidence but is not the admission credential. `DeviceSyncPrincipal` remains transport-only.

## 2. Authority, scope, and required spec follow-up

Authority inputs are the proposal and delta specifications under this change:

- `specs/identity/spec.md`
- `specs/device-sync-credit-note-authorization/spec.md`
- `specs/sales-core/spec.md`

The approved product policy is unchanged: local PIN, same terminal, self-authorization with explicit reauthentication, single-use exact hash, no TTL, append-only remediation, and no print fields.

This design preserves DSI-1–5 transport, tenant, ordering, and retry behavior. DSI-7 device-credential lifecycle remains out of scope, but controlled DSI-6 enablement depends on its terminal/device revocation contract as described in section 6. DSI-8 acceptance remains out of scope.

### Required follow-up before DSI-6 decomposition

The current delta wording says the backend verifies that the historical actor was active and eligible “for the authorization event,” but it does not define terminal-acknowledged epoch semantics. Before DSI-6 implementation tasks are decomposed, a follow-up change to the DSI-6 proposal/specs must state that:

1. the signed epoch acknowledged by the terminal is the authority snapshot for offline event-time tenant/user/role/status eligibility;
2. current user state alone cannot retroactively invalidate evidence valid under that acknowledged epoch;
3. revocation is delayed for an offline terminal until its next newer epoch acknowledgement; and
4. emergency terminal revocation is a separate device-trust boundary.

That clarification is potentially narrower than an interpretation requiring current-user validation at sync time. It must not be silently introduced by implementation. No proposal or spec is changed in this correction pass.

## 3. Separate prerequisite dependency contract

### 3.1 Outputs DSI-6 must receive

The `offline-human-authorization-credential` change must deliver all of the following as a versioned, cross-platform contract:

1. **Signed authorization-policy/staff epoch envelope**
   - `tenantId`, monotonically increasing `policyEpoch`, `policyDigest`, and `previousPolicyDigest`;
   - eligible staff entries binding `userId`, exact tenant, role (`MANAGER|OWNER`), status (`ACTIVE|REVOKED|DISABLED`), and `credentialId`;
   - server signature, algorithm/key ID, canonicalization version, and verification keys;
   - no expiry or wall-clock TTL used for authorization validity.
2. **PIN-gated human credential**
   - a non-exportable or equivalently protected private signing capability associated with one `credentialId` and user;
   - local PIN unlock with no PIN or reusable verifier included in evidence;
   - a proof format signing the DSI-6 authorization statement, including exact payload digest, authorization ID, tenant, terminal, user, role, policy epoch/digest, credential ID, and monotonic authorization sequence.
3. **Rollback-resistant terminal epoch state**
   - durable highest acknowledged epoch/digest and monotonic authorization sequence outside mutable business SQLite alone;
   - atomic transition that closes epoch E at a sequence boundary, installs E+1, disables/erases superseded signing material as required, and records the E+1 acknowledgement;
   - refusal to install a lower/equal-conflicting epoch or sign from a rolled-back snapshot.
4. **Terminal acknowledgement proof and history**
   - authenticated acknowledgement binding tenant, canonical terminal, epoch, digest, terminal policy counter, and `lastAuthorizationSequence` under the preceding epoch;
   - append-only backend acknowledgement history, uniqueness/monotonic constraints, tenant RLS, and a verification API/port usable inside DSI-6's transaction;
   - a transport rule allowing an acknowledgement proof to be verified before, or atomically with, a credit-note record when the terminal first reconnects.
5. **Server verification contract**
   - deterministic verification inputs/results and stable failure categories;
   - credential registration/status history and signed epoch retrieval by tenant/epoch/digest;
   - proof that authorization sequence N belonged to the epoch interval opened by its acknowledgement and, if a newer epoch was acknowledged, did not exceed the old epoch's closing boundary.
6. **Provisioning and operational evidence**
   - enrollment, replacement, recovery, lost-terminal handling, key compromise response, observability, and cross-platform conformance fixtures;
   - verified Dart/TypeScript interoperability and physical-terminal acceptance evidence.

DSI-6 must depend on ports/contracts exposed by that capability. It must not read private keys, implement credential recovery, infer epochs from staff timestamps, or substitute the audit hash chain for the proof.

### 3.2 Dependency gate

DSI-6 remains blocked until the prerequisite is:

- approved in OpenSpec, including its threat model and device-security assumptions;
- implemented on POS and backend;
- provisioned on the intended terminals and eligible users;
- verified for PIN gating, signature correctness, rollback resistance, monotonic sequence/epoch behavior, acknowledgement persistence, recovery, and revocation; and
- operationally compatible with the DSI-7 terminal/device revocation boundary.

A schema, DTO, feature flag, or placeholder verifier does not satisfy this gate.

## 4. Architecture and data flow

```text
Signed policy/staff epoch from prerequisite
        |
        v
Terminal verifies signature + monotonicity
        |
        v
Atomic protected-state transition and acknowledgement
(policy epoch/digest + terminal counter + closing auth sequence)
        |
        v
Manager/owner enters local PIN for exact credit note
        |
        v
Prerequisite signer emits human proof over CN-AUTH-V1 digest,
credential ID, epoch/digest, terminal, authorization ID and auth sequence
        |
        v
One Floor transaction
invoice/items/payments/Kardex + audit row + authorization row + pending readiness
        |
        v
Embedded evidence -> existing /v1/sync/batch
        |
        v
SyncTransportGuard (device/tenant/canonical terminal only)
        |
        v
InvoicesService SERIALIZABLE transaction + tenant RLS
receipt locks -> epoch/ack history -> human proof -> canonical bindings
-> single-use evidence -> invoice/items/payments/Kardex -> receipt
```

Trust boundaries:

| Boundary | Meaning |
|---|---|
| Local PIN check | Unlocks the prerequisite human signing operation; PIN material never leaves the auth adapter. |
| Human credential proof | Establishes which credential authorized the exact statement. Required and currently absent. |
| Signed epoch + acknowledgement history | Establishes tenant/user/role/status eligibility and the terminal-specific revocation boundary. Required and currently absent. |
| Audit SHA-256 chain | Detects accidental/post-event mutation; does not authenticate a human. |
| Device credential | Authenticates terminal transport; does not authenticate the human. |
| PostgreSQL RLS/transaction | Contains tenant data and makes proof consumption/fiscal effects atomic. |

## 5. Canonical authorization contract

### 5.1 Encoding and Unicode

Schema ID is `CN-AUTH-V1`. Canonical bytes use the number-free RFC 8785/JCS implementations shared with audit-v3.

Normative rules:

1. Construct the fixed schema; reject unknown keys.
2. Represent every numeric quantity as a validated base-10 string, never a JSON number. Money uses NIO centavos (`scale=2`), quantities use micro-units (`scale=6`), and tax/exchange rates use ppm (`scale=6`). Values requiring rounding are rejected before authorization.
3. Include every required and optional key. An absent optional value is JSON `null`; omission and empty-string substitution are invalid.
4. **NFC rule:** before schema validation and sorting, Dart and TypeScript both normalize every string value with Unicode NFC. Canonical bytes contain only normalized strings. Backend verification reconstructs the object from received fields, applies NFC by the same algorithm, and byte-compares it with `canonicalPayload`; it does not branch between rejection and normalization. NUL and unpaired surrogates are rejected before normalization. Identifiers reject leading/trailing whitespace.
5. UTF-8 has no BOM. Digest is lowercase hex `SHA-256(canonical UTF-8 bytes)`.
6. Arrays use raw Unicode code-point ordering after NFC. Lines sort by `(originInvoiceItemId, creditNoteItemId)`, modifiers by `(name, extraPriceMinor)`, and payments by `paymentId`. Duplicate IDs and exact duplicate modifiers are invalid.
7. Integer strings use `0` or `-?[1-9][0-9]*`; reject `-0`, `+`, exponent notation, leading zeroes, overflow, and excess scale.
8. Enums are exact case-sensitive ASCII. No trimming, locale case conversion, or permissive aliases occur in canonicalization.
9. Adding any persisted input that can alter fiscal, payment, refund, tax, inventory, or provenance effects requires a new schema version before that field is accepted.

### 5.2 Exact role mapping

Two representations intentionally coexist:

| Surface | Allowed wire value | Rule |
|---|---|---|
| `authorizationEvidence.authorizerRole` and canonical payload | `MANAGER` or `OWNER` | Authoritative proof role from the signed epoch. Lowercase is rejected. |
| Existing `invoice.authorizedByRole` provenance metadata | `manager` or `owner` | Existing DTO/database convention. Uppercase is rejected. |

The POS auth adapter maps `UserRole.manager -> MANAGER` and `UserRole.owner -> OWNER` when constructing evidence, then separately emits existing lowercase invoice metadata. The backend admission service maps invoice metadata with a const map `{ manager: MANAGER, owner: OWNER }` after DTO validation and requires equality with the evidence role and signed epoch role. Neither DTO transforms nor persistence adapters lowercase/uppercase arbitrary input. Whitespace, mixed case, unknown roles, and a mismatch among the three representations return `UNAUTHORIZED_ACTOR_ROLE` with no effects.

### 5.3 Fixed canonical object

The object binds all received fields that are persisted or can affect financial, fiscal, inventory, or provenance outcomes:

```json
{
  "schemaVersion": "CN-AUTH-V1",
  "tenantId": "tenant-1",
  "terminalId": "terminal-1",
  "documentType": "CREDIT_NOTE",
  "creditNoteId": "cn-1",
  "creditNoteNumber": "NC-00000001",
  "invoiceCreatedAt": "2026-01-01T12:00:00.000Z",
  "originInvoiceId": "sale-1",
  "operatorUserId": "manager-1",
  "authorizerUserId": "manager-1",
  "authorizerRole": "MANAGER",
  "authorizationMethod": "PIN",
  "credentialId": "cred-1",
  "policyEpoch": "12",
  "policyDigest": "...",
  "authorizationSequence": "104",
  "refundReasonCode": "DEVOLUCIÓN",
  "refundReasonPolicy": "RESTOCK_ORIGINAL_BOM",
  "currency": "NIO",
  "subtotalMinor": "-1000",
  "taxMinor": "-150",
  "totalMinor": "-1150",
  "bcnOfficialRatePpm": "36624100",
  "commercialRatePpm": "36500000",
  "totalUsdMinor": "0",
  "paymentStatus": "REFUNDED",
  "isCanceled": false,
  "voidReason": null,
  "globalTaxOverride": false,
  "customerId": null,
  "relatedInvoiceId": null,
  "lines": [
    {
      "creditNoteItemId": "cn-item-1",
      "originInvoiceItemId": "sale-item-1",
      "productId": "product-1",
      "productName": "Producto",
      "variantId": null,
      "recipeVersionId": null,
      "notes": null,
      "quantityMicros": "-1000000",
      "unitPriceMinor": "1000",
      "originalTaxRatePpm": "150000",
      "appliedTaxRatePpm": "150000",
      "taxMinor": "-150",
      "discountMinor": "0",
      "totalMinor": "-1150",
      "modifiers": []
    }
  ],
  "payments": [
    {
      "paymentId": "refund-payment-1",
      "method": "CASH",
      "amountMinor": "-1150",
      "currency": "NIO",
      "exchangeRatePpm": "1000000",
      "amountNioMinor": "-1150",
      "changeGivenMinor": "0",
      "changeCurrency": "NIO",
      "voucherCode": null,
      "cardBrand": null,
      "cardType": null,
      "bankPos": null,
      "reconciliationStatus": "PENDIENTE",
      "last4": null,
      "batchNumber": null,
      "reconciledAt": null,
      "reconciledByUserId": null
    }
  ]
}
```

Normative financial rules:

- DSI-6 credit-note wire `paymentStatus` is exactly `REFUNDED`; another value is malformed and is not normalized.
- Every `CreatePaymentDto` field currently persisted by `InvoicePayment` is represented above. Optional values are explicit `null`. `invoiceId` is derived from `creditNoteId`; database `createdAt` is server-generated and cannot be supplied, so neither is an unbound client input.
- The payment array may be empty only when the existing refund policy legitimately creates no payment rows. Empty versus non-empty, each payment ID, method, amount, currency/rate, NIO amount, change, voucher/card/bank data, reconciliation status, and reconciliation actor/time are all bound.
- Backend reconstructs the complete object from the authenticated tenant/terminal plus received invoice/items/modifiers/payments and prerequisite proof. It compares canonical bytes and digest before any persistence.
- A field accepted by the DTO must not be silently dropped before reconstruction. Any future payment/refund field is rejected under V1 until a versioned canonical schema binds it.

`syncStatus`, source sequence, idempotency key, generic transport hash, and server receipt timestamps are transport/server state and are excluded from the authorization decision. They remain bound by existing idempotency/ordering contracts. Print data is unchanged.

### 5.4 Conformance fixtures

Use one identical checked-in fixture corpus consumed by Dart and TypeScript (or byte-identical app-local copies if a shared test asset is not supported). Each vector contains input, expected canonical UTF-8 JSON, base64 bytes, digest, and expected verification result.

Minimum vectors cover every canonical field mutation, every payment field and `paymentStatus`, array ordering, nullable values, numeric boundaries, malformed numeric forms, duplicate IDs/modifiers, role casing/mapping, unknown keys/enums, NUL, and unpaired surrogates.

The Unicode fixture is exact: input `refundReasonCode = "DEVOLUCIO\u0301N"` constructs canonical JSON containing `"refundReasonCode":"DEVOLUCIÓN"` (single U+00D3), and both Dart and TypeScript must produce the same bytes/digest and **accept** verification of those reconstructed normalized semantics. A fixture whose claimed `canonicalPayload` retains U+004F U+0301 does not byte-match the reconstructed canonical payload and is `MALFORMED_AUTH_EVIDENCE`. There is no “rejected or normalized” alternative expectation.

## 6. Epoch acknowledgement and revocation semantics

### 6.1 Terminal acknowledgement

For each `(tenantId, terminalId)`, policy epochs are strictly monotonic. Installing epoch E is one prerequisite-owned atomic operation:

1. verify server signature, tenant, prior digest chain, and `E > highestAcknowledgedEpoch`;
2. record the closing `lastAuthorizationSequence` for E-1;
3. install E and its eligible credential set in rollback-resistant state;
4. disable superseded credentials as specified by the prerequisite;
5. persist an acknowledgement proof for E with terminal policy counter and closing sequence; and
6. only then permit a new human signature under E.

The POS also stores a queryable projection in SQLite for support/restart, but mutable SQLite is not the rollback root of trust. A lower epoch, same epoch with a different digest, decreased policy counter, reused authorization sequence, missing acknowledgement, or broken prior-digest chain fails closed.

The backend stores acknowledgement history append-only under tenant RLS. An acknowledgement can arrive before a credit note or be included as prerequisite-owned proof processed first in the same transaction. Merely claiming an epoch in DSI-6 evidence is insufficient.

### 6.2 Backend historical validation

For evidence at epoch E and authorization sequence N, the backend must verify:

- E/digest exists in the signed tenant policy history;
- the canonical terminal acknowledged that exact E/digest;
- the credential ID is bound in E to the same tenant/user, `ACTIVE` status, and exact `MANAGER|OWNER` role;
- the human signature binds E/digest, credential ID, N, terminal, authorization ID, and DSI-6 payload digest;
- N is greater than the prior epoch's closing sequence and, when E+1 has been acknowledged, N is less than or equal to E's closing sequence;
- acknowledgement and authorization counters are monotonic and not already used inconsistently; and
- DSI-6 single-use/idempotency checks pass.

Current user state may trigger operational review but is not the validity source for historical offline evidence. If a user is revoked in epoch E+1:

- terminal T1 that acknowledged E+1 cannot create valid new evidence with that user's E credential;
- terminal T2 still offline on acknowledged E may continue authorizing with the still-valid E credential;
- delayed T2 evidence remains admissible when later synced if all E interval and single-use checks pass, even if the backend currently shows the user revoked;
- no timestamp or elapsed duration changes that result.

### 6.3 Bounded delayed-revocation threat

This policy intentionally accepts a bounded-by-connectivity threat: a revoked manager/owner may continue authorizing on each offline terminal that has not acknowledged the revoking epoch. The bound is not time; it is the terminal's next successful signed-policy receipt and acknowledgement. A terminal kept offline can therefore preserve old authority indefinitely.

Operational and audit implications:

- dashboards must show each terminal's last acknowledged epoch, current tenant epoch gap, affected credential IDs, last contact, and count/value of authorizations under superseded epochs;
- policy acknowledgement and authorization sequence boundaries are immutable audit evidence;
- operators must quarantine or physically recover intentionally disconnected/lost terminals; human revocation alone cannot remotely stop them;
- admission/audit views must distinguish “valid under terminal epoch E” from “currently active user”; and
- alerts should flag prolonged epoch lag and post-revocation arrivals without rejecting otherwise valid evidence solely for age.

### 6.4 Emergency terminal/device revocation boundary

Emergency terminal/device revocation is stronger and separate from human epoch revocation. Once the backend's authoritative device-trust policy marks a terminal/device credential revoked, transport and DSI-6 admission from that terminal fail closed even if old human evidence is otherwise valid. While a terminal is offline, no remote mechanism can prevent local issuance; reconnect admission is the enforcement point.

The lifecycle, propagation, recovery, and credential rotation mechanism belongs to DSI-7, not DSI-6. DSI-6 only consumes an authoritative `isTerminalAdmissible(tenantId, terminalId, deviceCredentialId)` result inside admission. Controlled enablement must wait for the required DSI-7 contract; DSI-6 must not invent device revocation behavior.

## 7. Local model and atomicity

Add an immutable local authorization projection linked to the existing audit row. In addition to prior audit/binding fields, it stores prerequisite outputs: `credential_id`, `policy_epoch`, `policy_digest`, `terminal_policy_counter`, `authorization_sequence`, proof algorithm/key ID, and human signature/proof bytes.

The row keeps canonical payload bytes and payload/evidence digests, actor/operator, exact uppercase evidence role, method `PIN`, tenant/terminal/target/origin, attempt number, audit sequence/hash fields, and forensic local timestamp. Update/delete are rejected. Unique constraints cover authorization ID, `(tenant, creditNote, attempt)`, credential/epoch/authorization sequence, and audit reference.

A dedicated Floor transaction persists invoice, items, modifiers, every payment, movements, audit row, authorization row, and `sync_status=pending`. DGI allocation/advance is in the same transaction. Preparation order is:

1. construct exact invoice/items/modifiers/payments and canonical terminal;
2. obtain a PIN-gated prerequisite proof for the resulting canonical digest;
3. prepare audit/evidence;
4. transactionally recheck sequence/number/epoch projection and persist all rows.

Wrong PIN, ineligible actor in the installed epoch, absent credential, failed proof, rollback-state failure, or transaction failure creates no syncable credit note and does not advance DGI numbering.

Legacy evidence-free credit notes remain pending and unsent. Remediation reconstructs the unchanged complete payload, obtains a fresh proof, and appends audit/evidence; it never rewrites fiscal history. A definitive rejection preserves the attempt and requires a new attempt. If the fiscal/payment payload must change, a lawful new compensating document is required.

## 8. Backend admission and persistence

`SyncCreditNoteAuthGuard` performs no database human authorization. For device traffic it enforces only feature/shape routing; all authoritative verification occurs inside `InvoicesService.applyExpectedRecord()` with one `EntityManager`:

1. begin `SERIALIZABLE` and bind tenant RLS before reads;
2. lock/check stream receipt, idempotency identity, authorization identity/digest, and acknowledgement state;
3. verify terminal/device admissibility from DSI-7 dependency;
4. verify signed epoch, terminal acknowledgement history, credential binding/status/role, monotonic interval, and human proof through the prerequisite port;
5. reconstruct and compare the complete NFC canonical payload, including payment status/payments;
6. verify origin/items/refund bounds/reason-policy/Kardex rules and lowercase invoice-role consistency;
7. insert immutable consumed evidence, invoice/items/modifiers/payments/Kardex, authorization reference, and receipt;
8. commit, or roll back every effect.

The backend evidence table and receipt store authorization ID, canonical/evidence digest, credential ID, policy epoch/digest, terminal policy counter, authorization sequence, proof metadata, acknowledgement reference, idempotency/stream identity, and consumption result. Tables use tenant RLS, append-only triggers, exact enum/digest checks, same-tenant references, and uniqueness sufficient to distinguish exact retry from replay.

Identical retry requires the same tenant/flow/idempotency key, generic record hash, authorization ID, canonical payload digest, evidence digest, credential/epoch/sequence, and proof bytes. Any difference is `IDEMPOTENCY_CONFLICT`; use of authorization/proof/sequence for another operation is `REPLAYED_AUTHORIZATION`. Origin-not-yet-arrived staging does not consume evidence.

## 9. Failure semantics

| Code | Retryable | Meaning/action |
|---|---:|---|
| `DEVICE_CREDIT_NOTE_AUTHORIZATION_DISABLED` | No | Prerequisite/gate incomplete; preserve locally and fail closed. |
| `MISSING_AUTH_EVIDENCE` | No | Append-only local reauthorization required. |
| `MALFORMED_AUTH_EVIDENCE` | No | Schema, NFC canonical bytes, numeric form, proof shape, or unsupported version failure. |
| `POLICY_EPOCH_NOT_ACKNOWLEDGED` | Conditional | Retry only if acknowledgement proof is expected but not yet processed; otherwise quarantine. |
| `POLICY_EPOCH_ROLLBACK` | No | Epoch/digest/counter/sequence monotonicity violation; security quarantine. |
| `INVALID_HUMAN_AUTHORIZATION_PROOF` | No | Signature/credential binding failure. |
| `FOREIGN_TENANT_AUTHORIZATION` | No | Security quarantine. |
| `UNAUTHORIZED_ACTOR_ROLE` | No | Tenant/user/role/status mismatch in the acknowledged epoch or role wire mismatch. |
| `TERMINAL_MISMATCH` | No | Evidence cannot move terminals. |
| `TERMINAL_REVOKED` | No | Emergency device boundary; no admission despite human epoch validity. |
| `TARGET_MISMATCH` / `PAYLOAD_DIGEST_MISMATCH` | No | Includes any invoice/line/modifier/payment/status mutation. |
| `REPLAYED_AUTHORIZATION` / `IDEMPOTENCY_CONFLICT` | No | Preserve and quarantine; never reinterpret as success. |
| `ORIGIN_INVOICE_MISSING` | Yes | Retain in source order; consume nothing. |
| sequence/prior-failure/transient DB/network | Yes | Preserve exact bytes and existing stream behavior. |

There is no `EXPIRED_OR_STALE_AUTHORIZATION`: timestamps and wall-clock age are forensic only.

## 10. Verification strategy

Strict-TDD evidence must cover:

1. shared Dart/TypeScript vectors for exact bytes/digests, deterministic NFC behavior, role mapping/casing, all invoice/line/modifier/payment fields, `REFUNDED`, nulls, sorting, scales, and every one-field mutation;
2. prerequisite contract tests for signed epoch chain, PIN-gated proof, credential ID binding, terminal acknowledgement persistence, epoch interval boundaries, sequence reuse, rollback attempts, and key/status changes;
3. POS tests for same-terminal manager/owner self-authorization, wrong PIN/inactive/wrong role, atomic DGI/invoice/payment/evidence persistence, restart/retry byte identity, legacy remediation, and immutable rejected attempts;
4. backend tests under real PostgreSQL RLS for acknowledgement history, old-epoch delayed arrival, revocation after acknowledgement, current-user-state divergence, cross-tenant denial, terminal emergency revocation, replay races, and transaction rollback after every write;
5. a blocker regression proving audit chain + device principal without the prerequisite proof always fails;
6. physical Q80 tests only after prerequisite and DSI-7 gates: long offline operation without TTL, two terminals acknowledging revocation at different times, lost-response retry, terminal transfer attempt, payment-field tampering, legacy remediation, no print changes, and preserved DGI/Kardex lineage.

Exact required epoch scenarios:

- T1 acknowledges E+1 and cannot sign the revoked user afterward; T2 remains on E and its new E evidence is accepted.
- Delayed E evidence with sequence at/below T1's E closing boundary is accepted after T1 acknowledges E+1; E evidence above that boundary is rejected as rollback.
- Backend current user is revoked, but valid T2/E evidence is accepted.
- A revoked terminal is rejected regardless of valid human evidence.

## 11. File-level design impact

These are architecture forecasts, not tasks or permission to implement.

| Area | Expected surfaces |
|---|---|
| Prerequisite change | Separate OpenSpec, POS protected signer/policy store, backend policy/credential/ack history and verifier, provisioning/recovery tooling, fixtures. |
| DSI-6 shared contract | Dart/TypeScript canonicalizers and byte-identical fixture corpus. |
| POS auth/sales | Credit-note PIN flow consuming prerequisite signer; canonical role mapper; exact payload builder. |
| POS persistence/sync | Additive immutable evidence projection, atomic Floor transaction, migration/generated output, embedded evidence serialization, legacy/rejection projections. |
| Backend DTO/application | Flat versioned DTOs with const-object-derived enums; application port for prerequisite verification; transaction orchestration. |
| Backend persistence | Additive evidence/receipt references, RLS, constraints, append-only triggers; no fabricated backfill. |
| Tests/operations | Cross-platform fixtures, PostgreSQL security/atomicity, Q80 acceptance, epoch-lag and rejection observability. |

Domain/application layers depend on prerequisite verification and terminal-admissibility ports; infrastructure adapters implement them. Controllers/guards do not call repositories directly or establish human authority.

## 12. Dependency DAG, rollout, and readiness gates

```text
Separate offline-human-authorization-credential OpenSpec approval
        -> prerequisite implementation + provisioning + verification
        -> required DSI-6 proposal/spec epoch clarification
        -> freeze prerequisite outputs and CN-AUTH-V1 fixtures
        -> optional dormant DSI-6 structural work
             [canonicalizers, additive schemas, parsers, verifier adapters, tests]
        -> DSI-7 terminal/device revocation contract available
        -> POS credential-dependent issuance/remediation integration
        -> cross-app PostgreSQL + physical Q80 acceptance
        -> controlled cohort enablement
        -> broader rollout (not DSI-8 acceptance)
```

### Work allowed while blocked

The team may design and test isolated canonicalization, additive append-only schemas, DTO parsing, transaction rollback harnesses, observability, and prerequisite adapter interfaces behind a permanently disabled gate. Such work must default to rejection when the prerequisite verifier or acknowledgement history is absent. Additive backend structures may be deployed dormant if they accept no credit notes and require no fabricated data.

### Work that must not ship active or enable

Until all gates pass, do not:

- replace the blanket fail-closed admission barrier;
- expose a POS workflow that promises synchronizable offline authorization;
- accept audit-chain/device-only evidence, placeholder signatures, or current-user lookup as authority;
- provision or emulate human credentials inside DSI-6;
- accept records without verified epoch acknowledgement history;
- enable fiscal/payment/Kardex persistence for device credit notes; or
- begin DSI-6 implementation task decomposition as if the evidence contract were settled.

### Enablement gates

1. Separate prerequisite approved and implemented.
2. Intended humans/terminals provisioned and recovery tested.
3. Rollback/sequence/acknowledgement security verified cross-platform.
4. Required DSI-6 proposal/spec follow-up approved.
5. CN-AUTH-V1 fixtures frozen, including all payment fields and deterministic NFC.
6. DSI-7 terminal-admissibility dependency available and tested.
7. Additive schema/RLS/append-only and atomic retry tests pass.
8. Physical Q80 cohort acceptance and support/monitoring readiness pass.

Rollback disables admission and restores the blanket barrier. Accepted evidence/fiscal history and local pending/rejected records remain immutable and inspectable. Database rollback is non-destructive; no down migration runs after production data exists.

## 13. Observability and operations

Emit counts by tenant/terminal/build/schema/epoch/result without PIN, private material, full payload, or sensitive proof bodies. Include admitted, exact retry, malformed, proof failure, epoch not acknowledged, rollback, role/status mismatch, terminal revoked, payload/payment mutation, replay, idempotency conflict, origin held, legacy awaiting authorization, and blocked-stream depth.

Audit/support views show hashed authorization/credential references, actor, role, method, terminal, target/origin, policy epoch/digest, terminal acknowledgement and sequence interval, attempt, receipt, and rejection. They must clearly label historical epoch validity versus current user status. Alert on cross-tenant attempts, rollback, terminal mismatch/revocation, replay, RLS denial, evidence mutation, canonicalization failures by build, prolonged epoch lag, high-value superseded-epoch arrivals, and stream blockage.

## 14. Risks and mitigations

| Risk | Severity | Mitigation / accepted boundary |
|---|---|---|
| No existing server-verifiable human proof (R1-001) | Blocker | Separate prerequisite change; DSI-6 remains disabled and fail closed. |
| Forged/rolled-back actor epoch (R1-002) | Blocker | Signed epochs, PIN-gated credential, protected monotonic state, terminal ack history, sequence boundaries, exact credential binding, and DSI-7 emergency terminal revocation. |
| Delayed human revocation on offline terminal | High, accepted product trade-off | Effective at terminal acknowledgement, not wall clock. Monitor epoch lag; quarantine/recover lost terminals; use emergency device revocation at reconnect. |
| Unbound payment/refund effect (R1-003) | Critical | Bind exact `REFUNDED` status and every accepted persisted payment field; reject unknown future fields until schema bump. |
| Role case confusion (R1-004) | Warning | Exact uppercase evidence, exact lowercase legacy metadata, explicit mapping and mismatch rejection. |
| NFC cross-runtime ambiguity (R1-005) | Warning | Mandatory NFC construction in both runtimes, reconstructed byte comparison, and one exact decomposed-input fixture outcome. |
| Credential/device compromise | Critical | Prerequisite protected key and recovery; DSI-7 terminal revocation. Human epoch revocation alone is insufficient. |
| Canonicalizer drift | High | One versioned schema and byte-identical fixtures in both runtimes; unsupported versions fail closed. |
| Partial persistence/replay race | High | One local transaction, one backend `SERIALIZABLE` transaction, unique constraints, locked reread classification. |
| Rollout mismatch | High | Additive dormant deployment, compatibility advertisement, disabled default, provisioned cohort gates. |
| Lost terminal remains offline | High | No remote prevention is possible. Physical recovery/quarantine plus backend terminal revocation on reconnect; explicit audit exposure. |

## 15. Alternatives considered

| Alternative | Decision |
|---|---|
| Let DSI-6 invent/provision its own human key | Rejected. It hides a security capability and lifecycle inside a dependent fiscal change. |
| Trust declared actor/role or current backend user state | Rejected. Neither proves offline PIN entry or acknowledged event-time eligibility. |
| Treat audit SHA-256 chain, device JWT, renewal secret, or downloaded PIN hash as human proof | Rejected. They are unkeyed, device-scoped, unavailable as verifiable secrets, or client-readable. |
| Reject all evidence after current user revocation | Rejected. It contradicts acknowledged offline operation and makes current state retroactively rewrite historical authority. |
| Add a wall-clock TTL | Rejected. Approved policy forbids it and terminal clocks are not authoritative. |
| Make revocation effective only when backend learns current status | Rejected. It does not define the terminal's offline authority boundary. |
| Bind no payments because totals are bound | Rejected. Method/currency/rate/reconciliation fields and payment rows can change financial outcomes independently. |
| Force all credit notes to have no payment rows | Not selected. Existing sync persists refund payment data; silently deriving empty payments could lose legitimate financial effects. |
| Accept either lowercase/uppercase roles | Rejected. Exact surface-specific representation prevents ambiguous normalization. |
| Reject-or-normalize Unicode depending on runtime | Rejected. Both runtimes always normalize during construction and verify reconstructed canonical bytes. |
| Independently sync audit before credit note or do DB work in a guard | Rejected. It breaks the atomic admission boundary. |
| Mutate rejected/legacy evidence or add print fields | Rejected. Remediation is append-only and print policy is unchanged. |

## 16. Next step

**Do not decompose DSI-6 implementation tasks yet.** The next action is for Identity/Security architecture to open and approve the separate `offline-human-authorization-credential` OpenSpec change, with Product/Compliance explicitly accepting the terminal-acknowledged delayed-revocation boundary and Operations owning lost-terminal response. After that prerequisite is implemented, provisioned, and verified, update the DSI-6 proposal/specs with the epoch semantics, freeze the consumed contract/fixtures, and rerun readiness review before task decomposition.
