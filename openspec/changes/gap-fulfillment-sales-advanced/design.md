# Design: Gap Fulfillment (Sales Advanced)

## Technical Approach

We will synchronize the backend data structures with the already enhanced frontend domain. This involves adding missing fields to NestJS entities and DTOs, and updating the Flutter sync mapper.

## Architecture Decisions

### Decision: Modifier Persistence in Backend

**Choice**: Separate table `invoice_item_modifiers`.
**Rationale**: Storing modifiers in a separate table allows for cleaner reporting (e.g., "how many extra soy milks were sold?") compared to JSON blobs.

### Decision: Invoice Type as Enum string

**Choice**: Use `type` column in `invoices` table with values 'regular' | 'creditNote'.
**Rationale**: Simple and extensible for future document types (e.g., 'proforma', 'debitNote').

## Data Flow

    [POS App] ──(SalesMapper.toSyncJson)──→ [Sync Payload] ──→ [NestJS SalesController]
                                                                    │
                                                              [InvoicesService]
                                                                    │
                                            ┌───────────────────────┴───────────────────────┐
                                      [Invoice Entity]      [InvoiceItem Entity]      [Modifier Entity]

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `apps/admin_backend/src/modules/sales/entities/invoice.entity.ts` | Modify | Add `type` and `relatedInvoiceId`. |
| `apps/admin_backend/src/modules/sales/entities/invoice-item.entity.ts` | Modify | Add `variantId` and `notes`. |
| `apps/admin_backend/src/modules/sales/entities/invoice-item-modifier.entity.ts` | Create | New entity for modifiers. |
| `apps/admin_backend/src/modules/sales/dto/sync-invoice.dto.ts` | Modify | Add new fields to `SyncInvoiceDto` and `CreateInvoiceItemDto`. |
| `apps/admin_backend/src/modules/sales/services/invoices.service.ts` | Modify | Handle nested persistence of modifiers. |
| `apps/pos_app/lib/data/mappers/sales_mapper.dart` | Modify | Update `toSyncJson` to include new fields. |
| `apps/pos_app/lib/ui/features/sales/sales_history_view.dart` | Create | New screen to list and search invoices. |
| `apps/pos_app/lib/presentation/features/sales/view_models/sales_history_view_model.dart` | Create | ViewModel for history management. |
| `apps/pos_app/lib/ui/features/inventory/items/item_options_editor.dart` | Create | Widget to add/edit variants and modifiers for a product. |

## Interfaces / Contracts

### New View State: SalesHistoryState
```dart
class SalesHistoryState {
  final List<Invoice> invoices;
  final bool isLoading;
  final String? searchQuery;
  // ...
}
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit (Backend) | DTO validation | Test `SyncInvoiceDto` with new fields. |
| Unit (Frontend) | Mapper logic | Verify `toSyncJson` output matches backend DTO. |
| Integration | End-to-end Sync | Sync an invoice with Credit Note and Modifiers to backend. |
| UI | History Selection | GIVEN invoices exist, WHEN clicking history, THEN list is displayed. |

## Migration / Rollout

No data migration required as these are new nullable/defaulted columns.
