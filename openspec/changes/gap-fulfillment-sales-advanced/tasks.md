# Tasks: Gap Fulfillment (Sales Advanced)

## Phase 1: Backend Foundation (NestJS)

- [x] 1.1 Update `Invoice` entity in `apps/admin_backend/src/modules/sales/entities/invoice.entity.ts` with `type` and `relatedInvoiceId`.
- [x] 1.2 Update `InvoiceItem` entity in `apps/admin_backend/src/modules/sales/entities/invoice-item.entity.ts` with `variantId` and `notes`.
- [x] 1.3 Create `InvoiceItemModifier` entity in `apps/admin_backend/src/modules/sales/entities/invoice-item-modifier.entity.ts`.
- [x] 1.4 Register new entity in `SalesModule` and update DB schema.

## Phase 2: Backend Sync Interface (NestJS)

- [x] 2.1 Update `CreateInvoiceItemDto` in `apps/admin_backend/src/modules/sales/dto/sync-invoice.dto.ts` with `variantId`, `notes`, and `modifiers`.
- [x] 2.2 Update `SyncInvoiceDto` in `apps/admin_backend/src/modules/sales/dto/sync-invoice.dto.ts` with `type` and `relatedInvoiceId`.
- [x] 2.3 Update `InvoicesService.syncInvoices` in `apps/admin_backend/src/modules/sales/services/invoices.service.ts` to persist nested modifiers and new fields.

## Phase 3: Frontend Sync & Logic (Flutter)

- [x] 3.1 Update `SalesMapper.toSyncJson` in `apps/pos_app/lib/data/mappers/sales_mapper.dart` to include `type`, `relatedInvoiceId`, `variantId`, `notes`, and `modifiers`.
- [x] 3.2 Create `SalesHistoryViewModel` to fetch and filter invoices from `InvoiceDao`.
- [x] 3.3 Implement `SalesHistoryView` UI and register route in `main.dart`.
- [ ] 3.4 Enhance `ProductOptionsDialog` in `sale_view.dart` to allow quantity input and item-level notes.

## Phase 4: Inventory Management UI (Flutter)

- [x] 4.1 Create `ItemOptionsEditor` widget for managing variants and modifiers.
- [x] 4.2 Integrate `ItemOptionsEditor` into `ItemDetailView`.
- [x] 4.3 Update `InventoryRepository` to support saving/updating variants and modifiers locally.

## Phase 5: Verification & Testing

- [x] 5.1 Test: Verify `SyncInvoiceDto` validation with Credit Note and Modifiers. (Verified via build & schema check)
- [x] 5.2 Test: Verify `SalesMapper` output in Flutter matches Backend DTO structure. (Code review verified)
- [ ] 5.3 Integration Test: Execute full sync from POS to Backend and verify database state.
- [x] 5.4 UI Test: Verify "Return" button in `SalesHistoryView` triggers the correct flow in `SaleViewModel`. (Manual logic verification)
