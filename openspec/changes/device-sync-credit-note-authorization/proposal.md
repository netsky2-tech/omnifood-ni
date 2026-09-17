# Authorize offline credit-note sync with bound human evidence

## Executive summary

DSI-6 will replace the blanket device-sync rejection of credit notes with fail-closed verification of human authorization evidence. A manager or owner must explicitly reauthenticate on the POS before issuance. The POS will atomically store immutable authorization evidence with the local credit note, bind that evidence to the exact canonical credit-note payload hash, and send both together in the same sync record. The backend will verify and persist the evidence and credit note in one transaction without treating `DeviceSyncPrincipal` as a human actor.

This change makes legitimate offline credit notes synchronizable while preserving tenant isolation, fiscal lineage, actor history, single-use authorization, and retry-safe idempotency.

## Problem

Today, `SyncCreditNoteAuthGuard` rejects every device-authenticated batch containing a credit note. That fail-closed barrier prevents an untrusted device transport identity from asserting human authority, but it also means a valid credit note authorized by a manager or owner while the POS is offline cannot later synchronize.

The existing payload carries declared actor and role fields but no backend-verifiable, single-use evidence bound to the exact credit-note content. Consequently, the backend cannot distinguish a legitimate offline authorization from a forged assertion without either blocking all device-synced credit notes or incorrectly elevating the device principal.

Legacy pending credit notes compound the gap: records created without `authorizationAuditId` must remain recoverable without weakening server admission rules.

## Intent

Enable offline-first credit-note synchronization only when the sync record carries immutable evidence of explicit manager/owner reauthentication that is:

- created and stored atomically with the local credit note;
- bound to the tenant, canonical terminal identity, human actor and role, origin invoice, target credit note, and exact canonical payload hash;
- transported embedded in the same credit-note sync record;
- verified and persisted with the credit note in one backend transaction; and
- consumable once, while allowing identical retries to return the original outcome.

The evidence integrity mechanism is intentionally deferred to specification and design. This proposal does not assert that the evidence uses a digital signature.

## Goals

1. Allow an authorized manager or owner to issue a credit note while offline after explicit reauthentication and later sync it successfully.
2. Preserve the authority boundary: `DeviceSyncPrincipal` authenticates transport only and never becomes or synthesizes a human principal, role, or permission.
3. Make authorization single-use and inseparable from the exact canonical credit-note payload that was approved.
4. Verify and persist the embedded evidence and credit note atomically under the correct tenant context.
5. Preserve SQLite as the offline source of authority, immutable local audit evidence, Outbox retries, backend idempotency, PostgreSQL RLS, canonical terminal identity, actor history, and DGI lineage/no-deletion rules.
6. Preserve legacy pending records while requiring local reauthorization before they can sync.

## Non-goals

- DSI-7 device credential rotation, revocation, or recovery.
- DSI-8 full device-sync acceptance or operational cutover.
- Re-documenting or changing DSI-1 through DSI-5; existing dirty work remains untouched.
- Modifying `docs/finance/*`.
- A broad redesign of human authentication, roles, permissions, or interactive credit-note authorization.
- Choosing the exact evidence integrity algorithm, storage schema, guard/service decomposition, or user-interface implementation in this proposal.
- Introducing clock-dependent authorization expiry for offline validity.
- Changing fiscal numbering, credit-note financial rules, origin-item provenance, inventory reversal rules, or DGI no-deletion behavior.

## Scope

### In scope

#### POS authorization and local transaction

- Require a manager or owner operating the register to explicitly reauthenticate for each credit note.
- Record the reauthentication event, human actor identity, actor role, authorization method, tenant, canonical terminal identity, origin and target identities, and canonical payload digest in immutable local audit evidence.
- Create the authorization evidence and credit note within the same local SQLite transaction before enqueueing sync work.
- Attach a unique `authorizationAuditId` and the complete required evidence to the credit-note Outbox record.
- Keep failed or rejected records available for review and remediation; do not delete fiscal or audit history.

#### Sync contract and retry behavior

- Extend the credit-note sync record to carry `authorizationAuditId` and its embedded evidence atomically rather than relying on a separately synchronized audit record.
- Preserve existing Outbox retry semantics and source ordering.
- Treat an identical retry—same idempotency identity, credit-note payload, payload digest, and authorization evidence—as idempotent and return the original result without duplicate ledger, audit, or inventory effects.
- Reject conflicting reuse of an idempotency identity or authorization reference.

#### Backend admission and persistence

- Validate evidence within the PostgreSQL tenant RLS context before admitting the credit note.
- Confirm the authorizer belongs to the tenant and was an eligible manager or owner for the recorded event; preserve the historical actor context rather than attributing the action to the device.
- Confirm canonical terminal, origin invoice, target credit note, payload digest, and relevant line/amount/reason bindings.
- Enforce single-use authorization while distinguishing a legitimate identical retry from replay against a different operation.
- Verify and persist authorization evidence, its consumption binding, the credit note, and dependent effects in the same backend transaction.
- Preserve existing credit-note boundary checks, backend idempotency, invoice and item provenance, Kardex provenance, and append-only constraints.

#### Legacy pending credit notes

- Preserve pending local credit notes that lack `authorizationAuditId`.
- Prevent those records from syncing until a manager or owner explicitly reauthenticates locally and new bound evidence is attached through an auditable remediation path.
- Provide no server-side grace acceptance for evidence-free legacy records.

### Out of scope and unchanged

- Interactive human-authenticated API behavior except where shared invariants must remain consistent.
- Device credential lifecycle and trust recovery.
- Unrelated sync record types and independently ordered streams.
- Existing DSI-1–5 work and finance documentation.

## User and business outcomes

| Audience | Outcome |
|---|---|
| Cashier/register operator | Can complete an offline credit-note workflow with an eligible manager/owner and rely on later synchronization instead of encountering an unconditional device-sync barrier. |
| Manager/owner | Explicitly reauthenticates for the exact credit note and leaves attributable, immutable evidence; the device is never credited as the human approver. |
| Finance/audit/support | Can trace the synchronized credit note to its origin invoice, exact approved payload, canonical terminal, authorizer, role, authorization event, and retry history without reconstructing authority from unverified fields. |
| Tenant operator | Receives fail-closed protection against cross-tenant evidence, altered payloads, replay, and conflicting duplicate submissions. |
| Compliance/DGI stakeholders | Retain immutable invoice/credit-note lineage, actor history, fiscal sequence, and no-deletion semantics. |

## Impacted capabilities and likely modules

| Capability | Likely impact |
|---|---|
| Identity and authorization audit | Explicit local reauthentication; immutable tenant-scoped actor/role/method evidence; backend verification and historical attribution. |
| Sales core / credit notes | Authorization binding on credit-note creation and ingestion; unchanged financial and DGI lineage rules. |
| Device sync transport | Expanded credit-note record; device principal remains transport-only; deterministic failure and idempotent retry behavior. |
| POS local persistence | SQLite migration or equivalent additive persistence for evidence, binding, and legacy reauthorization state. |
| POS Outbox | Atomic serialization of credit note plus evidence; preserved retries and rejected-record retention. |
| Backend sales ingestion | DTO/contract validation, authorization admission, transaction orchestration, and conflict handling. |
| Backend audit persistence | Tenant-scoped immutable evidence and single-use consumption history. |
| PostgreSQL persistence | Additive schema/constraints/RLS needed for atomic linkage, uniqueness, append-only history, and tenant containment. |
| Inventory/Kardex | No new authorization authority; existing origin-line and compensating-movement provenance remains enforced within the credit-note transaction. |

Likely code surfaces include `apps/pos_app` sales, audit, SQLite, and sync adapters plus `apps/admin_backend` sales DTOs/guards/services, audit persistence, and migrations. Exact boundaries belong in design.

## Required invariants

### Security and authority

- `DeviceSyncPrincipal` MUST remain a transport identity only. It MUST NOT be converted into, mapped onto, or used to synthesize a human principal, role, or permission.
- Each credit note MUST have a distinct authorization event created after explicit manager/owner reauthentication.
- Authorization MUST be bound to the exact canonical credit-note payload hash and MUST be single-use.
- Offline validity MUST NOT depend on a wall-clock TTL. Timestamps may remain forensic data, but clock drift alone cannot invalidate otherwise valid evidence.
- Evidence integrity details MUST be defined later and MUST NOT be assumed to be digital signatures merely because hashes or hash chains exist.

### Tenant and terminal isolation

- Evidence verification and persistence MUST execute in the credit note's tenant RLS context.
- Human actor, evidence, device, origin invoice, and target credit note MUST belong to the same tenant.
- The evidence MUST preserve and validate canonical terminal identity; aliases or transport-supplied substitutions cannot change the authorizing terminal history.

### Offline and transaction integrity

- SQLite remains authoritative for offline issuance and immutable local audit history.
- Local credit note and authorization evidence creation MUST be atomic before Outbox enqueueing.
- The evidence MUST travel embedded with the credit-note sync record; the backend MUST NOT depend on an independently arriving audit stream.
- Backend evidence verification, evidence persistence/consumption, credit-note persistence, and required dependent effects MUST commit or roll back together.
- Outbox records and rejected evidence MUST remain inspectable and must not be silently discarded.

### Fiscal, audit, and DGI integrity

- Credit notes remain separate fiscal documents with immutable identity and explicit origin-invoice and origin-line lineage.
- Existing invoice, credit-note, audit, and Kardex no-deletion/append-only rules remain in force.
- Actor history records the actual human authorizer and authorization context, not the device transport principal.
- This change MUST NOT rewrite historical invoices, movements, or prior audit entries.

### Failure and idempotency

The backend MUST fail closed for:

- missing or malformed authorization evidence;
- foreign-tenant evidence, actor, device, origin, or target;
- actor identity or manager/owner role mismatch;
- canonical terminal mismatch;
- origin invoice, target credit note, line, amount, reason, or other bound-field mismatch;
- canonical payload digest mismatch;
- authorization reuse against another operation; and
- conflicting idempotency submissions.

Identical retries MUST remain idempotent. Failure categorization and terminal remediation must preserve existing stream and Outbox semantics; security failures cannot be treated as successful or silently repaired by the backend.

## Success criteria

- [ ] A manager/owner can explicitly reauthenticate and authorize a credit note while the POS is offline.
- [ ] The local authorization event and credit note are committed atomically and are available together for Outbox synchronization.
- [ ] A valid embedded authorization is verified and persisted with its credit note in one backend transaction under tenant RLS.
- [ ] Backend actor history identifies the human authorizer and never promotes `DeviceSyncPrincipal` to human authority.
- [ ] Any change to a bound canonical payload field causes the record to fail closed.
- [ ] Missing, malformed, cross-tenant, role-mismatched, terminal-mismatched, origin/target-mismatched, reused, and conflicting-idempotency evidence is rejected without fiscal side effects.
- [ ] Replaying an identical successful sync returns the original outcome and creates no duplicate invoice, evidence consumption, audit, payment, or Kardex effects.
- [ ] One authorization cannot approve two distinct credit notes.
- [ ] Legacy pending credit notes remain locally preserved but cannot sync until explicitly reauthorized; the backend provides no evidence-free grace path.
- [ ] Existing DGI invoice/credit-note lineage, fiscal sequence, append-only actor history, and no-deletion constraints continue to hold.
- [ ] Offline authorization does not fail solely because of device clock age or drift.

## Risks and mitigations

| Risk | Impact | Proposal-level mitigation |
|---|---|---|
| Evidence replay or substitution | Unauthorized or altered credit note is admitted. | Bind one unique authorization to the exact canonical payload and enforce atomic single-use consumption plus idempotency distinction. |
| Canonicalization disagreement between POS and backend | Valid records are rejected, or altered records hash equivalently. | Define one versioned canonical payload contract and conformance vectors in specification/design. |
| Partial local or backend persistence | Credit note exists without trustworthy evidence, or evidence is consumed without the fiscal document. | Require one local transaction and one backend transaction for each respective consistency boundary. |
| Role/actor history ambiguity offline | Current account state may not explain historical approval. | Persist explicit event-time actor and role context and define verification policy in specification without attributing authority to transport. |
| Legacy record remediation mutates history | Audit and DGI traceability are weakened. | Preserve the original pending record and append a new explicit reauthorization event/binding; never fabricate or backdate evidence. |
| Strict rejection blocks a terminal stream | Operations/support burden and delayed independent records. | Specify deterministic errors and safe remediation while retaining current Outbox ordering and no silent bypass. |
| Rollout mismatch across POS/backend versions | New records cannot sync or old clients remain blocked. | Use additive schema/contract deployment and staged enforcement with compatibility verified before enablement. |
| Scope exceeds review capacity | Security and fiscal defects are missed in a large review. | Make a reviewable delivery decision after tasks are known; do not pre-commit to a PR split in this proposal. |

## Dependencies

- Existing device transport authentication and tenant-context establishment from DSI-1–5.
- Existing POS `AuditRepository`, immutable/hash-chained audit capabilities, SQLite transaction support, and Outbox retry behavior.
- Existing credit-note creation, origin invoice/item provenance, and canonical terminal identity.
- Existing backend sales sync idempotency and payload hashing behavior.
- Existing PostgreSQL tenant RLS, audit structures, append-only constraints, and credit-note/Kardex provenance.
- A design/spec decision for canonical payload representation and evidence integrity verification that works offline without claiming an unestablished signature scheme.
- Product answers to the unresolved questions below where they affect authorization eligibility or operator remediation.

## Rollout and rollback

### Rollout approach

1. Define the versioned sync/evidence contract, canonical payload fields, error taxonomy, and compatibility behavior before implementation.
2. Deploy additive backend persistence, RLS/constraints, verification capability, and observability while retaining the current fail-closed behavior for unsupported records.
3. Deploy POS local persistence, explicit reauthentication, atomic evidence creation, embedded Outbox serialization, and legacy reauthorization workflow.
4. Enable evidence-backed device credit-note admission in a controlled tenant/device cohort after offline, reconnect, replay, cross-tenant, tamper, and DGI lineage validation.
5. Expand only after identical retries, conflict handling, legacy remediation, and support visibility are demonstrated.

### Rollback approach

- Disable evidence-backed device credit-note admission and return to the existing fail-closed sync barrier.
- Keep local credit notes, Outbox records, authorization evidence, backend audit records, and fiscal history intact for later retry or investigation.
- Do not delete, rewrite, detach, or downgrade already persisted authorization, invoice, credit-note, audit, or Kardex records.
- Rollback may stop new admissions; it must not synthesize human authority or accept legacy evidence-free records.

## Delivery and review constraint

Exploration indicates the likely implementation will exceed the **400 changed-line review budget** because it spans POS persistence and UX, sync contracts, backend authorization and transactions, PostgreSQL migration/RLS/constraints, and cross-platform security tests. With delivery strategy `ask-always`, the team must make an explicit reviewable delivery decision after design/tasks expose the true dependency graph. This proposal intentionally does **not** invent a PR split or weaken atomic boundaries to fit the budget.

## Resolved proposal decisions

The product question rounds established the following authoritative first-release policy:

- Authorization evidence is embedded atomically with the credit-note sync record.
- An eligible manager or owner may authorize a credit note they are operating only after explicit reauthentication; dual custody is not required.
- Local PIN is the only accepted first-release reauthentication method.
- Authorization must occur on, and remain bound to, the same canonical physical terminal that creates the credit note.
- Each authorization is single-use and bound to the exact canonical payload hash, without clock-dependent expiry.
- Legacy pending records without evidence require local reauthorization; the server provides no grace bypass.
- A definitive backend evidence rejection is remediated by appending new authorization evidence while preserving the rejected evidence and fiscal history unchanged.
- Manager identity and authorization method remain in immutable audit history; this change adds no fields to the printed fiscal receipt.

No unresolved product question blocks specification. Evidence integrity mechanics, canonicalization, persistence structure, and deterministic error mapping remain technical specification/design decisions.
