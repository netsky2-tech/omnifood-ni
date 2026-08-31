# Delta for inventory-sync-topologies

## ADDED Requirements

### Requirement: Idempotent Fulfillment and Print Replay
Sync MUST carry stable identities and source ordering for sales, Kardex, fulfillment, and print attempts. Backend replay MUST be tenant-scoped, idempotent, and MUST NOT create duplicate aggregates or effects.

#### Scenario: Reconnect retry
- GIVEN an offline checkout batch is sent and the response is lost
- WHEN the batch is sent again
- THEN the backend SHALL acknowledge existing identities without duplicate fiscal, stock, fulfillment, print, or sync records.

#### Scenario: Cross-tenant message
- GIVEN a message identifies tenant T1 but credentials belong to T2
- WHEN ingestion is attempted
- THEN the backend MUST reject it without exposing or changing T1 data.
