# Specification: Sales Module Core (FOH)

## 1. Functional Requirements

### FR-01: Transaction Processing
- **Cart Management**: Add/remove products, adjust quantities.
- **Price Calculation**: Subtotal, dynamic Tax (IVA), and Total.
- **Tax Flexibility**: Support for tax exemptions (Exento) and variable rates per product or globally (e.g., tax-free holidays).
- **DGI Compliance**: Automatic assignment of sequential invoice numbers based on authorized range.
- **Inventory Integration**: Real-time stock deduction via `MovementEngine` upon sale finalization.

### FR-02: Payment Management
- **Multi-currency**: Support for NIO and USD with configurable exchange rate.
- **Split Payments**: Multiple payment methods for a single invoice.
- **Payment Methods**: CASH, CARD, QR (Banpro/BAC).

### FR-03: Fiscal Integrity
- **No-Deletion Policy**: Invoices can only be voided (`is_canceled = true`), never deleted.
- **Voiding Logic**: Requires a reason and creates a reversal movement in inventory.
- **Tax Audit**: Maintain a record of the tax rate applied at the moment of the sale to ensure historical accuracy.

## 2. Technical Contracts

### 2.1 Domain Models (`lib/domain/models/sales/`)

#### Invoice
```dart
@freezed
class Invoice with _$Invoice {
  const factory Invoice({
    required String id, // UUID
    required String number, // Formatted: 001-001-01-00000001
    required DateTime createdAt,
    required String userId,
    required double subtotal,
    required double totalTax, // Sum of all item taxes
    required double total,
    @Default(false) bool isCanceled,
    String? voidReason,
    @Default(SyncStatus.pending) SyncStatus syncStatus,
    @Default(PaymentStatus.pending) PaymentStatus paymentStatus,
    String? customerId,
  }) = _Invoice;
}
```

#### InvoiceItem
```dart
@freezed
class InvoiceItem with _$InvoiceItem {
  const factory InvoiceItem({
    required String id,
    required String invoiceId,
    required String productId,
    required String productName,
    required double quantity,
    required double unitPrice,
    required double taxRate, // The rate applied (e.g., 0.15 or 0.0)
    required double taxAmount, // Calculated tax for this item
    required double total,
    @Default(0.0) double discount,
  }) = _InvoiceItem;
}
```

#### TaxConfiguration
```dart
@freezed
class TaxConfiguration with _$TaxConfiguration {
  const factory TaxConfiguration({
    required String id,
    required String name, // e.g., "IVA 15%", "Exento"
    required double rate, // 0.15, 0.0, etc.
    required bool isActive,
    required bool isDefault,
  }) = _TaxConfiguration;
}
```

### 2.2 Data Layer (SQLite/Floor)

#### Entities
- `InvoiceEntity`: Maps `Invoice` domain model. Indices on `number` (unique) and `syncStatus`.
- `InvoiceItemEntity`: Maps `InvoiceItem`. Foreign key to `InvoiceEntity`.
- `PaymentEntity`: Maps payments. Foreign key to `InvoiceEntity`.
- `TaxConfigEntity`: Stores local tax rules.

#### DAOs
- `InvoiceDao`: `insertInvoice`, `updateInvoice`, `getInvoiceById`, `getUnsyncedInvoices`.
- `InvoiceItemDao`: `insertItems`, `getItemsByInvoice`.
- `TaxConfigDao`: CRUD for tax settings.

## 3. Business Logic Rules

### Total Calculation
$ItemTax = (Quantity \times UnitPrice - Discount) \times TaxRate$
$ItemTotal = (Quantity \times UnitPrice - Discount) + ItemTax$
$Subtotal = \sum (Quantity \times UnitPrice - Discount)$
$TotalTax = \sum ItemTax$
$Total = Subtotal + TotalTax$

### Finalization Workflow (Atomic)
1. Generate unique local UUID.
2. Get current active `TaxConfiguration`.
3. Get next sequential number from `Config`.
4. Save `Invoice`, `InvoiceItems`, and `Payments` to DB.
5. Call `MovementEngine.deductStock(items)` with `reason: 'SALE'`.
6. Log `AuditEntry`: `SALE_FINALIZED`.

## 4. UI Specifications

- **POS Grid**: 4x4 or 5x5 product grid with categories.
- **Sidebar Cart**: Scrollable list of items, summary footer, "Checkout" button.
- **Checkout Dialog**: Payment method selector, amount input, "Finalize" button.

## 5. Backend Sync (`admin_backend`)

- **Endpoint**: `POST /sales/sync`
- **Payload**: Array of `Invoice` aggregates (Invoices + Items + Payments).
- **Validation**: Check for duplicate numbers and ensure `tenant_id` matches user session.
