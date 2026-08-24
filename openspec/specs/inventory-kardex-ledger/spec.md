# inventory-kardex-ledger Specification

## Purpose
Define immutable kardex ledger behavior, deterministic costing inputs, negative-stock retrocalculation lifecycle, and forensic controls.

## Requirements

### Requirement: Append-Only Sequential Ledger
The system MUST persist all inventory movements as append-only kardex rows with globally increasing sequence IDs and MUST NOT update or delete historical rows.

#### Scenario: Correcting an input error
- GIVEN a purchase movement was posted with a wrong quantity
- WHEN an operator corrects the mistake
- THEN the system SHALL add a compensating movement with inverse sign and linked origin

### Requirement: Fixed Precision for Stock and Cost
The system MUST store `cantidad`, `existencia_posterior`, `costo_unitario_movimiento_nio`, and `costo_promedio_posterior_nio` as `NUMERIC(14,4)` and SHALL round only at persistence boundaries.

#### Scenario: Repeating fractional operations
- GIVEN repeated fractional movements on one item
- WHEN the ledger applies 1,000 operations
- THEN stored balances and costs SHALL remain deterministic at 4 decimals

### Requirement: High-Value Forensic Alerts
The system MUST emit an asynchronous admin alert when a manual movement or `AJUSTE_CONTEO` exceeds C$1,500.0000 equivalent.

#### Scenario: Large count adjustment
- GIVEN a count adjustment valued above C$1,500.0000
- WHEN the movement is committed
- THEN the system SHALL enqueue push and email forensic alerts with user, terminal, and document metadata

### Requirement: Negative-Stock Costing Lifecycle & Queueing (Batch 6b)
The system MUST assign lifecycle states to inventory movements (`10 = PROVISIONAL`, `20 = IN_PROGRESS`, `30 = REGULARIZED`, `40 = BLOCKED`, `50 = DEAD_LETTER_QUEUE`). Any sale or consumption occurring with zero or negative stock MUST be recorded with `PROVISIONAL` costing and enqueued into `kardex_recalculate_queue`.

#### Scenario: Sale under negative stock condition
- GIVEN an insumo with zero or negative on-hand stock
- WHEN a sale or recipe explosion consumes this insumo
- THEN the system SHALL record the movement with `estado_costeo = 10 (PROVISIONAL)` and enqueue a pending entry in `kardex_recalculate_queue`

### Requirement: Deterministic Retrocalculation Engine & Lineage Hash (Batch 6b)
When a replenishment purchase arrives, the system MUST retrocalculate pending provisional movements using deterministic formulas and an immutable SHA-256 lineage hash (`origen:trigger:delta:qty`). Cost deltas under the system threshold (C$1,500.00) MUST auto-regularize to `30 (REGULARIZED)`.

#### Scenario: Purchase replenishment triggers auto-regularization
- GIVEN an insumo with pending provisional movements in the queue
- WHEN a purchase movement is recorded with a new unit cost
- AND the total delta cost is <= C$1,500.00
- THEN the system SHALL calculate the delta, generate the SHA-256 lineage hash, mark the movement as `30 (REGULARIZED)`, and persist the immutable `kardex_correction` record

### Requirement: Multi-Tiered Governance Approval Matrix (Batch 6b)
When a retrocalculation delta exceeds C$1,500.00 or belongs to a closed accounting period, the movement MUST be marked as `40 (BLOCKED)`. Authorization requires:
- Manager: up to C$10,000.00 in open periods.
- Admin / Owner / Accountant: above C$10,000.00 or any closed period.

#### Scenario: Supervisor overrides blocked high-value delta
- GIVEN a provisional movement whose retrocalculation delta exceeds C$1,500.00
- WHEN the movement enters `40 (BLOCKED)` state
- AND a supervisor provides valid authentication (PIN/TOTP)
- THEN the system SHALL record the authorization metadata in `kardex_corrections` and transition the movement to `30 (REGULARIZED)`

### Requirement: Outbox Synchronization & Idempotent Ingestion (Batch 6b)
The POS system MUST dispatch local kardex corrections via `POST /inventory/regularization/sync`. The backend MUST enforce idempotent deduplication by `lineage_hash` and atomically update movement state to `REGULARIZED`.

#### Scenario: Outbox sync pass with duplicate network retry
- GIVEN a batch of local corrections sent from the POS terminal
- WHEN the backend processes the batch
- THEN the backend SHALL ingest new corrections, skip duplicate `lineage_hash` entries, and return `{ syncedCount, duplicatesCount }`

### Requirement: Multi-Filter Kardex Reporting (Slice 4.3)
The system MUST provide multi-filter querying across the kardex ledger by transaction type, insumo, warehouse, and date period with pagination, returning unit costs, line valuations, post-movement stock, and lineage traceability.

#### Scenario: Querying kardex ledger with combined filters
- GIVEN historical inventory movements recorded in the ledger
- WHEN an operator filters by a specific insumo and movement type within a date range
- THEN the system SHALL return matching movements ordered chronologically with unit cost, resulting stock, and origin document labels

