# Specification: Recipe & Bill of Materials (BOM)

## Purpose
Define the composition of Compound Products and calculate their theoretical costs.

## Requirements

### Requirement: Recipe Definition
Compound products MUST have a defined Bill of Materials listing the required Insumos and their quantities.

#### Scenario: Creating a recipe for Capuccino
- GIVEN a Compound Product "Capuccino"
- WHEN the user adds 18g of "Granos de Café" and 200ml of "Leche" to its recipe
- THEN the system SHALL calculate the theoretical cost based on the Weighted Average Cost of those Insumos.

### Requirement: Sub-Recipes
The system SHOULD support sub-recipes (intermediate preparations used in multiple products).

#### Scenario: Using a sub-recipe
- GIVEN a sub-recipe "Jarabe de la Casa" (Water + Sugar)
- WHEN creating a "Vanilla Latte" recipe
- THEN the system SHALL allow adding "Jarabe de la Casa" as an ingredient.

### Requirement: Yield and Technical Shrink Definition
Recipe components MUST support gross quantity, technical shrink percentage, and net usable quantity with 4-decimal persistence.

#### Scenario: Defining yield factors
- GIVEN a recipe component with 15.00% technical shrink
- WHEN gross quantity 1.0000 is configured
- THEN net usable quantity SHALL persist as 0.8500

### Requirement: Version Lifecycle for Recipes
The system MUST version recipes with validity windows and SHALL deactivate old versions instead of editing them in place.

#### Scenario: Editing an active recipe (UC-05)
- GIVEN recipe version V7 is active
- WHEN operator changes ingredients
- THEN V7 SHALL close with `fecha_fin_vigencia` and a new version V8 SHALL be created
