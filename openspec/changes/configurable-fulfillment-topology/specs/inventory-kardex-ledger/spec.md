# Delta for inventory-kardex-ledger

## ADDED Requirements

### Requirement: Unified Policy Authority
The Kardex MUST be the sole stock authority for `RECIPE_BOM`, `DIRECT_STOCK`, and `NOT_TRACKED`. RECIPE_BOM SHALL post resolved component consumption, DIRECT_STOCK SHALL post the sold item's stock movement even without a BOM, and NOT_TRACKED SHALL post no stock movement.

#### Scenario: Resale without BOM
- GIVEN a sold product has no BOM and uses DIRECT_STOCK
- WHEN the sale is finalized
- THEN one Kardex deduction for the sold product SHALL be recorded.

#### Scenario: Reversal preserves lineage
- GIVEN a DIRECT_STOCK sale is later canceled
- WHEN cancellation is recorded
- THEN one compensating Kardex movement SHALL reverse the original linked movement.
