# Delta for inventory-recipe-bom

## ADDED Requirements

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
