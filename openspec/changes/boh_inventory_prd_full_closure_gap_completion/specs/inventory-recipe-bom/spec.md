# Delta for inventory-recipe-bom

## MODIFIED Requirements

### Requirement: Sub-Recipes

The system MUST support sub-recipes as reusable intermediate preparations, and BOH authoring MUST let users add, replace, and inspect sub-recipes without flattening historical recipe versions.
(Previously: Sub-recipes were optional support.)

#### Scenario: Using a sub-recipe
- GIVEN a sub-recipe "Jarabe de la Casa" (Water + Sugar)
- WHEN creating a "Vanilla Latte" recipe
- THEN the system SHALL allow adding "Jarabe de la Casa" as an ingredient.

#### Scenario: Replacing a sub-recipe in a new version
- GIVEN an active recipe references sub-recipe V2
- WHEN the operator replaces it with V3
- THEN the system MUST create a new recipe version
- AND past sales and production SHALL remain linked to the older snapshot.

### Requirement: Version Lifecycle for Recipes

The system MUST version recipes with validity windows, SHALL deactivate old versions instead of editing them in place, and MUST expose timeline and comparison views for BOH operators.
(Previously: Versions closed and reopened without operator-facing timeline/compare requirements.)

#### Scenario: Editing an active recipe (UC-05)
- GIVEN recipe version V7 is active
- WHEN operator changes ingredients
- THEN V7 SHALL close with `fecha_fin_vigencia` and a new version V8 SHALL be created.

#### Scenario: Comparing two recipe versions
- GIVEN recipe versions V7 and V8 exist
- WHEN the operator opens version compare
- THEN the system SHALL show ingredient, yield, shrink, and cost differences side by side
- AND all quantities/costs SHALL use tabular numerals.

## ADDED Requirements

### Requirement: Recipe Authoring Design Compliance

Recipe BOH screens MUST comply with `docs/DESIGN.md`, including visible labels, flat outlined sections, Inter typography, 48px minimum controls, and full-width critical modals for publish/archive actions.

#### Scenario: Publishing a recipe version
- GIVEN an operator is ready to publish a new recipe version
- WHEN the confirmation step opens
- THEN the workflow SHALL use the critical modal treatment
- AND primary/secondary actions SHALL follow the design-system color and border rules.
