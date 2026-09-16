# Delta for Sales Core

## ADDED Requirements

### Requirement: Atomic authorized credit-note creation

The POS MUST commit the credit note, its immutable authorization evidence, and Outbox readiness in one local transaction. A crash or transaction failure MUST roll back all three; no credit note may become syncable without its evidence.

#### Scenario: Local creation succeeds atomically
- GIVEN an eligible actor has reauthenticated for the exact credit-note payload
- WHEN the POS creates the credit note
- THEN the credit note, evidence, unique `authorizationAuditId`, and ready Outbox record MUST be committed together.

#### Scenario: Crash rolls back creation
- GIVEN local persistence fails before commit
- WHEN the transaction is rolled back
- THEN neither a syncable credit note nor orphan authorization evidence or Outbox readiness MUST remain.

### Requirement: Fiscal and inventory history invariants

Credit-note synchronization MUST preserve existing financial, invoice and origin-item provenance, fiscal numbering and lineage rules. It MUST NOT delete or mutate invoice, credit-note, audit, or Kardex history, and MUST NOT add manager identity or authorization method fields to the printed fiscal receipt.

#### Scenario: Credit note preserves DGI history
- GIVEN an accepted credit note references an invoice and its origin items
- WHEN it is persisted and its dependent effects are applied
- THEN numbering, lineage, actor provenance, and append-only history MUST remain intact
- AND no new printed fiscal receipt fields MUST be required.

### Requirement: Atomic backend credit-note admission

Within the tenant RLS transaction, the backend MUST verify embedded authorization evidence and atomically persist and consume it with the credit note and required dependent effects. Any verification or persistence failure MUST roll back all fiscal, audit, payment, and inventory effects.

#### Scenario: Verification failure has no side effects
- GIVEN a credit-note record has missing, malformed, foreign, mismatched, or reused evidence
- WHEN backend admission runs
- THEN the transaction MUST reject and roll back without creating or mutating fiscal or Kardex history.

#### Scenario: Valid record commits once
- GIVEN evidence validates for the same tenant, terminal, actor, target, origin, items, amounts, reason, and digest
- WHEN the record is admitted under tenant RLS
- THEN evidence consumption, credit-note persistence, and required effects MUST commit together.
