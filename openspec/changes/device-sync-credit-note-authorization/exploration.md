# DSI-6 Exploration: Device-Sync Credit Note Authorization Evidence

> **Context:** Offline-first POS credit-note authorization binding and backend verification during device-only transport synchronization.

---

## Executive Summary

Omnifood's POS devices synchronize batch records (`POST /v1/sync/batch`) using device transport credentials (`DeviceSyncPrincipal`). To prevent unauthorized credit-note generation, `SyncCreditNoteAuthGuard` currently **fails closed** whenever a request is authenticated via a device principal. 

While human operators can issue credit notes interactively when authenticated via `AuthGuard` as active managers or owners, offline-first operations require devices to record managerial authorization locally at the moment of issuance, persist immutable cryptographic or forensic proof, and present an `authorizationAuditId` reference during batch device synchronization. 

This exploration establishes the boundaries, structural gaps, failure semantics, and minimum coherent scope for **DSI-6**, enabling trusted device-transport synchronization of credit notes without elevating the device transport principal to human status.

---

## Current State

```
Current State (Sync Batch Execution & Guard Topology)

 [POS Device] 
      │  POST /v1/sync/batch (Device Token: DeviceSyncPrincipal)
      ▼
 [SyncTransportGuard] ─────────► Validates device JWT & tenant isolation
      │
      ▼
 [SyncCreditNoteAuthGuard] ────► FAILS CLOSED if devicePrincipal is present!
      │                          (Human path allows active Manager/Owner via AuthGuard)
      ▼
 [TenantInterceptor]
      │
      ▼
 [SyncBatchController] ────────► sync-batch.dto.ts (Lacks authorizationAuditId)
      │
      ▼
 [InvoicesService.syncBatch] ──► Fails to execute credit notes via device sync
```

1. **Device Transport Quarantine:** Device sync requests carry `DeviceSyncPrincipal`. `SyncCreditNoteAuthGuard` unconditionally blocks credit note ingestion for device principals, rendering offline credit-note sync inoperable.
2. **Interactive Human Path Parity:** The direct human API path enforces tenant match and active `manager` or `owner` roles via `AuthGuard`. No equivalent evidence verification mechanism exists for batch sync.
3. **Payload Contract Gap:** `sync-batch.dto.ts` validates credit note document structures, origin invoice IDs, reason codes, authorized user identifiers, and item lines, but lacks a verified `authorizationAuditId` proof reference.
4. **Offline Reality:** In an offline-first POS architecture, managerial authorization occurs locally when connectivity is unavailable. The proof must be captured at authorization time and validated by the backend during later transport sync.

---

## Backend Path Analysis

### Inbound Ingestion Pipeline
- **Route & Controller:** `POST /v1/sync/batch` is handled by `SyncBatchController`.
- **Guard Chain:** 
  1. `SyncTransportGuard`: Validates device sync credentials, populating `req.devicePrincipal`.
  2. `SyncCreditNoteAuthGuard`: Inspects incoming batch items. When encountering document type `CREDIT_NOTE`, it currently rejects any request carrying a `devicePrincipal`.
- **Interceptor:** `TenantInterceptor` sets PostgreSQL RLS context from the verified tenant context.

### DTO Validation (`sync-batch.dto.ts`)
The current DTO validates:
- Document type (`CREDIT_NOTE`).
- Origin invoice reference (`originInvoiceId`).
- Reason codes and company cancellation policies.
- Authorized human ID (`authorizedByUserId`) and declared role (`authorizedByRole`).
- Line item provenance (`originInvoiceItemId`).
- **Deficiency:** It does not accept or validate an immutable evidence token or `authorizationAuditId`. Declared user/role fields are purely informational without proof of authorization.

### Ingestion Logic (`InvoicesService.syncBatch`)
- **Ordering & Stream Locking:** Sorts incoming records by `sourceSequence` and creates scoped stream keys `(tenant_id, device_id, flow_type)`. Deterministic validation errors halt stream processing to prevent ledger divergence.
- **Boundary Validation:** Calls `resolveRecordCreditNoteBoundaryError` to verify origin invoice existence, payment status, and balance limits.
- **Inventory Integration:** Does not support ad-hoc Kardex delta manipulation via credit notes; movements must strictly link to origin invoice lines.
- **Idempotency:** Generates payload-level cryptographic hashes to ensure duplicate batch runs do not duplicate ledger entries.

### Database Provenance & Ledger Constraints
- **Migration `AddCreditNoteProvenance1782000000000`:**
  - Added origin invoice provenance, item origin links, authorized human user ID/role columns, and Kardex provenance.
  - Enforced tenant-level check constraints, PostgreSQL Row Level Security (RLS), origin-tenant boundary checks, and append-only database triggers.
  - **Gap:** No database-level foreign key or cryptographic binding associates credit note records with an immutable audit authorization record.

---

## POS Path Analysis

### Local Issuance (`SalesRepository.createCreditNote`)
- **Issuance Requirements:** Requires `originalInvoiceId`, cancellation reason, `authorizedByUserId`, validated `manager` or `owner` role, refund policy selection, and line item splits.
- **Current State:** Manager credentials or PIN approvals are captured in-memory and recorded as plain audit metadata. The backend treats these fields as unverified assertions.

### Local Forensic Audit (`AuditRepository`)
- Maintains an offline, hash-chained local audit log of all critical terminal operations.
- Tracks local sequence numbers, action types, manager authorization overrides, timestamps, and previous-record SHA-256 hashes.
- Capable of generating verifiable audit records before sales documents are finalized.

### Sync Outbox & Ingestion (`SyncService`)
- **Ingestion Queue:** Emits pending credit notes with document type `CREDIT_NOTE` prior to replaying dependent inventory movements.
- **Idempotency Strategy:** Computes deterministic idempotency keys per local record to guard against transport re-transmissions.
- **Retry Mechanics:**
  - Missing origin invoice: Retries until origin invoice syncs or boundary error resolution occurs.
  - Validation rejection: Marked as failed/rejected; does not purge, maintaining terminal review state.

---

## Reusable Audit Infrastructure

The platform already possesses robust audit structures that can be adapted for DSI-6:

| Component | Existing Capabilities | Adaptability for DSI-6 |
|-----------|-----------------------|------------------------|
| **`AuditLog` Entity** | Stores `tenant_id`, `user_id`, `action`, `target_type`, `target_id`, `device_id`, `sequence_no`, `hash_chain`, `metodo_autorizacion`, `usuario_autorizador_id`, `timestamp`, `metadata`, and `forensic_status`. | **High.** Can serve as the backend storage and verification target for managerial authorization proofs. |
| **Hash-Chaining Engine** | Provides cryptographic tamper-evident linkages (`hash_chain`) across sequential device actions. | **Medium.** Can verify that authorization occurred in a tamper-evident sequence prior to document creation. |
| **`GovernanceApprovalService`** | Exists in inventory domain (`assertAuthorized`) to enforce human governance gates. | **Low.** Designed for interactive backend sessions; cannot directly validate asynchronous, offline device assertions without adaptation. |
| **`ChangeLog` / Audit History** | Append-only tracking of entity mutation events. | **Medium.** Useful for post-sync inspection, but insufficient for pre-persistence admission control. |

### The Critical Infrastructure Gap
While `AuditLog` contains authorization metadata columns (`metodo_autorizacion`, `usuario_autorizador_id`), there is no **formal proof contract** connecting `sync-batch.dto.ts` with an immutable `AuditLog` row via `authorizationAuditId`. The backend lacks an evaluation engine to confirm that an authorization event:
1. Was minted by an active manager/owner within the same tenant.
2. Specifically approved the exact credit note and origin invoice payload in question.
3. Has not been replayed across multiple credit notes or batch submissions.

---

## Authority Boundaries

A foundational security requirement for DSI-6 is the strict separation of transport identity from authorization authority:

```
Authority Separation Model

┌─────────────────────────────────────────────────────────────┐
│ Device Transport Realm (DeviceSyncPrincipal)                │
│ - Identity: POS Terminal / Device Registration              │
│ - Capability: Ingest batch queues, pull master data         │
│ - Boundary: NEVER elevated to human manager/owner           │
└──────────────────────────────┬──────────────────────────────┘
                               │ Carries batch payload +
                               │ authorizationAuditId reference
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ Human Authorization Realm (Manager / Owner)                 │
│ - Identity: Verifiable human user within tenant             │
│ - Capability: Authorize credit notes, price overrides, voids│
│ - Boundary: Bound cryptographically to document digest      │
└─────────────────────────────────────────────────────────────┘
```

1. **Device Transport Never Impersonates Humans:** `DeviceSyncPrincipal` remains strictly a transport wrapper. The presence of a device token must never grant managerial authority.
2. **Immutable Authorization Evidence:** Approval evidence must be generated at the POS during human authorization (PIN entry, biometric, or password challenge), signed or committed into the local audit chain, and referenced via `authorizationAuditId`.
3. **Tenant RLS Containment:** The backend verification pipeline must evaluate authorization evidence strictly within the tenant's PostgreSQL RLS context, guaranteeing cross-tenant authorization leakage is impossible.

---

## Failure Semantics & Error Taxonomy

The synchronization pipeline must fail closed on security and integrity violations while permitting graceful retry for transient state mismatches.

### Terminal Failures (Fail-Closed, Stream-Blocking or Record-Rejection)
These errors represent security violations or unrecoverable contract breaches. The record must be rejected, and the sync stream must halt or flag the terminal:
- **`MISSING_AUTH_EVIDENCE`:** Batch contains `CREDIT_NOTE` with missing `authorizationAuditId`.
- **`MALFORMED_AUTH_EVIDENCE`:** Evidence record fails schema, hash, or signature verification.
- **`FOREIGN_TENANT_AUTHORIZATION`:** Authorizer or audit record belongs to a different tenant.
- **`UNAUTHORIZED_ACTOR_ROLE`:** Authorizer lacks active `manager` or `owner` role at the time of issuance.
- **`TARGET_MISMATCH`:** Evidence binds to invoice `X`, but credit note targets invoice `Y` or unauthorized line items.
- **`REPLAYED_AUTHORIZATION`:** `authorizationAuditId` has already been consumed by an existing processed credit note.
- **`EXPIRED_OR_STALE_AUTHORIZATION`:** Authorization timestamp exceeds acceptable offline drift threshold.
- **`PAYLOAD_DIGEST_MISMATCH`:** Hash of credit note lines, amounts, or reason codes does not match the digest recorded in the authorization evidence.

### Retryable Failures (Transient / Sequencing Errors)
- **`ORIGIN_INVOICE_MISSING`:** Origin invoice has not yet reached the backend (out-of-order device sync). POS retains record in outbox and retries in next sync window.
- **`AUDIT_LOG_UNSYNCHRONIZED`:** The authorization audit record is queued in the audit sync stream and has not yet been processed by the backend. (Retryable depending on synchronization ordering architecture).

### Idempotency Contract
- **Identical Duplicate:** Ingestion of an identical credit note payload with the identical idempotency key and identical `authorizationAuditId` returns the original success result without double-posting.
- **Conflicting Duplicate:** Ingestion of an existing idempotency key with altered amounts, lines, or authorization reference must throw an unrecoverable `IDEMPOTENCY_CONFLICT` error and block the device stream.

---

## Compatibility and Migration

1. **Offline-First Compatibility:**
   - Terminals must continue generating credit notes while disconnected.
   - POS local SQLite database must store authorization audit tokens alongside the credit note record before queueing outbox messages.
2. **Append-Only Database Integrity:**
   - Existing PostgreSQL triggers introduced in `AddCreditNoteProvenance1782000000000` prohibit mutating historical sales and Kardex rows. Authorization linkages must be established at insertion time without subsequent `UPDATE` passes.
3. **Legacy Pending Outbox Records:**
   - Terminals currently holding pending credit notes generated under prior logic lack `authorizationAuditId`.
   - Migration policy must determine whether legacy records require manager re-authorization upon app update or a bounded one-time transition rule.

---

## Smallest Coherent Scope (DSI-6)

To deliver high-impact security without unbounded architectural drift, DSI-6 is defined strictly as:

```
+-----------------------------------------------------------------------------------+
|                              SMALLEST COHERENT SCOPE                              |
+-----------------------------------------------------------------------------------+
| 1. POS Local Authorization Evidence Generation                                    |
|    - Manager auth UI captures credential/PIN and mints an immutable local audit   |
|      event bound to: tenant, authorizer ID/role, device ID, original invoice ID,  |
|      credit note ID, line items/amounts, and payload digest.                      |
| 2. Outbox Payload Expansion                                                       |
|    - Extend sync-batch.dto.ts to include authorizationAuditId and audit evidence. |
| 3. Backend Verification Guard / Interceptor                                       |
|    - Replace fail-closed stub in SyncCreditNoteAuthGuard with a verifier that     |
|      authenticates the authorization evidence against tenant RLS and actor role   |
|      prior to allowing InvoicesService.syncBatch to execute.                     |
| 4. Ledger & Idempotency Binding                                                   |
|    - Persist authorizationAuditId into invoice provenance; enforce one-to-one     |
|      consumption constraint (prevent token reuse).                                |
+-----------------------------------------------------------------------------------+
```

---

## Likely Affected Areas

```
Backend Edit Surface:
 apps/admin_backend/
  ├── src/modules/sales/
  │    ├── controllers/sync-batch.controller.ts
  │    ├── dto/sync-batch.dto.ts
  │    ├── guards/sync-credit-note-auth.guard.ts
  │    ├── services/invoices.service.ts
  │    └── sales.module.ts
  ├── src/modules/audit/ (or new authorization entity module)
  │    ├── entities/audit-log.entity.ts
  │    └── services/audit.service.ts
  └── src/migrations/
       └── <timestamp>-AddCreditNoteAuthorizationBinding.ts

POS Edit Surface:
 apps/pos_app/
  ├── lib/data/
  │    ├── models/sales/credit_note_dto.dart
  │    ├── repositories/sales_repository_impl.dart
  │    ├── repositories/audit_repository_impl.dart
  │    └── services/sync_service.dart
  └── lib/domain/
       └── repositories/sales_repository.dart
```

---

## Review-Budget Forecast

- **Estimated Code Delta:** **> 400 lines of code**.
  - Backend schema migration, RLS policies, and append-only constraints (~100 LOC).
  - NestJS DTO validation, guard verification logic, and service transaction integration (~150 LOC).
  - POS local database schema migration, audit event generation, and outbox serialization (~150 LOC).
  - E2E unit, integration, and security guard test suites across backend and Dart (~250 LOC).
- **PR Guard Warning:** Because this scope spans database migrations, core financial guards, and cross-platform sync logic, it will exceed typical single-PR size budgets. PR slicing must be determined during tasks/design breakdown to ensure reviewability without breaking transactional boundaries.

---

## Risks and Mitigation

| Risk | Impact | Mitigation Strategy |
|------|--------|---------------------|
| **Replay Attacks** | Stolen manager audit token used to authorize fraudulent credit notes. | Enforce strictly single-use `authorizationAuditId` backed by unique database index/constraint and digest matching. |
| **Audit vs. Sales Sync Race** | Credit note arrives at backend before the corresponding audit log syncs. | Embed full verifiable authorization evidence directly inside the credit note sync payload, or design atomic composite batching. |
| **Outbox Head-of-Line Blocking** | A rejected credit note stalls the entire terminal sync sequence. | Implement explicit error categorization: fatal auth errors flag the record as quarantined while permitting unblocked independent sales streams. |
| **Clock Drift / Stale Auth** | Device clock is skewed, causing valid authorizations to appear expired. | Rely on monotonic sequence counters and local audit hash-chain integrity alongside bounded timestamp drift tolerance. |

---

## Unresolved Product Decisions

Before drafting the implementation specification, product and architecture stakeholders must resolve:

1. **Evidence Verification Mechanism:** Will authorization evidence be validated via cryptographic public-key signature (ed25519/asymmetric), HMAC keyed per tenant, or forensic audit chain matching?
2. **Eligible Authorizer Roles & Self-Authorization:** Can a cashier who also holds manager credentials authorize their own credit note, or is dual-custody mandatory?
3. **Authorization Method Metadata:** What specific authorization factors must be captured (`PIN`, `PASSWORD`, `BIOMETRIC`, `SUPERVISOR_BADGE_OVERRIDE`)?
4. **Token Expiry & Revocation:** How long is an offline managerial authorization valid before the POS forces re-authorization?
5. **Canonical Terminal Binding:** Is an authorization valid only on the physical device where the manager approved it, or can an approval token be passed to another lane?
6. **Schema Persistence:** Should `authorizationAuditId` be stored directly as a foreign key on the `invoices` table or within an immutable credit note provenance history entity?
7. **Legacy Outbox Records Handling:** How will un-synced credit notes created on older POS versions be handled upon app upgrade (auto-void, manager re-prompt, or server grace period)?
8. **Synchronization Pipeline Coupling:** Should audit log entries and sales documents sync via independent endpoints or within a single transactional sync batch payload?
9. **DGI / Tax Lineage Compliance:** Does Nicaraguan tax regulation (DGI) mandate specific manager identification strings printed directly on the physical fiscal credit note voucher?
10. **Error Codes & Terminal Remediation:** What exact error codes must be surfaced to the cashier UI when authorization fails, and what remediation workflow is permitted?

---

## Explicit Non-Goals

- **DSI-7:** Device credential rotation, revocation, and explicit recovery.
- **DSI-8:** Full Device Sync acceptance and operational cutover.
- **DSI-1 through DSI-5 Re-Documentation:** Foundational device sync credentials, token renewals, and transport guards are completed and established; DSI-6 focuses exclusively on credit note authorization evidence binding.
