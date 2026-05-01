# Proposal: Batch & FIFO Tracking Implementation

## Intent
Implement a robust batch tracking and FIFO consumption system for perishable items to reduce waste and improve inventory accuracy.

## Scope

### In Scope
- **Backend (NestJS)**: 
  - New `Batch` entity (links to `Insumo` and stores expiration + stock).
  - Refactor `recordSale` and `recordShrinkage` to deduct stock from earliest expiring batches (FIFO).
- **Frontend (Flutter POS)**:
  - New `Batch` model, entity, and DAO.
  - UI to list and manage batches for a given Insumo.
  - Integration in `MovementEngine` to apply FIFO logic locally during sales.

### Out of Scope
- Automated batch creation from raw invoice data parsing (Future).

## Capabilities

### New Capabilities
- `inventory-batch-management`: CRUD operations for batches.
- `inventory-fifo-consumption`: FIFO-based automatic deduction of stock.

### Modified Capabilities
- `inventory-movements`: Update logic to consume batches instead of global stock.

## Approach
- **Hybrid Tracking**: Only items where `isPerishable` is TRUE will enforce batch/FIFO tracking.
- **Service Layer**: `MovementEngine` will query batches sorted by `expirationDate` ASC and deduct sequentially.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/modules/inventory/entities/batch.entity.ts` | New | Batch tracking entity. |
| `lib/data/daos/inventory/batch_dao.dart` | New | Local batch operations. |
| `domain/services/inventory/movement_engine_impl.dart` | Modified | Integrate FIFO logic. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Inconsistent FIFO | Med | Atomic database transactions. |
| Performance | Med | Optimize batch selection queries (index by `expirationDate`). |

## Rollback Plan
- Revert schema and restore global stock deduction logic.

## Success Criteria
- [ ] Batches are automatically created on purchase entry.
- [ ] Sale of perishable item consumes stock from oldest batch.
- [ ] Stock reflects total of all batches correctly.
