# Design: Sales Module Core (FOH)

## 1. Directory Structure (pos_app)

We will follow the established Clean Architecture pattern:

```
lib/
├── data/
│   ├── daos/
│   │   └── sales/
│   │       ├── invoice_dao.dart
│   │       ├── invoice_item_dao.dart
│   │       └── payment_dao.dart
│   ├── models/
│   │   └── sales/
│   │       ├── invoice_entity.dart
│   │       ├── invoice_item_entity.dart
│   │       └── payment_entity.dart
│   └── repositories/
│       └── sales/
│           └── sales_repository_impl.dart
├── domain/
│   ├── models/
│   │   └── sales/
│   │       ├── invoice.dart
│   │       ├── invoice_item.dart
│   │       ├── payment.dart
│   │       └── tax_configuration.dart
│   └── repositories/
│       └── sales/
│           └── sales_repository.dart
└── presentation/
    └── features/
        └── sales/
            └── view_models/
                └── sale_view_model.dart
```

## 2. Database Integration (Floor)

### Entities & Relationships
- `InvoiceEntity` (Parent)
- `InvoiceItemEntity` (Child, FK: `invoice_id`)
- `PaymentEntity` (Child, FK: `invoice_id`)

`AppDatabase` must be updated to include these new entities and version must be bumped to 6.

## 3. Component Design

### 3.1 SalesRepositoryImpl
- Responsibilities:
  - Create full transaction (Invoice + Items + Payments).
  - Use `Floor`'s `@transaction` annotation to ensure atomicity.
  - Coordinate with `MovementEngine` for stock deduction.
  - Integration with `AuditRepository` for logging.

### 3.2 SaleViewModel
- State:
  - `List<CartItem> cart`: Current items in the tray.
  - `bool isGlobalTaxExempt`: Toggle for "Exento General".
  - `TaxConfiguration activeTaxConfig`: Current default tax.
- Actions:
  - `addToCart(Product product)`
  - `removeFromCart(String productId)`
  - `toggleGlobalTaxExempt()`
  - `finalizeSale(List<Payment> payments)`

## 4. Sequence Diagram: Finalize Sale

1. `SaleViewModel.finalizeSale()`
2. `SalesRepository.saveInvoice(aggregate)`
3. [Inside Transaction]
   - Save `InvoiceEntity`
   - Save `InvoiceItemEntity[]`
   - Save `PaymentEntity[]`
   - `MovementEngine.deductStock()` -> Updates `insumos` table.
4. If success -> Clear Cart + Trigger Print (placeholder).
5. If failure -> Rollback + Notify User.

## 5. DGI Numbering Strategy
The sequential number will be fetched from a `LocalConfigService` that tracks:
- `authorized_range_start`
- `authorized_range_end`
- `current_number`
- `prefix` (e.g., '001-001-01-')

## 6. Multi-tenant Backend (NestJS)
New `SalesModule` in `admin_backend` with:
- `InvoicesController`: Handles sync batches.
- `InvoicesService`: Persists to PostgreSQL using RLS.
