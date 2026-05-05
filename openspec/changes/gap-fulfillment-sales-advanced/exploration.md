# Exploration: Sales & UI Functional Gaps

### Current State
- **Backend**: Lacks fields for `type`, `relatedInvoiceId`, `variantId`, `notes`, and a table for `InvoiceItemModifiers`. Sync DTOs are incomplete.
- **Frontend (Domain/Data)**: Mostly ready. Models and DAOs support the advanced fields. `SaleViewModel` has basic logic for variants/modifiers price calculation and `processReturn`.
- **Frontend (UI)**: **CRITICAL GAP**. 
    - No `SalesHistoryView` to browse/search past invoices.
    - `ProductOptionsDialog` is minimal and only triggered if variants/modifiers exist.
    - No management UI for Variants/Modifiers in the Inventory section of the POS.
    - "Credit Notes" is just an icon in the header that opens a manual search dialog.

### Affected Areas
- `apps/admin_backend/src/modules/sales/entities/` — missing fields and new table.
- `apps/admin_backend/src/modules/sales/dto/` — missing fields in sync DTO.
- `apps/pos_app/lib/ui/features/sales/` — missing `invoice_list_view.dart`.
- `apps/pos_app/lib/ui/features/inventory/items/` — needs variant/modifier editing.
- `apps/pos_app/lib/data/mappers/sales_mapper.dart` — incomplete sync JSON.

### Approaches
1. **Minimalist (Previous Plan)** — Fix sync only. 
   - Pros: Faster, finishes backend work. 
   - Cons: Leaves UI "fake" as described by the user.
2. **Comprehensive (Recommended)** — Fix sync AND implement missing UI screens.
   - Pros: Delivers the actual features promised in the menu. Consistent FOH/BOH state.
   - Cons: Larger scope, more UI testing needed.

### Recommendation
Proceed with Approach 2. We need to build the `SalesHistoryView` (allowing easy returns) and enhance the `ProductDetail` view in inventory to manage variants/modifiers.

### Risks
- **UI Complexity**: Designing a clean interface for nested modifiers in a POS grid.
- **Offline Integrity**: Ensuring returns correctly reverse stock via `MovementEngine` across all layers.

### Ready for Proposal
Yes. The proposal will be updated to include UI tasks for Batch 7.
