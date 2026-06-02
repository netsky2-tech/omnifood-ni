# Delta for inventory-movements

## ADDED Requirements

### Requirement: Append-Only Correction Model
Inventory corrections MUST be represented as new compensating movements and MUST NOT mutate prior movement rows.

#### Scenario: Count correction
- GIVEN a movement was posted with wrong sign
- WHEN auditor applies correction
- THEN the ledger SHALL contain a new compensating row linked to original movement

### Requirement: Concurrency Isolation for Costing
For the same insumo, movement posting MUST enforce SERIALIZABLE isolation or FIFO serialization to prevent CPP race conditions.

#### Scenario: Concurrent postings
- GIVEN two terminals post movements for the same insumo simultaneously
- WHEN both transactions commit
- THEN resulting stock and CPP SHALL equal a valid single sequential order

### Requirement: FOH Cancellation Reversal Traceability
FOH invoice cancellation SHALL produce explicit reversal movements that preserve original lineage.

#### Scenario: Canceling a sale
- GIVEN a sale movement exists from FOH invoice X
- WHEN invoice X is marked `is_canceled`
- THEN a reversal movement SHALL be appended referencing invoice X and original movement IDs
