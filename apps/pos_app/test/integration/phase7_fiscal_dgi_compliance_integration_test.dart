import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/core/utils/nicaragua_fiscal_validator.dart';
import 'package:pos_app/domain/models/config/tax_regime.dart';
import 'package:pos_app/domain/models/printer/receipt_document.dart';
import 'package:pos_app/domain/models/sales/cart_item.dart';
import 'package:pos_app/domain/models/sales/invoice.dart';
import 'package:pos_app/domain/models/sales/invoice_item.dart';
import 'package:pos_app/domain/models/sales/payment.dart';
import 'package:pos_app/domain/services/printer/receipt_58mm_formatter.dart';
import 'package:pos_app/domain/services/sales/invoice_fiscal_calculator.dart';
import 'package:pos_app/domain/services/sales/tip_engine.dart';

void main() {
  group('Fase 7: Cumplimiento Fiscal y Facturación (DGI Nicaragua)', () {
    test('1. Cálculo de IVA (15%): C\$ 100.00 neto -> Total C\$ 115.00 (C\$ 100 neto + C\$ 15 pasivo)', () {
      const unitPrice = 100.00;
      const quantity = 1.0;
      const taxRate = 0.15; // Regla IVA_15

      final netSubtotal = unitPrice * quantity;
      final taxAmount = netSubtotal * taxRate;
      final totalWithTax = netSubtotal + taxAmount;

      expect(netSubtotal, equals(100.00));
      expect(taxAmount, equals(15.00));
      expect(totalWithTax, equals(115.00));

      final invoice = Invoice(
        id: 'inv-dgi-001',
        number: '001-001-01-00000010',
        subtotal: netSubtotal,
        totalTax: taxAmount,
        total: totalWithTax,
        createdAt: DateTime.now(),
        userId: 'cashier-01',
      );

      expect(invoice.subtotal, equals(100.00), reason: 'Ingresos netos reconocidos');
      expect(invoice.totalTax, equals(15.00), reason: 'Pasivo de impuestos por pagar a DGI');
      expect(invoice.total, equals(115.00), reason: 'Total a cobrar al cliente en POS');
    });

    test('2. Facturación a Contribuyentes: Validación de RUC y datos fiscales en Ticket', () {
      // Validación DGI de RUC de Persona Jurídica (J + 13 dígitos) y Persona Natural
      const rucJuridico = 'J0310000000001';
      const rucNatural = '001-120590-0001A';
      const rucInvalido = 'J03100000000A';

      expect(NicaraguaFiscalValidator.isValidRuc(rucJuridico), isTrue);
      expect(NicaraguaFiscalValidator.isValidRuc(rucNatural), isTrue);
      expect(NicaraguaFiscalValidator.isValidRuc(rucInvalido), isFalse);

      const razonSocial = 'DISTRIBUIDORA COMERCIAL S.A.';
      final cleanedRuc = NicaraguaFiscalValidator.clean(rucJuridico);

      final invoice = Invoice(
        id: 'inv-dgi-contrib-01',
        number: '001-001-01-00000011',
        subtotal: 100.00,
        totalTax: 15.00,
        total: 115.00,
        createdAt: DateTime.now(),
        userId: 'cashier-01',
        customerId: 'cust-contrib-01',
      );

      final items = [
        const InvoiceItem(
          id: 'item-1',
          invoiceId: 'inv-dgi-contrib-01',
          productId: 'prod-1',
          productName: 'Insumos de Oficina',
          quantity: 1,
          unitPrice: 100.0,
          originalTaxRate: 0.15,
          appliedTaxRate: 0.15,
          taxAmount: 15.0,
          total: 115.0,
        ),
      ];

      final payments = [
        Payment(
          id: 'pay-1',
          invoiceId: 'inv-dgi-contrib-01',
          method: PaymentMethod.cash,
          amount: 115.0,
          currency: 'NIO',
          exchangeRate: 1.0,
          amountNio: 115.0,
          changeGiven: 0.0,
          createdAt: DateTime.now(),
        ),
      ];

      final formattedTicket = Receipt58mmFormatter.formatInvoiceText(
        invoice,
        items: items,
        payments: payments,
        businessName: 'OMNIFOOD FOOD PARK',
        ruc: 'J0310000000999',
        address: 'Managua, Nicaragua',
        cashierName: 'Carlos Cajero',
      );

      expect(formattedTicket, contains('REGIMEN: GENERAL'));
      expect(formattedTicket, contains('001-001-01-00000011'));
      expect(formattedTicket, contains('IVA (15%):'));
      expect(formattedTicket, contains('C\$ 115.00'));
    });

    test('3. Manejo de Propinas (10% Servicio Voluntario): No genera IVA ni incrementa ingreso bruto operativo', () {
      const subtotalNeto = 100.00;
      const taxIva = 15.00;

      final tipCalculation = TipEngine.calculate(
        subtotalNio: subtotalNeto,
        taxNio: taxIva,
        discountNio: 0.0,
        tipType: TipType.suggestedTenPercent,
        commercialRate: 36.50,
      );

      // Verificaciones Invariante DGI INV-16.1:
      // A) Monto de la propina sugerida (10% de C$ 100) = C$ 10.00
      expect(tipCalculation.tipAmountNio, equals(10.00));

      // B) Total a cobrar al cliente con propina = C$ 100 (neto) + C$ 15 (IVA) + C$ 10 (propina) = C$ 125.00
      expect(tipCalculation.totalWithTipNio, equals(125.00));

      // C) La base imponible de IVA permanece estrictamente en C$ 15.00 (NO se grava el 15% sobre la propina)
      expect(tipCalculation.taxNio, equals(15.00));
      expect(tipCalculation.subtotalNio, equals(100.00));
    });

    test('4. Cambio Dinámico de Régimen: Misma venta produce C\$ 115.00 en Régimen General y C\$ 100.00 en Cuota Fija', () {
      const calculator = InvoiceFiscalCalculator();
      final cart = [
        const CartItem(
          productId: 'prod-100',
          productName: 'Cena Gourmet',
          quantity: 1,
          unitPrice: 100.00,
          taxRate: 0.15,
        ),
      ];

      // VENTA 1: Bajo Régimen General
      final resGeneral = calculator.calculate(
        cart: cart,
        taxRegime: TaxRegime.regimenGeneral,
      );
      expect(resGeneral.subtotal, equals(100.00));
      expect(resGeneral.totalTax, equals(15.00));
      expect(resGeneral.total, equals(115.00));

      final docGeneral = calculator.buildReceiptDocument(
        calculation: resGeneral,
        invoiceNumber: '001-001-01-00000020',
        businessName: 'OMNIFOOD RESTAURANTE',
      );
      expect(docGeneral.documentTitle, equals('FACTURA DE VENTA'));
      expect(docGeneral.regimeHeader, equals('REGIMEN: GENERAL'));
      expect(docGeneral.totalTax, equals(15.00));
      expect(docGeneral.total, equals(115.00));
      expect(docGeneral.isTaxExempt, isFalse);

      // VENTA 2: Mismo carrito, únicamente cambiando el régimen a Cuota Fija
      final resCuotaFija = calculator.calculate(
        cart: cart,
        taxRegime: TaxRegime.cuotaFija,
      );
      expect(resCuotaFija.subtotal, equals(100.00));
      expect(resCuotaFija.totalTax, equals(0.00));
      expect(resCuotaFija.total, equals(100.00));

      final docCuotaFija = calculator.buildReceiptDocument(
        calculation: resCuotaFija,
        invoiceNumber: '001-001-01-00000021',
        businessName: 'OMNIFOOD COMEDOR',
      );
      expect(docCuotaFija.documentTitle, equals('COMPROBANTE DE VENTA'));
      expect(docCuotaFija.regimeHeader, equals('REGIMEN: CUOTA FIJA'));
      expect(docCuotaFija.totalTax, equals(0.00));
      expect(docCuotaFija.total, equals(100.00));
      expect(docCuotaFija.isTaxExempt, isFalse); // Cuota Fija NO es venta exenta
      expect(docCuotaFija.fiscalNotice, contains('NO RECAUDA IVA'));
    });

    test('5. Condición fiscal de producto exento bajo Régimen General vs Cuota Fija', () {
      const calculator = InvoiceFiscalCalculator();
      final cartExempt = [
        const CartItem(
          productId: 'med-01',
          productName: 'Medicamento / Producto Exento',
          quantity: 1,
          unitPrice: 200.00,
          taxRate: 0.0, // Exento por naturaleza del producto
        ),
      ];

      // Bajo Régimen General:
      final resGeneral = calculator.calculate(
        cart: cartExempt,
        taxRegime: TaxRegime.regimenGeneral,
      );
      expect(resGeneral.subtotal, equals(200.00));
      expect(resGeneral.taxableSubtotal, equals(0.00));
      expect(resGeneral.exemptSubtotal, equals(200.00)); // Reconocido como exento
      expect(resGeneral.totalTax, equals(0.00));
      expect(resGeneral.total, equals(200.00));

      final docGeneral = calculator.buildReceiptDocument(
        calculation: resGeneral,
        invoiceNumber: '001-001-01-00000022',
      );
      expect(docGeneral.isTaxExempt, isTrue); // Marca venta exenta legítima bajo régimen general

      // Bajo Cuota Fija:
      final resCuotaFija = calculator.calculate(
        cart: cartExempt,
        taxRegime: TaxRegime.cuotaFija,
      );
      expect(resCuotaFija.subtotal, equals(200.00));
      expect(resCuotaFija.taxableSubtotal, equals(0.00));
      expect(resCuotaFija.exemptSubtotal, equals(0.00)); // En Cuota Fija no hay subtotal exento
      expect(resCuotaFija.totalTax, equals(0.00));
      expect(resCuotaFija.total, equals(200.00));

      final docCuotaFija = calculator.buildReceiptDocument(
        calculation: resCuotaFija,
        invoiceNumber: '001-001-01-00000023',
      );
      expect(docCuotaFija.isTaxExempt, isFalse); // No se confunde con venta exenta
    });

    test('6. Invariante de prorrateo exacto: 3 líneas iguales con descuento de C\$ 1.00 distribuyen exactamente C\$ 1.00', () {
      const calculator = InvoiceFiscalCalculator();
      final cart = [
        const CartItem(productId: 'c1', productName: 'Item A', quantity: 1, unitPrice: 100.00, taxRate: 0.15),
        const CartItem(productId: 'c2', productName: 'Item B', quantity: 1, unitPrice: 100.00, taxRate: 0.15),
        const CartItem(productId: 'c3', productName: 'Item C', quantity: 1, unitPrice: 100.00, taxRate: 0.15),
      ];

      final res = calculator.calculate(
        cart: cart,
        taxRegime: TaxRegime.regimenGeneral,
        totalDiscounts: 1.00,
      );

      expect(res.grossSubtotal, equals(300.00));
      expect(res.totalDiscount, equals(1.00));
      expect(res.subtotal, equals(299.00));

      // Distribution must be exactly 0.34 + 0.33 + 0.33 = 1.00
      expect(res.lines[0].discount, equals(0.34));
      expect(res.lines[1].discount, equals(0.33));
      expect(res.lines[2].discount, equals(0.33));

      final sumDiscounts = double.parse(
        res.lines.fold<double>(0.0, (acc, l) => acc + l.discount).toStringAsFixed(2),
      );
      expect(sumDiscounts, equals(1.00));
      expect(res.subtotal, equals(res.grossSubtotal - res.totalDiscount));
    });

    test('7. Configuración fiscal ausente no aplica IVA silencioso y bloquea emisión fiscal', () {
      const calculator = InvoiceFiscalCalculator();
      final cart = [
        const CartItem(productId: 'c1', productName: 'Item A', quantity: 1, unitPrice: 100.00, taxRate: 0.15),
      ];

      final res = calculator.calculate(
        cart: cart,
        taxRegime: null,
      );

      // Does NOT default to Régimen General
      expect(res.taxRegime, isNull);
      expect(res.isFiscalPolicyConfigured, isFalse);
      expect(res.totalTax, equals(0.00));
      expect(res.total, equals(100.00));

      // Block receipt emission
      expect(
        () => calculator.buildReceiptDocument(
          calculation: res,
          invoiceNumber: '001-001-01-00000024',
        ),
        throwsA(isA<FiscalConfigurationException>()),
      );
    });

    test('8. Consistencia de comprobante entre cálculo directo y reimpresión desde base de datos', () {
      const calculator = InvoiceFiscalCalculator();
      final cart = [
        const CartItem(productId: 'coffee', productName: 'Café de Especialidad', quantity: 2, unitPrice: 60.00, taxRate: 0.15),
      ];

      final calc = calculator.calculate(
        cart: cart,
        taxRegime: TaxRegime.regimenGeneral,
        totalDiscounts: 20.00,
      );

      final directDoc = calculator.buildReceiptDocument(
        calculation: calc,
        invoiceNumber: '001-001-01-00000025',
        businessName: 'OMNIFOOD RESTAURANTE',
      );

      final persistedInvoice = Invoice(
        id: 'inv-db-001',
        number: '001-001-01-00000025',
        createdAt: directDoc.date,
        userId: 'u1',
        subtotal: calc.subtotal,
        totalTax: calc.totalTax,
        total: calc.total,
        commercialRate: calc.commercialRate,
        bcnOfficialRate: calc.bcnOfficialRate,
        totalUsd: calc.totalUsd,
      );

      final persistedItems = [
        for (final l in calc.lines)
          InvoiceItem(
            id: 'it-${l.productId}',
            invoiceId: persistedInvoice.id,
            productId: l.productId,
            productName: l.productName,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            originalTaxRate: l.nominalTaxRate,
            appliedTaxRate: l.appliedTaxRate,
            taxAmount: l.taxAmount,
            total: l.lineTotal,
            discount: l.discount,
          ),
      ];

      final reprintDoc = ReceiptDocument.fromInvoice(
        persistedInvoice,
        items: persistedItems,
        payments: const [],
        businessName: 'OMNIFOOD RESTAURANTE',
        taxRegime: TaxRegime.regimenGeneral,
      );

      expect(reprintDoc.subtotal, equals(directDoc.subtotal));
      expect(reprintDoc.totalTax, equals(directDoc.totalTax));
      expect(reprintDoc.total, equals(directDoc.total));
      expect(reprintDoc.lines.first.lineSubtotal, equals(directDoc.lines.first.lineSubtotal));
      expect(reprintDoc.lines.first.lineTotal, equals(directDoc.lines.first.lineTotal));
      expect(reprintDoc.lines.first.taxAmount, equals(directDoc.lines.first.taxAmount));
    });
  });
}
