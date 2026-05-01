# Proposal: Inventory Management Implementation

## Intent
Implement a robust, offline-first inventory management system (BOH) to track raw materials (Insumos), retail products, and complex recipes (BOM). This is critical for calculating COGS, managing shrinkage, and ensuring DGI compliance.

## Scope

### In Scope
- **Backend (NestJS)**: `InventoryModule` with TypeORM entities (Insumo, Product, Recipe, Movement) and PostgreSQL RLS.
- **POS App (Flutter)**: 
  - Domain models (Freezed) and Persistence entities (Floor).
  - Recipe/BOM logic (calculating costs and stock requirements).
  - Real-time stock discount logic triggered on sales.
  - Kardex (audit-ready movement history).
  - PAR levels and stock alerts.
- **Sync**: Event-based synchronization of stock movements.

### Out of Scope
- Integration with external banking APIs (BAC/Banpro) for inventory payments (Phase 3).
- Advanced demand forecasting (AI/ML).

## Capabilities

### New Capabilities
- `inventory-core`: Management of Insumos and Simple Products.
- `inventory-recipe-bom`: Management of Recipes, Sub-recipes, and Costing (COGS).
- `inventory-movements`: Stock adjustments, Purchases, Shrinkage, and Kardex history.

### Modified Capabilities
- None.

## Approach
- **Domain-First**: Define unified entities for both apps to ensure sync consistency.
- **Offline-First**: Implement the "Movement Engine" in Flutter to allow stock adjustments and sales discounts without internet.
- **Hexagonal Integration**: Prepare ports for future barcode scanners and thermal printers (labels).

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/admin_backend/src/modules/inventory` | New | Module, Entities, Controllers, Services. |
| `apps/pos_app/lib/domain/models/inventory` | New | Freezed models. |
| `apps/pos_app/lib/data/models/inventory` | New | Floor entities. |
| `apps/pos_app/lib/data/daos/inventory` | New | Data Access Objects. |
| `apps/pos_app/lib/data/database/app_database.dart` | Modified | Register new entities/DAOs. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Stock inconsistency (Offline) | Med | Use logical clocks/timestamps and strictly sequential Kardex logs. |
| Performance (Triggers) | Low | Optimize Floor queries and use batch updates for recipe discounts. |

## Rollback Plan
- Revert DB migrations (TypeORM/Floor).
- Revert entity registration in `AppDatabase`.

## Success Criteria
- [ ] Successful CRUD of Insumos and Recipes in POS and Admin.
- [ ] Automatic stock discount verified after a simulated sale in POS.
- [ ] Kardex report shows correct history after sales, purchases, and manual adjustments.
