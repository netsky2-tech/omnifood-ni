# Proposal: Inventory Purchases & Shrinkage Recording

## Intent
Implement full procurement and waste recording (shrinkage) capabilities. This completes the cycle of inventory lifecycle management as required by the PRD, enabling accurate stock tracking and COGS calculation.

## Scope

### In Scope
- **Backend (NestJS)**: 
  - Update `InventoryService` to handle purchases linked to a `Supplier`.
  - Fix `recordPurchase` conversion logic.
  - Create `recordShrinkage` in `InventoryService` with endpoint.
- **Frontend (Flutter POS)**:
  - Create `PurchaseView` and `ShrinkageView`.
  - Integrate with `InventoryRepository` CRUD methods.

### Out of Scope
- Credit term tracking for suppliers (Phase 2/3).
- Automated Purchase Order creation (Phase 2/3).

## Capabilities

### New Capabilities
- `inventory-purchasing`: Recording of vendor purchases with conversion factors.
- `inventory-shrinkage`: Recording of waste and damage with justification.

### Modified Capabilities
- `inventory-movements`: Update Kardex to link movements to `Supplier` or `Reason`.

## Approach
- **Service Layer**: Centralize purchase and shrinkage logic in `InventoryService` (Backend) to maintain consistency and leverage RLS.
- **Conversion Factor**: Ensure backend purchase logic treats quantity as "purchase units" and converts to "consumption units" correctly.
- **UI**: Use standardized form components for selection and quantity validation.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/modules/inventory/inventory.service.ts` | Modified | Fix conversion logic and add shrinkage method. |
| `src/modules/inventory/inventory.controller.ts` | Modified | Add purchase and shrinkage endpoints. |
| `lib/ui/features/inventory/purchases/` | New | UI feature for recording vendor purchases. |
| `lib/ui/features/inventory/shrinkage/` | New | UI feature for recording shrinkage. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Cost Inaccuracy | Med | Strict backend validation of conversion factors. |
| Sync Lag | Low | Ensure backend events are dispatched immediately. |

## Rollback Plan
- Revert service/controller changes and remove new feature UI directories.

## Success Criteria
- [ ] Correct application of conversionFactor in purchase logic (Unit verified).
- [ ] Shrinkage records correctly created in Kardex (Verified).
- [ ] Purchase associated with a valid Supplier (Integration verified).
