# Proposal: Gap Fulfillment (Sales Advanced)

## Intent

The Flutter POS app has implemented advanced sales features (Credit Notes, Variants, Modifiers, Notes) but the NestJS backend and sync mapper are missing these fields. This prevents data consistency between FOH and BOH and blocks the completion of the Sales Module.

## Scope

### In Scope
- Update NestJS `Invoice` and `InvoiceItem` entities.
- Create `InvoiceItemModifier` entity in NestJS for many-to-one modifiers.
- Update `SyncInvoiceDto` and `CreateInvoiceItemDto` in NestJS.
- Update `InvoicesService.syncInvoices` to handle the new fields.
- Update `SalesMapper.toSyncJson` in Flutter to include the new fields.
- **Implement `SalesHistoryView` in Flutter** to list, search, and initiate returns from past invoices.
- **Implement Variants & Modifiers management** in the `ItemDetailView` (Inventory) in Flutter.
- **Enhance `ProductOptionsDialog`** to support quantity adjustments and specific notes per item before adding to cart.

### Out of Scope
- Search UI refinements for the main product grid (Deferred to Batch 7.5).
- Multi-currency support (Already in PRD, but out of this gap-fill scope).

## Capabilities

### New Capabilities
- None (Internal sync infrastructure)

### Modified Capabilities
- sales-core: Update sync and entity requirements to support advanced fields (type, relatedInvoiceId, variantId, notes, modifiers).

## Approach

Follow Strict TDD to update backend entities and DTOs. Ensure multi-tenant isolation (RLS) remains intact. Update the Flutter mapper and sync service to push the enhanced JSON payload.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/admin_backend/src/modules/sales/entities/` | Modified | Add type, relatedInvoiceId, variantId, notes to entities. |
| `apps/admin_backend/src/modules/sales/dto/` | Modified | Update DTOs to include new fields and validations. |
| `apps/admin_backend/src/modules/sales/services/` | Modified | Update sync logic to persist new fields. |
| `apps/pos_app/lib/data/mappers/sales_mapper.dart` | Modified | Update `toSyncJson` to include new fields. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Sync Payload size increase | Low | The fields are small text/UUIDs. |
| Multi-tenant leak in new entities | Med | Apply RLS policy and verify in tests. |

## Rollback Plan

Revert backend entity changes and Flutter mapper to previous state. Syncing will continue to work but without the advanced fields.

## Success Criteria

- [ ] NestJS Sync API accepts and persists `type`, `relatedInvoiceId`, `variantId`, and `notes`.
- [ ] Modifiers are persisted in the `invoice_item_modifiers` table.
- [ ] Flutter `toSyncJson` produces a payload containing all new fields.
- [ ] Integration test confirms a Credit Note synced from Flutter is correctly stored in NestJS.
