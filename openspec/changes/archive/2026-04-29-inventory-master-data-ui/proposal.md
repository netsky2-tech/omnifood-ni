# Proposal: Inventory Master Data & UI Base

## Intent
Complete the foundational master data and management interfaces for the Inventory module. This includes adding `Supplier` and `Warehouse` entities, linking them to `Insumo`/`Product`, and implementing the corresponding management screens in the POS app. We will also add a flexibility flag (`isPerishable`) to allow optional batch/FIFO tracking.

## Scope

### In Scope
- **Backend (NestJS)**:
  - New `Supplier` and `Warehouse` entities with RLS and basic CRUD controllers.
  - Update `Insumo` and `Product` with `warehouseId` and `isPerishable` fields.
- **Frontend (Flutter)**:
  - Domain models, Floor entities, and DAOs for `Supplier` and `Warehouse`.
  - Update `Insumo`/`Product` models.
  - **Insumo Management Screen**: CRUD for items, including Warehouse selection and `isPerishable` toggle.
  - **Supplier Management Screen**: CRUD for vendors and credit terms.
  - **Warehouse Management Screen**: CRUD for storage locations.

### Out of Scope
- Advanced sync conflict resolution for master data (last-write-wins for now).
- Barcode generation UI (Phase 3).

## Capabilities

### New Capabilities
- `inventory-suppliers`: Management of vendors and contacts.
- `inventory-warehouses`: Management of storage locations.
- `inventory-item-management-ui`: POS screens for managing the item master list.

### Modified Capabilities
- `inventory-core`: Update definition to include `isPerishable` and `warehouseId`.

## Approach
- **Domain Refactor**: Extend the `Inventory` domain in both apps to support the new relationships.
- **UI Architecture**: Follow the existing MVVM pattern in `lib/ui/features/` using `ChangeNotifierProvider`.
- **Flexibility**: Use the `isPerishable` flag to drive future logic in the `MovementEngine` (Cycle 3).

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/admin_backend/src/modules/inventory` | Modified | New entities and schema updates. |
| `apps/pos_app/lib/domain/models/inventory` | Modified | Updated models. |
| `apps/pos_app/lib/data/models/inventory` | Modified | Updated Floor entities. |
| `apps/pos_app/lib/ui/features/inventory` | New | All management screens. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| UI Complexity | Med | Use standard Material design patterns and shared form components. |
| Schema Migration | Med | Ensure TypeORM and Floor migrations are handled correctly. |

## Rollback Plan
- Revert schema changes and delete new UI files.

## Success Criteria
- [ ] Successful CRUD of Suppliers and Warehouses in both POS and Admin.
- [ ] Insumos can be assigned to specific Warehouses.
- [ ] `isPerishable` flag is correctly stored and visible in the UI.
