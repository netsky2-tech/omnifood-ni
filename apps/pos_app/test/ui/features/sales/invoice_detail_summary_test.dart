import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/models/inventory/product.dart';
import 'package:pos_app/domain/models/sales/invoice.dart';
import 'package:pos_app/domain/models/sales/invoice_item.dart';
import 'package:pos_app/ui/features/sales/sales_history_view.dart';

Invoice _invoice({
  double total = 13.75,
  double? tip,
  InvoiceType type = InvoiceType.regular,
}) =>
    Invoice(
      id: 'inv-1',
      number: '001-001-01-00000041',
      createdAt: DateTime(2026, 10, 10),
      userId: 'u-1',
      subtotal: total,
      totalTax: 0,
      total: total,
      paymentStatus: PaymentStatus.paid,
      syncStatus: SyncStatus.synced,
      type: type,
      tipAmountNio: tip,
    );

InvoiceItem _item({
  double quantity = 1,
  double unitPrice = 125,
  double total = 13.75,
  List<Modifier> modifiers = const [],
  Map<String, double>? discountOrigin,
}) =>
    InvoiceItem(
      id: 'item-1',
      invoiceId: 'inv-1',
      productId: 'p-1',
      productName: 'Cappuccino 12oz',
      quantity: quantity,
      unitPrice: unitPrice,
      originalTaxRate: 0,
      appliedTaxRate: 0,
      taxAmount: 0,
      total: total,
      selectedModifiers: modifiers,
      discountOrigin: discountOrigin,
    );

/// Round-2 §17.4: the S23 round measured that the detail's summary could not
/// be reconciled with the line prices — the discounts were invisible. The
/// summary is now rebuilt from the persisted lines; these tests pin both
/// real invoices of the round.
void main() {
  group('buildInvoiceDetailSummary (round-2 §17.4)', () {
    test('the sale identity holds: gross - discounts == total', () {
      final totals = buildInvoiceDetailSummary(
        _invoice(total: 13.75),
        [
          _item(discountOrigin: const {'promotion': 31.25, 'loyalty': 80}),
        ],
      );

      expect(totals.base, 125);
      expect(totals.promotion, 31.25);
      expect(totals.loyalty, 80);
      expect(totals.manual, 0);
      expect(
        totals.base - totals.promotion - totals.manual - totals.loyalty,
        13.75,
        reason: 'S23 invoice 41: 125 - 31.25 promotion - 80 loyalty = 13.75',
      );
    });

    test('the extras are part of the gross base', () {
      final totals = buildInvoiceDetailSummary(
        _invoice(total: 40),
        [
          _item(
            quantity: 2,
            total: 40,
            modifiers: const [
              Modifier(
                id: 'm-1',
                name: 'Extra shot',
                extraPrice: 15,
                quantity: 2,
              ),
              Modifier(id: 'm-2', name: 'Leche: Entera', extraPrice: 0),
            ],
            discountOrigin: const {
              'manual': 40,
              'loyalty': 80,
              'promotion': 150,
            },
          ),
        ],
      );

      expect(
        totals.base,
        310,
        reason: 'S23 invoice 36: 2 x 125 base + 15 x 2 per unit x 2 units',
      );
      expect(
        totals.base - totals.manual - totals.loyalty - totals.promotion,
        40,
        reason: 'invoice 36 of the S23 round closes at exactly C\$40',
      );
    });

    test('a credit note bases on the net it reverses, never on a gross', () {
      final totals = buildInvoiceDetailSummary(
        _invoice(total: -13.75, type: InvoiceType.creditNote),
        [_item(quantity: -1, total: -13.75)],
      );

      expect(
        totals.base,
        -13.75,
        reason: 'the note reverses the net; showing the gross -125 is what '
            'left Subtotal and TOTAL unreconcilable (F-8c)',
      );
      expect(totals.promotion, 0);
    });

    test('the tip is reported so the summary can add it back', () {
      final totals = buildInvoiceDetailSummary(
        _invoice(total: 125, tip: 10),
        [_item(total: 125)],
      );

      expect(totals.tip, 10);
      expect(totals.base, 125);
    });

    test('a sale with no discounts keeps subtotal == total', () {
      final totals = buildInvoiceDetailSummary(
        _invoice(total: 100),
        [_item(unitPrice: 100, total: 100)],
      );

      expect(totals.base, 100);
      expect(totals.promotion, 0);
      expect(totals.manual, 0);
      expect(totals.loyalty, 0);
    });
  });
}
