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
