# Implementation Tasks: Sales Module Core (FOH)

## Batch 1: Domain & Data Foundations
- [ ] Create Domain Models in `lib/domain/models/sales/` (Invoice, InvoiceItem, Payment, TaxConfiguration).
- [ ] Create Floor Entities in `lib/data/models/sales/` mapping the domain models.
- [ ] Create DAOs in `lib/data/daos/sales/` (InvoiceDao, InvoiceItemDao, PaymentDao).
- [ ] Update `AppDatabase` (version 6) to include new entities and DAOs.
- [ ] Implement Mappers in `lib/data/mappers/sales_mapper.dart`.

## Batch 2: Sales Repository & Business Logic
- [x] Define `SalesRepository` interface in `lib/domain/repositories/sales/`.
- [/] Implement `SalesRepositoryImpl` (In progress - missing atomic transaction).
- [ ] Create `SalesTransactionDao` to handle atomic Invoice + Items + Payments + Inventory Deduction via `@transaction`.
- [ ] Implement DGI Sequential Numbering Service (LocalConfigService).
- [ ] Add unit tests for `SalesRepositoryImpl` logic.

## Batch 3: Presentation Layer (ViewModel & Logic)
- [x] Implement `SaleViewModel` in `lib/presentation/features/sales/view_models/`.
- [ ] Integrate real Product selection from `InventoryRepository`.
- [ ] Add Modifiers/Promotions support (CartItem extensions).
- [ ] Add Box Opening/Closing (CashierSession) logic to `SaleViewModel`.
- [ ] Add unit tests for `SaleViewModel`.

## Batch 4: UI & Integration
- [/] Create `SaleView` (Main POS Screen) in `lib/ui/features/sales/`.
- [ ] Implement real Product Selection Grid (with categories/search).
- [ ] Implement Box Opening Dialog and Cierre de Caja View.
- [ ] Implement Sidebar Cart Summary with item removal/quantity editing.
- [ ] Register all new services in `main.dart`.

## Batch 5: Backend & Sync (admin_backend)
- [x] Create `SalesModule` in NestJS.
- [x] Define `Invoice`, `InvoiceItem`, and `Payment` entities (TypeORM) with RLS.
- [x] Create `SalesSyncController` to receive POS data.
- [ ] Implement basic sales reporting in Admin UI.

## Batch 6: Cloud Sync Integration (POS)
- [x] Implement `SyncInvoicesUseCase` (integrated in SyncService/Repository) in `pos_app`.
- [x] Update `SyncService` to include Sales synchronization.
- [x] Add Sync status UI indicators in `SaleView`.

## Batch 7: PRD Gap Closure (Advanced FOH)
- [ ] Implement `Product` domain model with `sku`, `barcode`, `variants`, and `modifiers`.
- [ ] Implement `Modifier` and `ProductVariant` domain models.
- [ ] Update `InvoiceItem` to support `notes`, `variantId`, and `modifiers`.
- [ ] Implement `HoldTicket` (Pausing orders) logic and local persistence.
- [ ] Refactor `SaleViewModel` to support:
    - Search by SKU/Barcode/Text.
    - Pausing/Recalling tickets.
    - Advanced Checkout (Split Payments).
    - Item-level modifiers and notes.
- [ ] Refactor `SaleView` UI:
    - Search Bar with Scanner support.
    - Modifiers/Variants selection dialog.
    - Advanced Split Payment UI in Checkout.
- [ ] Implement Credit Note flow (Devoluciones).
