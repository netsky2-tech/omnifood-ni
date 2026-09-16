# Device Sync Credit-Note Authorization Specification

## Purpose

Define fail-closed, offline-first synchronization of credit notes using embedded human authorization evidence without elevating device transport identity.

## Requirements

### Requirement: Embedded versioned authorization sync contract

Every device-synced credit-note record MUST contain a required `authorizationAuditId` and complete authorization evidence embedded in the same record. The contract MUST validate a versioned canonical payload and digest binding tenant, human actor and role, canonical physical terminal, credit-note ID, origin invoice and exact origin items, amounts, reason/policy, and every field whose substitution could change authorization. Declared user or role fields alone MUST never establish authority.

#### Scenario: Valid embedded record is accepted for verification
- GIVEN a credit-note record includes the required reference, evidence, supported contract version, and matching canonical digest
- WHEN the sync endpoint validates the record
- THEN it MUST pass the record to tenant-scoped evidence verification.

#### Scenario: Missing or malformed evidence is rejected
- GIVEN a credit-note record lacks the reference/evidence or fails schema, version, canonicalization, or integrity validation
- WHEN it is received
- THEN the endpoint MUST return stable `MISSING_AUTH_EVIDENCE` or `MALFORMED_AUTH_EVIDENCE` semantics
- AND MUST not trust declared actor or role values.

### Requirement: Fail-closed tenant and binding verification

The backend MUST reject evidence for a different tenant, actor, role, canonical terminal, target, origin invoice/item, amount, reason/policy, payload, or authorization reference. It MUST verify that the historical human actor was an active eligible manager or owner for the authorization event and MUST preserve that actor as provenance.

#### Scenario: Cross-boundary submission is denied
- GIVEN any bound identity or payload component differs from the tenant-scoped credit-note operation
- WHEN verification runs
- THEN the backend MUST reject with deterministic `FOREIGN_TENANT_AUTHORIZATION`, `UNAUTHORIZED_ACTOR_ROLE`, `TARGET_MISMATCH`, or `PAYLOAD_DIGEST_MISMATCH` semantics as applicable
- AND MUST produce no fiscal side effects.

### Requirement: Single-use authorization and retry idempotency

An authorization MUST be consumable by only one distinct credit-note operation. An identical retry with the same idempotency identity, payload, digest, and evidence MUST return the original outcome without duplicate effects. Reuse with a different operation or conflicting idempotency submission MUST fail closed with stable `REPLAYED_AUTHORIZATION` or `IDEMPOTENCY_CONFLICT` semantics.

#### Scenario: Identical retry is harmless
- GIVEN a credit-note sync already committed successfully
- WHEN the identical record is retried
- THEN the backend MUST return the original result
- AND MUST NOT duplicate credit note, audit consumption, payment, or Kardex effects.

#### Scenario: Replay or conflicting idempotency is rejected
- GIVEN consumed evidence or an existing idempotency identity is submitted for a different payload, target, or authorization reference
- WHEN the backend receives it
- THEN it MUST reject deterministically
- AND MUST preserve the original record and history.

### Requirement: Offline and outbox failure semantics

The POS MUST remain able to create eligible credit notes offline without TTL or wall-clock validity dependence. Outbox records and rejected evidence MUST remain inspectable. Terminal authorization/integrity failures MUST be distinguished from retryable sequencing or missing-origin failures; retryable records MUST be retained and retried in source order without silently dropping or silently bypassing terminal failures.

#### Scenario: Sequencing failure is retryable
- GIVEN valid evidence accompanies a credit note whose origin invoice has not arrived
- WHEN synchronization runs
- THEN the record MUST remain pending with a deterministic retryable outcome such as `ORIGIN_INVOICE_MISSING`
- AND MUST be retried without consuming evidence or dropping the record.

#### Scenario: Authorization failure is terminal
- GIVEN evidence is definitively invalid or conflicting
- WHEN synchronization runs
- THEN the record MUST be rejected or quarantined with its stable terminal error
- AND MUST remain available for append-only local remediation rather than being silently retried as success.

### Requirement: Staged compatibility and fail-closed unsupported clients

Rollout MUST be additive and preserve DSI-1–5 transport, tenant, ordering, and retry behavior. Backend versions that do not support the evidence contract MUST continue rejecting credit-note device sync; unsupported or evidence-free clients MUST have no grace acceptance. Enabling admission MUST occur only after compatibility is verified.

#### Scenario: Unsupported client remains protected
- GIVEN a device client sends a credit note without the supported evidence contract
- WHEN the backend processes it
- THEN it MUST fail closed with a deterministic unsupported or missing-evidence result
- AND MUST not create fiscal effects.

#### Scenario: Staged rollout preserves existing streams
- GIVEN mixed supported and unsupported clients during rollout
- WHEN non-credit-note DSI-1–5 records and supported credit notes synchronize
- THEN existing transport authentication, tenant isolation, source ordering, and retry semantics MUST remain unchanged
- AND unsupported credit notes MUST remain retained for remediation.
