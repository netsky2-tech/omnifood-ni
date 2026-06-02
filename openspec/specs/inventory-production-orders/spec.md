# inventory-production-orders Specification

## Purpose
Define internal production batches that consume inputs and receive output inventory with historical costing.

## Requirements

### Requirement: Atomic Production Confirmation
The system MUST confirm a production order atomically by posting consumption movements for components and one receipt movement for produced output.

#### Scenario: Confirming a sub-recipe batch
- GIVEN an approved production order for a sub-recipe
- WHEN the operator confirms execution
- THEN the system SHALL post all component outflows and one output inflow in the same transaction

### Requirement: Output Cost Derivation
The system MUST value produced output as the exact sum of consumed component valuations at their effective CPP at posting time, represented as `NUMERIC(14,4)`.

#### Scenario: Costing a batch
- GIVEN components with active CPP values
- WHEN production is posted
- THEN the produced item unit cost SHALL equal total consumed value divided by net produced quantity at 4 decimals

### Requirement: Recipe Snapshot Binding
The system MUST bind each production order to an immutable recipe version snapshot used for explosion and costing.

#### Scenario: Recipe changes after planning
- GIVEN a production order created under recipe version V3
- WHEN recipe V4 is published before execution
- THEN execution SHALL continue using V3 snapshot unless explicitly re-planned
