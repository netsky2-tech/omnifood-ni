import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/models/inventory/product.dart';
import 'package:pos_app/domain/models/printer/receipt_document.dart';
import 'package:pos_app/domain/models/sales/invoice_item.dart';
import 'package:pos_app/domain/models/config/tax_regime.dart';
import 'package:pos_app/domain/services/printer/kitchen_modifier_lines.dart';

InvoiceItem invoiceItem({
  double quantity = 2,
  List<Modifier> modifiers = const [],
}) =>
    InvoiceItem(
      id: 'item-1',
      invoiceId: 'inv-1',
      productId: 'p-1',
      productName: 'Capuccino',
      quantity: quantity,
      unitPrice: 100,
      originalTaxRate: 0.15,
      appliedTaxRate: 0.15,
      taxAmount: 0,
      total: 0,
      selectedModifiers: modifiers,
    );

void main() {
  group('Modifier quantity in receipts and kitchen lines (T3.3)', () {
    test('fromInvoiceItem computes per-unit × modifier quantity × line quantity', () {
      final line = ReceiptLine.fromInvoiceItem(
        invoiceItem(
          quantity: 2,
          modifiers: [
            const Modifier(id: 'm-1', name: 'Extra Shot', extraPrice: 15, quantity: 2),
          ],
        ),
        taxRegime: TaxRegime.cuotaFija,
      );

      // (15 per unit × 2 shots) × 2 products = 60 on top of 100 × 2.
      // gross = 100×2 + 60 = 260.
      expect(line.grossAmount, 260.0);
      // The display keeps the PER-UNIT amount with the 'por unidad' scope.
      expect(line.modifierDisplays.first.quantity, 2);
      expect(line.modifierDisplays.first.displayAmount, 'C\$ 15.00');
    });

    test('legacy modifier without quantity totals exactly as before', () {
      final legacyItem = InvoiceItem(
        id: 'item-1',
        invoiceId: 'inv-1',
        productId: 'p-1',
        productName: 'Capuccino',
        quantity: 2,
        unitPrice: 100,
        originalTaxRate: 0.15,
        appliedTaxRate: 0.15,
        taxAmount: 0,
        total: 0,
        selectedModifiers: const [
          // Old persisted payload: no quantity key at all.
          Modifier(id: 'm-1', name: 'Extra Shot', extraPrice: 15),
        ],
      );

      final line = ReceiptLine.fromInvoiceItem(legacyItem, taxRegime: TaxRegime.cuotaFija);
      // 15 × 1 × 2 products = 30, identical to the pre-quantity build
      // (gross = 100×2 + 30 = 230).
      expect(line.grossAmount, 230.0);
      expect(line.modifierDisplays.first.quantity, 1);
    });

    test('the modifier display renders the quantity on the NAME when it is above one', () {
      final doubled = ReceiptModifierDisplay(
        name: 'Extra Shot',
        quantity: 2,
        displayAmount: 'C\$ 15.00',
        scope: 'por unidad',
      );
      expect(doubled.printableText, '2x Extra Shot (por unidad: C\$ 15.00)');

      final single = ReceiptModifierDisplay(
        name: 'Extra Shot',
        quantity: 1,
        displayAmount: 'C\$ 15.00',
        scope: 'por unidad',
      );
      expect(single.printableText, 'Extra Shot (por unidad: C\$ 15.00)');
    });

    test('the kitchen helper emits the exact [MOD] <qty>x <name> format, no money', () {
      final lines = KitchenModifierLines.forItem(
        invoiceItem(
          quantity: 1,
          modifiers: [
            const Modifier(id: 'm-1', name: 'Extra Shot', extraPrice: 15, quantity: 2),
            const Modifier(id: 'm-2', name: 'Sin Azúcar', extraPrice: 0, quantity: 1),
          ],
        ),
      );

      expect(lines, ['[MOD] 2x Extra Shot', '[MOD] 1x Sin Azúcar']);
    });
  });
}
