import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/adapters/printer/ipos_printer_adapter.dart';
import 'package:pos_app/domain/models/config/tax_regime.dart';
import 'package:pos_app/domain/models/sales/invoice.dart';
import 'package:pos_app/domain/models/sales/invoice_item.dart';
import 'package:pos_app/domain/models/sales/payment.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  const channel = MethodChannel('com.nhilos.pos/ipos_printer');
  late List<MethodCall> calls;
  late IPosPrinterAdapter adapter;

  setUp(() {
    calls = [];
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (call) async {
          calls.add(call);
          return call.method == 'getPrinterStatus' ? 'READY' : true;
        });
    adapter = IPosPrinterAdapter(channel: channel);
  });

  tearDown(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, null);
  });

  test('returns failure when the print transport is unavailable', () async {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (call) async {
          if (call.method == 'printRawBytes') {
            throw MissingPluginException();
          }
          return 'READY';
        });

    final result = await adapter.printRawEscPos([0x1B, 0x40]);

    expect(result.isSuccess, isFalse);
    expect(result.message, contains('no disponible'));
  });

  test(
    'skips an invalid legacy logo and still prints the receipt text',
    () async {
      final invoice = Invoice(
        id: 'invoice-invalid-logo',
        number: '001-001-01-00000000',
        createdAt: DateTime(2026, 1, 1),
        userId: 'cashier-1',
        subtotal: 10,
        totalTax: 1.5,
        total: 11.5,
      );
      final result = await adapter.printInvoice(
        invoice,
        items: const [],
        payments: const <Payment>[],
        taxRegime: TaxRegime.regimenGeneral,
        logoRasterBytes: [1, 2, 3],
      );

      expect(result.isSuccess, isTrue);
      expect(calls.any((call) => call.method == 'printBitmap'), isFalse);
      expect(calls.any((call) => call.method == 'printText'), isTrue);
    },
  );

  test(
    'skips a logo larger than the native bitmap safety limit and still prints the receipt text',
    () async {
      final invoice = Invoice(
        id: 'invoice-1',
        number: '001-001-01-00000001',
        createdAt: DateTime(2026, 1, 1),
        userId: 'cashier-1',
        subtotal: 10,
        totalTax: 1.5,
        total: 11.5,
      );
      final items = [
        InvoiceItem(
          id: 'item-1',
          invoiceId: invoice.id,
          productId: 'product-1',
          productName: 'Cafe',
          quantity: 1,
          unitPrice: 10,
          originalTaxRate: 0.15,
          appliedTaxRate: 0.15,
          taxAmount: 1.5,
          total: 11.5,
        ),
      ];

      final result = await adapter.printInvoice(
        invoice,
        items: items,
        payments: const <Payment>[],
        taxRegime: TaxRegime.regimenGeneral,
        logoRasterBytes: List<int>.filled(
          IPosPrinterAdapter.maxLogoBytes + 1,
          0,
        ),
      );

      expect(result.isSuccess, isTrue);
      expect(calls.any((call) => call.method == 'printBitmap'), isFalse);
      expect(calls.any((call) => call.method == 'printText'), isTrue);
    },
  );

}
