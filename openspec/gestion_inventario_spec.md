# Gestión de Inventario Specification

## Purpose

This specification defines the behavior for the Inventory Management module (Gestión de Inventario) based on the PRD. It covers the sales trigger for real-time inventory discounting, synchronization of inventory movements, theoretical cost recalculation, and the complete user interface for shrinkage (merma). It ensures compliance with DGI regulations and respects the Offline-First architectural constraint.

## Requirements

### Requirement: Sales Trigger for Inventory Discounting (Offline-First)

The system MUST automatically discount raw materials (insumos) from the local SQLite inventory based on the Bill of Materials (BOM) when a sale is completed in the POS, without requiring cloud connectivity.

#### Scenario: Real-time discount on sale
- GIVEN the POS terminal is offline
- AND a product with a defined BOM (e.g., "Capuccino" requiring "Café en grano" and "Leche") is sold
- WHEN the sale transaction is finalized
- THEN the system MUST insert proportional outgoing inventory movements for each raw material defined in the BOM into the local database
- AND the operation MUST be grouped within a single SQLite transaction

### Requirement: DGI-Compliant Reversal on Cancellation

The system MUST NOT delete inventory movement records. If a sale is canceled, the system MUST create compensatory inventory movements to revert the stock deductions in accordance with DGI norms.

#### Scenario: Sale cancellation
- GIVEN a previously completed sale that discounted inventory
- WHEN the user cancels the sale (`is_canceled` = true)
- THEN the system MUST create positive inventory movements (entries) for the exact quantities previously discounted
- AND the system MUST NOT perform hard deletions of the original inventory movements

### Requirement: Movement Synchronization and Conflict Resolution

The system MUST synchronize local inventory movements with the NestJS backend and resolve conflicts using the oldest timestamp to determine priority.

#### Scenario: Simultaneous offline sales of limited stock
- GIVEN two offline POS terminals (A and B) have the same local stock of 1 unit for "Muffin"
- WHEN Terminal A sells the Muffin at 10:00:00 AM
- AND Terminal B sells the Muffin at 10:00:05 AM
- AND both terminals reconnect and synchronize with the backend
- THEN the backend MUST process Terminal A's movement first based on the older timestamp
- AND Terminal B's movement MUST be registered, potentially resulting in negative theoretical stock for auditing purposes

### Requirement: Recalculating Theoretical Cost

The system MUST automatically calculate the theoretical cost of composite products (recetas) based on the weighted average purchase cost of their underlying raw materials.

#### Scenario: Purchase updates theoretical cost
- GIVEN a composite product "Latte" uses 2 oz of "Coffee Bean"
- WHEN a new purchase order for "Coffee Bean" is processed at a higher price
- AND the weighted average cost of "Coffee Bean" increases
- THEN the system MUST automatically update the theoretical cost of "Latte" to reflect the new ingredient cost

### Requirement: Full Implementation of Shrinkage (Mermas) UI

The POS frontend MUST provide a fully functional user interface to register inventory shrinkage (mermas). The implementation MUST replace any existing placeholder ("empty shell") components in the navigation menu with fully interactive forms following the MVVM pattern.

#### Scenario: Navigating to the Shrinkage Screen
- GIVEN the user opens the POS navigation menu
- WHEN the user taps on the "Mermas" (Shrinkage) menu item
- THEN the system MUST display a fully implemented screen allowing selection of raw materials, quantity input, and reason for shrinkage

#### Scenario: Registering inventory loss
- GIVEN the user is on the fully functional Shrinkage (Mermas) screen
- WHEN the user selects a raw material (e.g., "Leche")
- AND inputs a loss quantity and a reason (e.g., "Derramada")
- AND submits the form
- THEN the system MUST record a negative inventory movement of type "Merma"
- AND update the local stock balance accordingly
- AND alert the ViewModel (via ChangeNotifier) to update the UI
