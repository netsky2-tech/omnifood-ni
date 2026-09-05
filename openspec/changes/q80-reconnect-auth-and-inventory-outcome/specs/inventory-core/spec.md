# Delta for Inventory Core

## ADDED Requirements

### Requirement: Explicit Inventory Outcome for Non-Inventoriable Products
A SIMPLE product created by onboarding without an insumo or recipe MUST be explicitly non-inventoriable. A sale of that product MUST return and audit `APPLIED_NO_INVENTORY_IMPACT`, create zero inventory movements, and record the reason; the system MUST NOT infer an insumo from the product ID.

#### Scenario: Onboarding SIMPLE sale has no inventory impact
- GIVEN an onboarding-created SIMPLE product has no insumo or recipe mapping
- WHEN its sale is finalized and synced
- THEN the sale result MUST be `APPLIED_NO_INVENTORY_IMPACT`
- AND zero inventory movements MUST be created
- AND the audit record MUST state that the product is non-inventoriable because no explicit mapping exists.

#### Scenario: Product ID is not an insumo ID
- GIVEN a product ID equals or resembles an insumo ID
- WHEN no explicit product-to-insumo mapping exists
- THEN the system MUST create no movement for that insumo
- AND MUST return the explicit no-inventory-impact outcome.

### Requirement: Prepared or Compound Sale with Missing Recipe
A prepared or compound product without a published recipe MUST receive the normative inventory outcome `APPLIED_INVENTORY_PENDING`. It MUST remain sellable during onboarding and MUST NOT block `SALE_READY`, activation, setup completion, or checkout solely because the recipe is missing. The system MUST persist and audit the explicit missing-recipe reason alongside the immutable DGI invoice identity, create zero guessed or partial inventory movements, and expose an inventory-enrichment-pending warning/readiness state.

#### Scenario: Missing recipe does not block onboarding sale
- GIVEN a prepared or compound product has no published recipe during onboarding
- WHEN its sale is finalized and synced
- THEN the sale MUST remain sellable and the result MUST be `APPLIED_INVENTORY_PENDING`
- AND the product MUST remain eligible for `SALE_READY`, activation, setup completion, and checkout
- AND the system MUST expose an inventory-enrichment-pending warning/readiness state.

#### Scenario: Missing recipe is explicit and has no guessed movements
- GIVEN a prepared or compound product is sold without a published recipe
- WHEN the invoice is finalized or synchronized
- THEN the explicit missing-recipe reason MUST be persisted and audited alongside the immutable DGI invoice identity
- AND zero inventory movements MUST be created.

#### Scenario: Publication affects subsequent sales only
- GIVEN a recipe is explicitly published after a sale recorded as `APPLIED_INVENTORY_PENDING`
- WHEN a subsequent eligible sale is finalized
- THEN the published recipe MAY determine inventory consumption for that subsequent sale
- AND the earlier sale MUST retain its original outcome and MUST NOT be silently reconstructed.

#### Scenario: Historical remediation is explicit
- GIVEN historical pending sales require inventory enrichment after recipe publication
- WHEN remediation is requested
- THEN it MUST use an explicit append-only Inventory, Kardex, or audit command
- AND the system MUST NOT silently create retroactive consumption movements.
