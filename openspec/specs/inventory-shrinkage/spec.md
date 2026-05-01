# Specification: Inventory Shrinkage

## Purpose
Track waste, damage, or loss of items to adjust inventory theoretical stock against actual stock.

## Requirements

### Requirement: Shrinkage Recording
The system MUST allow manual recording of shrinkage with a required justification.

#### Scenario: Recording waste
- GIVEN "Leche" with stock 2000ml
- WHEN the user records 500ml as "Leche derramada"
- THEN stock MUST decrease by 500ml AND a movement log SHALL record the reason "Leche derramada".
