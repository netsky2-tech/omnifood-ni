# Fulfillment Execution Specification

## Purpose
Define channels, fulfillment states, complete physical-line output, traceability, synchronization, and retention.

## Requirements

### Requirement: Channel Semantics by Operation Mode
The system MUST support `PRINT_ONLY`, `KDS_ONLY`, and `KDS_AND_PRINT` for FOOD PARK, RESTAURANT, and HYBRID tenants. PRINT_ONLY MUST record ROUTED and PRINTED traceability, MUST NOT accumulate active KDS work, and MUST NOT mark DELIVERED from printing; digital delivery requires explicit confirmation.

#### Scenario: Hybrid KDS and print
- GIVEN a HYBRID tenant is configured KDS_AND_PRINT
- WHEN a physical order is finalized
- THEN KDS work and print traceability SHALL both be created.

#### Scenario: Print-only completion
- GIVEN a FOOD PARK tenant is configured PRINT_ONLY
- WHEN its ticket prints successfully
- THEN the record SHALL be PRINTED, no active KDS item SHALL exist, and status MUST NOT be DELIVERED.

### Requirement: Complete Grouped Fulfillment Output
Fulfillment output MUST include every physical order line, grouped by PREPARE or DIRECT_HANDOFF and then by station, including general dispatch when applicable.

#### Scenario: Mixed physical order
- GIVEN an order contains prepared, direct-handoff, and missing-route items
- WHEN output is generated
- THEN no physical line SHALL be omitted and each SHALL appear in its required action/station group.

### Requirement: Durable Sync and Retention
Fulfillment records and print traceability MUST sync idempotently and replay without duplicate effects. Synced local detail MUST be retained for 90 days; central fulfillment metadata MUST follow tenant policy. Invoice retention MUST remain separately governed and unchanged.

#### Scenario: Replay after reconnect
- GIVEN a fulfillment event is delivered twice after offline work
- WHEN the backend replays it
- THEN exactly one fulfillment effect SHALL remain and both deliveries SHALL be safely acknowledged.
