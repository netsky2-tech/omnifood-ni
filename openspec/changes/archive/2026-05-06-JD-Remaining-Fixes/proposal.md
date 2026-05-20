# Proposal: JD Remaining Fixes

## Intent

Nine issues remain from the JD review — one critical (FIFO bypass), six warnings (data integrity, UX, performance, sync correctness), and two suggestions. This change closes those gaps to ensure DGI compliance, offline-first resilience, and production readiness.

## Scope

### In Scope
- Connect `getBatchesForConsumption` to sale and reversal flows so perishable stock is deducted via FIFO
- Add Credit Note total validation (cannot exceed original invoice)
- Disable "REGISTRAR" button during execution in ShrinkageView
- Dispose `qtyController` and `reasonController` in ShrinkageView
- Move `SALE_CREATED` audit log inside the database transaction
- Refactor `_buildMovements` to batch-load recipe ingredients (eliminate N+1)
- Replace DropdownButtonFormField with searchable autocomplete in ShrinkageView
- Refactor `markAsSynced` to use bulk `WHERE id IN (...)`
- Add child entity reconciliation (items/payments) in `syncInvoices`

### Out of Scope
- New features beyond these nine fixes
- UI redesign beyond the searchable autocomplete swap
- Backend architecture changes unrelated to sync reconciliation

## Capabilities

### New Capabilities
None

### Modified Capabilities
- `sales-core`: FIFO batch tracking connected to sale finalization; audit log inside transaction; credit note validation; markAsSynced bulk operation
- `inventory-batch-management`: `getBatchesForConsumption` wired into movement engine for sale/reversal
- `inventory-shrinkage`: controller disposal; REGISTRAR button guard; searchable autocomplete
- `inventory-movements`: batch-loaded recipe ingredients in `_buildMovements`
- `inventory-ui-alerts`: (no spec-level changes, implementation only)
- `infrastructure`: `syncInvoices` child entity reconciliation on admin backend

## Approach

1. **FIFO (CRITICAL)**: Modify `_buildMovements` to call `getBatchesForConsumption` for each perishable insumo, attaching `batchId` and deduction amounts to movement records. Extend `MovementEntity` and Floor schema to carry `batchDeductions` JSON. Update reversal flow to restore batch stock.
2. **Credit Note validation**: In `createCreditNote`, sum existing credit notes for the original invoice and reject if `total + existing > originalTotal`.
3. **Shrinkage UX**: Wrap REGISTRAR `onPressed` with `vm.isLoading ? null : …`. Add `dispose()` overriding `TextEditingController` lifecycle.
4. **Audit atomicity**: Move `auditRepository.log('SALE_CREATED')` inside the `executeSaleTransaction` call or wrap both in a Floor `database.transaction()`.
5. **N+1 refactor**: Add `getInsumosByIds(List<String>)` to repository/DAO, call once per `_buildMovements` invocation instead of per-ingredient.
6. **Searchable autocomplete**: Replace `DropdownButtonFormField` with `Autocomplete<Insumo>` or a debounced search field.
7. **Bulk markAsSynced**: Add `markInvoicesAsSynced(List<String> ids)` DAO method using `WHERE id IN (?)` and thread through `SyncService`.
8. **Sync reconciliation**: In `syncInvoices`, diff incoming items/payments against existing for updated invoices and upsert children.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/pos_app/lib/domain/services/inventory/movement_engine_impl.dart` | Modified | Connect FIFO batch deduction + batch-load ingredients |
| `apps/pos_app/lib/data/repositories/sales/sales_repository_impl.dart` | Modified | Audit atomicity, credit note validation, bulk markAsSynced |
| `apps/pos_app/lib/data/database/app_database.dart` | Modified | Schema: movement_entity gets batchDeductions column |
| `apps/pos_app/lib/data/daos/` | Modified | New bulk queries for markAsSynced, getInsumosByIds |
| `apps/pos_app/lib/ui/features/inventory/shrinkage/` | Modified | Controller disposal, button guard, searchable autocomplete |
| `apps/pos_app/lib/data/services/sync_service.dart` | Modified | Call bulk markAsSynced |
| `apps/admin_backend/src/modules/sales/services/invoices.service.ts` | Modified | Child entity reconciliation |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Floor schema migration breaks existing data | Low | Add batchDeductions as nullable TEXT column; empty string = no batch tracking |
| N+1 refactor changes movement ordering | Low | Repository method returns map; lookup preserves insertion order |
| Credit note validation race condition | Med | Check-and-insert inside same DB transaction |
| Sync reconciliation conflicts on concurrent upserts | Med | Use `ON CONFLICT DO UPDATE` for items/payments |

## Rollback Plan

Each fix is independently revertible via Git. The FIFO change is the highest-risk — if it causes issues, reverting the movement engine change restores the old flat-deduction behavior. Migration rollback: remove the `batchDeductions` column and regenerate Floor.

## Dependencies

- Floor code generation run (`build_runner`) after schema changes
- NestJS test environment for sync reconciliation e2e

## Success Criteria

- [ ] FIFO: Sale of a perishable insumo with multiple batches deducts oldest first
- [ ] Credit Note: Creating a note exceeding original total is rejected
- [ ] Shrinkage: REGISTRAR button is disabled while `isLoading`; no controller leak
- [ ] Audit: `SALE_CREATED` entry absent if transaction rolls back
- [ ] N+1: `_buildMovements` makes O(1) repository calls per depth level, not O(N)
- [ ] Sync: `markAsSynced` executes 1 SQL statement per batch, not N
- [ ] Reconciliation: Updating a synced invoice on backend upserts changed items/payments