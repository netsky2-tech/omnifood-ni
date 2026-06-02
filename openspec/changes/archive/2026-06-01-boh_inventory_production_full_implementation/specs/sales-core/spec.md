# Delta for sales-core

## ADDED Requirements

### Requirement: FOH-to-BOH Immutable Movement Hooks
Sale finalization and sale cancellation events MUST publish immutable inventory movement intents with idempotency keys and document lineage.

#### Scenario: Finalize and cancel sale lifecycle
- GIVEN an invoice is finalized and later canceled
- WHEN FOH emits both events
- THEN BOH SHALL append one consumption movement and one reversal movement linked to the same invoice lineage

### Requirement: Topology-Aware Event Contracts
FOH movement intents SHALL support Topology A immediate dispatch and Topology B deferred outbox replay without changing semantic meaning.

#### Scenario: Offline FOH in Topology B
- GIVEN tablet is offline during sales
- WHEN connectivity returns
- THEN replayed events SHALL preserve original order and produce equivalent BOH ledger outcomes
