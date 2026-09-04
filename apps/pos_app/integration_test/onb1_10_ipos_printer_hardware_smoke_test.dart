import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:pos_app/data/adapters/printer/ipos_printer_adapter.dart';
import 'package:pos_app/domain/models/sales/invoice.dart';
import 'package:pos_app/domain/models/sales/invoice_item.dart';
import 'package:pos_app/domain/models/sales/payment.dart';
import 'package:pos_app/domain/ports/printer_port.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('ONB1.10 prints through the real Q80 Nyx printer service', (
    WidgetTester tester,
  ) async {
    final printer = IPosPrinterAdapter();
    final status = await printer.checkStatus();

    expect(
      printer.isHardwareDetected,
      isTrue,
      reason: 'The iPOS MethodChannel/native handler was not detected.',
    );
    expect(
      status,
      PrinterStatus.ready,
      reason: 'The attached Nyx printer service must report READY.',
    );

    final timestamp = DateTime.now().toUtc();
    final marker = 'ONB1.10-Q80-${timestamp.millisecondsSinceEpoch}';
    final invoice = Invoice(
      id: marker,
      number: marker,
      createdAt: timestamp,
      userId: 'attached-device-smoke',
      subtotal: 1,
      totalTax: 0,
      total: 1,
      paymentStatus: PaymentStatus.paid,
      terminalId: 'Q802024120001',
    );
    final result = await printer.printInvoice(
      invoice,
      items: [
        InvoiceItem(
          id: '$marker-item',
          invoiceId: marker,
          productId: 'onb1.10-hardware-smoke',
          productName: 'PRUEBA FISICA IMPRESORA Q80',
          quantity: 1,
          unitPrice: 1,
          originalTaxRate: 0,
          appliedTaxRate: 0,
          taxAmount: 0,
          total: 1,
        ),
      ],
      payments: [
        Payment(
          id: '$marker-payment',
          invoiceId: marker,
          method: PaymentMethod.cash,
          amount: 1,
          amountNio: 1,
        ),
      ],
      businessName: 'OMNIFOOD ONB1.10 HARDWARE SMOKE',
      cashierName: 'ATTACHED DEVICE TEST',
      paperWidthMm: 58,
    );

    expect(
      result.isSuccess,
      isTrue,
      reason: result.message ?? 'Nyx print command failed without a message.',
    );
    expect(result.printedText, contains(marker));
    // ignore: avoid_print
    print('ONB1.10_HARDWARE_PRINT_ACCEPTED marker=$marker status=${result.status.name}');
  });
}
