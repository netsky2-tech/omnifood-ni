# inventory-sync-topologies Specification

## Purpose
Define ordered, idempotent synchronization contracts for Topology A and Topology B.

## Requirements

### Requirement: Topology B Delta Outbox Contract
Topology B clients MUST persist stock deltas locally and SHALL sync only delta movements (never absolute stock) through an ordered outbox.

#### Scenario: Offline sales replay (UC-02)
- GIVEN 50 offline sales generated ingredient deltas locally
- WHEN connectivity is restored
- THEN the client SHALL send pending deltas in original movement order with stable idempotency keys

### Requirement: Idempotent Backend Ingestion
The backend MUST process incoming deltas idempotently and in per-source sequence order without rewriting prior kardex rows.

#### Scenario: Duplicate outbox delivery
- GIVEN the same delta message is retried by network failure
- WHEN backend receives duplicate idempotency key
- THEN the backend SHALL return success without creating extra movement rows

### Requirement: Topology A Consolidation Contract
Topology A central node MUST enqueue completed inventory transactions and SHALL batch-sync them preserving local commit order.

#### Scenario: Mixed transaction batch
- GIVEN local node committed purchases, sales, and shrinkage
- WHEN periodic sync runs
- THEN cloud ingestion SHALL preserve source commit order and resulting balances
