import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/models/inventory/product.dart';
import 'package:pos_app/domain/models/sales/cashier_session.dart';
import 'package:pos_app/domain/models/sales/invoice.dart';
import 'package:pos_app/domain/models/sales/invoice_item.dart';
import 'package:pos_app/domain/models/sales/payment.dart';
import 'package:pos_app/domain/services/printer/esc_pos_builder.dart';
import 'package:pos_app/domain/services/printer/receipt_58mm_formatter.dart';

void main() {
  group('EscPosBuilder Tests', () {
    test('generates standard ESC/POS bytes for init, formatting, drawer kick, and cut', () {
      final builder = EscPosBuilder();
      builder
          .align(EscPosAlign.center)
          .bold(true)
          .textLine('TITLE')
          .bold(false)
          .align(EscPosAlign.left)
          .textLine('ITEM 1')
          .kickDrawer()
          .cut();

      final bytes = builder.toBytes();

      // Starts with ESC @ (0x1B, 0x40)
      expect(bytes.sublist(0, 2), [0x1B, 0x40]);
      // Contains ESC a 1 (center)
      expect(bytes, containsAllInOrder([0x1B, 0x61, 1]));
      // Contains ESC E 1 (bold on)
      expect(bytes, containsAllInOrder([0x1B, 0x45, 1]));
      // Contains ESC p 0 25 250 (kick drawer)
      expect(bytes, containsAllInOrder([0x1B, 0x70, 0x00, 0x19, 0xFA]));
      // Contains GS V B 0 (cut)
      expect(bytes, containsAllInOrder([0x1D, 0x56, 0x42, 0x00]));
    });
  });

  group('Receipt58mmFormatter Utilities Tests', () {
    test('center() returns exact 32 character padded string', () {
      final centered = Receipt58mmFormatter.center('OMNIFOOD NI');
      expect(centered.length, 32);
      expect(centered.trim(), 'OMNIFOOD NI');
    });

    test('twoColumns() fits exactly in 32 columns and protects right value', () {
      final line = Receipt58mmFormatter.twoColumns('Café Especial de la Casa', 'C\$ 150.00');
      expect(line.length, 32);
      expect(line.endsWith('C\$ 150.00'), isTrue);
    });

    test('divider() produces exact 32-character separator', () {
      expect(Receipt58mmFormatter.divider('=').length, 32);
      expect(Receipt58mmFormatter.divider('-').length, 32);
    });

    test('wrap() breaks long text into chunks of <= 32 characters', () {
      const longText = 'Restaurante y Café OmniFood Managua Plaza Mayor Módulo 14';
      final lines = Receipt58mmFormatter.wrap(longText, 32);
      for (final line in lines) {
        expect(line.length, lessThanOrEqualTo(32));
      }
    });
  });

  group('DGI Invoice 58mm Formatter Tests (DT 09-2007)', () {
    final testInvoice = Invoice(
      id: 'inv-12345',
      number: '001-001-01-00004521',
      createdAt: DateTime(2026, 8, 26, 14, 30),
      userId: 'cashier-1',
      subtotal: 300.00,
      totalTax: 45.00,
      total: 345.00,
      bcnOfficialRate: 36.6241,
      commercialRate: 36.50,
      totalUsd: 9.45,
      terminalId: 'POS-SUNMI-01',
      customerId: 'J0310000123456',
    );

    final testItems = [
      InvoiceItem(
        id: 'item-1',
        invoiceId: 'inv-12345',
        productId: 'prod-1',
        productName: 'Hamburguesa Doble Queso',
        quantity: 1,
        unitPrice: 200.00,
        originalTaxRate: 0.15,
        appliedTaxRate: 0.15,
        taxAmount: 30.00,
        total: 230.00,
        selectedModifiers: [
          const Modifier(id: 'mod-1', name: 'Extra Tocino', extraPrice: 30.0),
        ],
      ),
      InvoiceItem(
        id: 'item-2',
        invoiceId: 'inv-12345',
        productId: 'prod-2',
        productName: 'Jugo Natural de Naranja',
        quantity: 1,
        unitPrice: 100.00,
        originalTaxRate: 0.15,
        appliedTaxRate: 0.15,
        taxAmount: 15.00,
        total: 115.00,
      ),
    ];

    final testPayments = [
      const Payment(
        id: 'pay-1',
        invoiceId: 'inv-12345',
        method: PaymentMethod.cash,
        amount: 20.00,
        currency: 'USD',
        changeGiven: 13.70,
        changeCurrency: 'USD',
      ),
      const Payment(
        id: 'pay-2',
        invoiceId: 'inv-12345',
        method: PaymentMethod.card,
        amount: 115.00,
        bankPos: 'BAC',
        cardBrand: 'VISA',
        voucherCode: 'AUTH9876',
        last4: '4321',
      ),
    ];

    test('formatInvoiceText formats complete DGI ticket and every line is <= 32 chars', () {
      final receipt = Receipt58mmFormatter.formatInvoiceText(
        testInvoice,
        items: testItems,
        payments: testPayments,
        businessName: 'OMNIFOOD NICARAGUA S.A.',
        ruc: 'J0310000000001',
        address: 'Costado Sur Plaza Centro Managua',
        phone: '2270-0000',
        cashierName: 'Juan Perez',
      );

      final lines = receipt.split('\n');
      for (final line in lines) {
        // Strip trailing \r if any
        final cleanLine = line.replaceAll('\r', '');
        expect(
          cleanLine.length,
          lessThanOrEqualTo(32),
          reason: 'Line exceeds 32 chars: "$cleanLine" (length ${cleanLine.length})',
        );
      }

      expect(receipt, contains('OMNIFOOD NICARAGUA S.A.'));
      expect(receipt, contains('RUC: J0310000000001'));
      expect(receipt, contains('No: 001-001-01-00004521'));
      expect(receipt, contains('TC Oficial BCN:'));
      expect(receipt, contains('36.6241'));
      expect(receipt, contains('SUBTOTAL:'));
      expect(receipt, contains('IVA (15%):'));
      expect(receipt, contains('TOTAL C\$:'));
      expect(receipt, contains('TOTAL USD (\$):'));
      expect(receipt, contains('Efectivo USD:'));
      expect(receipt, contains('VISA (BAC):'));
      expect(receipt, contains('AUTH9876'));
      expect(receipt, contains('Disposicion Tecnica 09-2007'));
    });

    test('formatInvoiceEscPos generates non-empty ESC/POS bytecode', () {
      final bytes = Receipt58mmFormatter.formatInvoiceEscPos(
        testInvoice,
        items: testItems,
        payments: testPayments,
        businessName: 'OMNIFOOD NI',
        ruc: 'J0310000000001',
        cashierName: 'Juan Perez',
      );

      expect(bytes, isNotEmpty);
      expect(bytes.first, 0x1B); // ESC
    });
  });

  group('Kitchen Order 58mm Formatter Tests', () {
    final testItems = [
      InvoiceItem(
        id: 'item-1',
        invoiceId: 'inv-1',
        productId: 'prod-1',
        productName: 'Tacos de Birria',
        quantity: 2,
        unitPrice: 120.0,
        originalTaxRate: 0.0,
        appliedTaxRate: 0.0,
        taxAmount: 0.0,
        total: 240.0,
        selectedModifiers: [
          const Modifier(id: 'm1', name: 'Sin Cilantro', extraPrice: 0.0),
        ],
        notes: 'Bien dorados por favor',
      ),
    ];

    test('formatKitchenOrderText with buzzer generates clear 32-column ticket without overflow', () {
      final ticket = Receipt58mmFormatter.formatKitchenOrderText(
        ticketId: 'TK-042',
        orderTitle: 'Orden #42',
        cashierName: 'Maria Cajera',
        timestamp: DateTime(2026, 8, 26, 12, 15, 30),
        items: testItems,
        notes: 'Cliente con prisa',
        buzzerNumber: 15,
      );

      final lines = ticket.split('\n');
      for (final line in lines) {
        final cleanLine = line.replaceAll('\r', '');
        expect(
          cleanLine.length,
          lessThanOrEqualTo(32),
          reason: 'Line exceeds 32 chars: "$cleanLine"',
        );
      }

      expect(ticket, contains('BUZZER / PAGER #15'));
      expect(ticket, contains('2 x Tacos de Birria'));
      expect(ticket, contains('* [MOD] Sin Cilantro'));
      expect(ticket, contains('* [NOTA] Bien dorados'));
      expect(ticket, contains('NOTAS GENERALES:'));
    });

    test('formatKitchenOrderText with table name generates clear ticket', () {
      final ticket = Receipt58mmFormatter.formatKitchenOrderText(
        ticketId: 'TK-043',
        orderTitle: 'Orden Terraza',
        cashierName: 'Mesero Carlos',
        timestamp: DateTime(2026, 8, 26, 12, 20),
        items: testItems,
        tableName: 'Mesa 4',
      );

      expect(ticket, contains('MESA: Mesa 4'));
    });
  });

  group('Cash Drawer Audits 58mm Formatter Tests (Corte X & Corte Z)', () {
    final session = CashierSession(
      id: 'session-01',
      userId: 'user-01',
      terminalId: 'SUNMI-V2S-01',
      openedAt: DateTime(2026, 8, 26, 8, 0),
      closedAt: DateTime(2026, 8, 26, 16, 0),
      openingBalanceNio: 1000.0,
      openingBalanceUsd: 50.0,
      expectedNio: 6500.0,
      closingCountedNio: 6550.0,
      differenceNio: 50.0,
      zReportSequence: 12,
    );

    final totalsByMethod = {
      PaymentMethod.cash: 4000.0,
      PaymentMethod.card: 1200.0,
      PaymentMethod.qr: 300.0,
    };

    test('formatCorteXText generates partial audit with all lines <= 32 cols', () {
      final corteX = Receipt58mmFormatter.formatCorteXText(
        session,
        cashierName: 'Pedro Gomez',
        totalsByMethod: totalsByMethod,
      );

      final lines = corteX.split('\n');
      for (final line in lines) {
        final cleanLine = line.replaceAll('\r', '');
        expect(cleanLine.length, lessThanOrEqualTo(32));
      }

      expect(corteX, contains('CORTE X (PARCIAL)'));
      expect(corteX, contains('FONDO APERTURA NIO:'));
      expect(corteX, contains('TOTAL VENTAS:'));
      expect(corteX, contains('DOCUMENTO NO FISCAL'));
    });

    test('formatCorteZText generates end of shift audit with variance and all lines <= 32 cols', () {
      final corteZ = Receipt58mmFormatter.formatCorteZText(
        session,
        cashierName: 'Pedro Gomez',
        totalsByMethod: totalsByMethod,
        zSequence: 12,
      );

      final lines = corteZ.split('\n');
      for (final line in lines) {
        final cleanLine = line.replaceAll('\r', '');
        expect(cleanLine.length, lessThanOrEqualTo(32));
      }

      expect(corteZ, contains('CORTE Z (CIERRE DE CAJA)'));
      expect(corteZ, contains('#0012'));
      expect(corteZ, contains('TOTAL ESPERADO:'));
      expect(corteZ, contains('TOTAL CONTADO:'));
      expect(corteZ, contains('DIFERENCIA (VAR):'));
      expect(corteZ, contains('SOBRANTE'));
      expect(corteZ, contains('Disposicion Tecnica 09-2007'));
    });
  });
}
