# Specification: Recipe & Bill of Materials (BOM)

## Purpose
Define the composition of Compound Products, sub-recipes, recursive BOM explosion with DAG cycle validation, calculate theoretical costs, execute production orders atomically with exact cost derivation, and synchronize offline documents via outbox/inbox replay.

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

### Requirement: Recursive Multi-Level BOM Explosion and DAG Cycle Detection (Slice 3.1)
The system MUST resolve nested sub-recipes recursively down to their foundational raw insumos, scaling component quantities across every hierarchy level. Circular dependencies (cycles) and tree depths exceeding 5 levels MUST be strictly detected and rejected at ingestion and explosion time.

#### Scenario: Ingesting a cyclic sub-recipe reference
- GIVEN a recipe for "Product A" referencing "Sub-recipe B"
- WHEN a new version of "Sub-recipe B" attempts to reference "Product A"
- THEN the system SHALL reject the ingestion with a circular dependency error

#### Scenario: Multi-level explosion for high-depth dishes
- GIVEN a compound dish "Lasagna" containing "Salsa Bolognese" (sub-recipe), which contains "Fondo de Res" (sub-recipe), which contains raw insumos
- WHEN the system explodes the BOM for 2 portions
- THEN the system SHALL calculate the exact aggregated raw quantities for "Carne Molida", "Huesos de Res", and "Pasta" at 4-decimal precision

### Requirement: Dynamic Theoretical Costing and Profit Margins (Slice 3.2)
The system MUST calculate theoretical dish and batch costs using component gross quantities, technical shrinkages, and current weighted average costs (CPP). The system SHALL compute projected gross profit margins in NIO and percentage relative to the selling price.

#### Scenario: Computing theoretical cost and margin for a dish
- GIVEN a recipe with 2 insumos valued at current CPP
- WHEN the recipe is loaded in the workspace with selling price C$ 120.00
- THEN the system SHALL compute the total batch cost, unit theoretical cost, and projected gross profit margin %

### Requirement: Atomic Production Order Execution and Output Cost Derivation (Slice 3.3)
The system MUST execute production order closures inside a single atomic transaction across local SQLite (Floor) and Backend (TypeORM). Component consumptions and produced output receipts MUST balance, and the unit cost of the produced output MUST equal total consumed value divided by actual produced quantity.

#### Scenario: Closing a production order for sub-recipe batch
- GIVEN 2kg of Sugar (cost C$ 30.00/kg) and 1lt of Flavoring (cost C$ 40.00/lt) consumed in a batch producing 2lt of "Jarabe de la Casa"
- WHEN the production order is closed
- THEN total consumed value C$ 100.00 SHALL be divided by 2lt to derive produced unit cost C$ 50.00/lt, updating stock and FIFO batch balance atomically

### Requirement: Outbox/Inbox Synchronization and Replay Idempotency (Slice 3.4)
The system MUST synchronize offline production order documents and recipe version documents prior to generic movement replays. The backend SHALL enforce stream sequence contiguity, verify server-derived payload hashes against idempotency keys, and freeze audit records without duplicating Kardex entries upon network retries.

#### Scenario: Replaying offline production order closures
- GIVEN an offline terminal with 2 queued production order documents
- WHEN the terminal comes online and syncs its outbox
- THEN the backend SHALL process documents in deterministic source sequence order, record sync receipts, and return ACCEPTED without re-deducting stock on duplicate replays
