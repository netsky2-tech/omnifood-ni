# inventory-kardex-ledger Specification

## Purpose
Define immutable kardex ledger behavior, deterministic costing inputs, and forensic controls.

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
