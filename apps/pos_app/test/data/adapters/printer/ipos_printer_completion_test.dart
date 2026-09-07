import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/adapters/printer/ipos_printer_adapter.dart';
import 'package:pos_app/domain/models/config/tax_regime.dart';
import 'package:pos_app/domain/models/printer/receipt_document.dart';
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
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(channel, (call) async {
      calls.add(call);
      if (call.method == 'getPrinterStatus') return 'READY';
      return true;
    });
    adapter = IPosPrinterAdapter(channel: channel);
  });
  tearDown(() => TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(channel, null));

  test('prefers text when a production label has both raw and text forms', () async {
    final result = await adapter.printProductionBatchLabel(productName: 'Café', batchCode: 'L-1', quantity: 1, uom: 'kg', productionDate: DateTime(2026), expirationDate: DateTime(2026, 2));
    expect(result.isSuccess, isTrue);
    expect(calls.where((call) => call.method == 'printText'), hasLength(1));
    expect(calls.where((call) => call.method == 'printRawBytes'), isEmpty);
  });

  test('rejected raw transport returns failure without false success', () async {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(channel, (call) async {
      if (call.method == 'printRawBytes') throw PlatformException(code: 'REJECTED', message: 'no raw');
      return 'READY';
    });
    final result = await adapter.printRawEscPos([0x1b, 0x40]);
    expect(result.isSuccess, isFalse);
  });

  test('invalid logo continues with text and a PNG bitmap invokes the bitmap channel', () async {
    final invoice = Invoice(id: 'i', number: '1', createdAt: DateTime(2026), userId: 'u', subtotal: 1, totalTax: 0, total: 1);
    final item = InvoiceItem(id: 'x', invoiceId: 'i', productId: 'p', productName: 'Café', quantity: 1, unitPrice: 1, originalTaxRate: 0, appliedTaxRate: 0, taxAmount: 0, total: 1);
    final invalid = await adapter.printInvoice(invoice, items: [item], payments: const <Payment>[], taxRegime: TaxRegime.regimenGeneral, logoRasterBytes: [1, 2]);
    expect(invalid.isSuccess, isTrue);
    expect(calls.any((call) => call.method == 'printText'), isTrue);
    calls.clear();
    final validDoc = ReceiptDocument(businessName: 'Prueba', taxRegime: TaxRegime.regimenGeneral, documentTitle: 'FACTURA', documentNumber: '1', date: DateTime(2026), lines: const [], subtotal: 0, totalTax: 0, total: 0, totalUsd: 0, logoRasterBytes: const [137, 80, 78, 71, 13, 10, 26, 10]);
    await adapter.printReceiptDocument(validDoc);
    expect(calls.any((call) => call.method == 'printBitmap'), isTrue);
  });

  test('paper width selects logical 32/48 layout without hardware width call', () async {
    final invoice = Invoice(id: 'i', number: '1', createdAt: DateTime(2026), userId: 'u', subtotal: 1, totalTax: 0, total: 1);
    final item = InvoiceItem(id: 'x', invoiceId: 'i', productId: 'p', productName: 'Café', quantity: 1, unitPrice: 1, originalTaxRate: 0, appliedTaxRate: 0, taxAmount: 0, total: 1);
    final narrow = await adapter.printInvoice(invoice, items: [item], payments: const <Payment>[], taxRegime: TaxRegime.regimenGeneral, paperWidthMm: 58);
    final wide = await adapter.printInvoice(invoice, items: [item], payments: const <Payment>[], taxRegime: TaxRegime.regimenGeneral, paperWidthMm: 80);
    expect(narrow.printedText!.split('\n').every((line) => line.length <= 32), isTrue);
    expect(wide.printedText!.split('\n').every((line) => line.length <= 48), isTrue);
    expect(calls.any((call) => call.method.toLowerCase().contains('paperwidth')), isFalse);
  });
}
