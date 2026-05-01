# Proposal: UOM Conversion Flexibility

## Intent
Enable flexible purchasing by allowing an `Insumo` to be purchased in multiple units of measure (UOM) each with its own conversion factor, rather than a single fixed factor.

## Scope

### In Scope
- **Backend (NestJS)**:
  - New `UomConversion` entity and CRUD services.
  - Refactor `PurchaseService` to fetch conversion factor based on selected `UomConversion`.
- **Frontend (Flutter POS)**:
  - New `UomConversion` domain model and Floor entity.
  - UI updates in `PurchaseView` to display a dropdown of available UOMs for the selected Insumo.

### Out of Scope
- Automated unit price conversion based on historical pricing (Future task).

## Capabilities

### New Capabilities
- `uom-conversions`: Management of multiple conversion factors per insumo.

### Modified Capabilities
- `inventory-purchasing`: Purchase recording now selects from available conversion UOMs.

## Approach
- Introduce `UomConversion` table linked to `Insumo`.
- Update `recordPurchase` API contract to require `uomConversionId`.
- Update UI to fetch and select available UOMs for a given insumo.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/modules/inventory/entities/uom-conversion.entity.ts` | New | Mapping for UOMs to Insumo. |
| `src/modules/inventory/purchase.service.ts` | Modified | Use dynamic factor from UomConversion. |
| `lib/ui/features/inventory/purchases/` | Modified | Add UOM selection to PurchaseView. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Orphaned conversions | Low | Ensure cascade delete in DB. |
| Sync complexity | Med | Ensure master data for UOMs is synced before purchase. |

## Rollback Plan
- Revert entity schema and service logic.

## Success Criteria
- [ ] Multiple UOMs selectable per Insumo in purchase form.
- [ ] Purchase correctly calculates stock increase based on the selected UOM's factor.
