# Specification: Inventory Master Data & UI

## Purpose
Define the behavior for managing the foundational entities of the inventory system and their respective user interfaces.

## Requirements

### Requirement: Supplier Management
The system MUST allow managing a directory of suppliers with contact details and credit terms.

#### Scenario: Adding a new supplier
- GIVEN the user is on the Supplier Management screen
- WHEN they enter name "Café del Norte", phone "8888-8888", and terms "30 days"
- THEN the supplier SHALL be saved and visible in the list.

### Requirement: Warehouse Management
The system MUST support multiple storage locations (Warehouses).

#### Scenario: Creating a warehouse
- GIVEN the user is on the Warehouse Management screen
- WHEN they create a location "Barra Principal"
- THEN it SHALL be available for selection when registering items.

### Requirement: Flexible Item Configuration
Items MUST support optional batch tracking and warehouse assignment.

#### Scenario: Registering a perishable item
- GIVEN the user is on the Insumo Management screen
- WHEN they create "Leche Entera", select Warehouse "Bodega Fría", and toggle "Es Perecedero" to ON
- THEN the item SHALL be saved with these configurations.

#### Scenario: Registering a made-to-order item
- GIVEN the user is on the Insumo Management screen
- WHEN they create "Bebida Capuccino" and leave "Es Perecedero" as OFF
- THEN the system SHALL treat it as a non-batch item.
