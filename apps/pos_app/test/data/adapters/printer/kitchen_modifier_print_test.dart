import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/adapters/printer/mock_printer_adapter.dart';
import 'package:pos_app/domain/models/inventory/product.dart';
import 'package:pos_app/domain/models/sales/invoice_item.dart';

void main() {
  late MockPrinterAdapter adapter;

  setUp(() {
    adapter = MockPrinterAdapter();
  });

  test('the kitchen ticket prints one [MOD] <qty>x <name> line per modifier, without money', () async {
    final result = await adapter.printKitchenOrder(
      ticketId: 'tk-1',
      orderTitle: 'ORD-1',
      cashierName: 'Cajero',
      timestamp: DateTime(2026, 10, 1, 12, 30),
      items: [
        InvoiceItem(
          id: 'item-1',
          invoiceId: 'inv-1',
          productId: 'p-1',
          productName: 'Capuccino',
          quantity: 1,
          unitPrice: 60,
          originalTaxRate: 0.15,
          appliedTaxRate: 0.15,
          taxAmount: 9,
          total: 69,
          selectedModifiers: const [
            Modifier(id: 'm-1', name: 'Extra Shot', extraPrice: 15, quantity: 2),
            Modifier(id: 'm-2', name: 'Sin Azúcar', extraPrice: 0, quantity: 1),
          ],
        ),
      ],
    );

    expect(result.isSuccess, true);
    // The headline format, exact.
    expect(adapter.lastPrintedText, contains('[MOD] 2x Extra Shot'));
    expect(adapter.lastPrintedText, contains('[MOD] 1x Sin Azúcar'));
    // The kitchen never needs money on modifier lines.
    expect(adapter.lastPrintedText, isNot(contains('[MOD] 2x Extra Shot (')));
  });
}
