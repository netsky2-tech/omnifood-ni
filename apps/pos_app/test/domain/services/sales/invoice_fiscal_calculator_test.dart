import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/models/config/tax_regime.dart';
import 'package:pos_app/domain/models/sales/cart_item.dart';
import 'package:pos_app/domain/services/sales/invoice_fiscal_calculator.dart';

void main() {
  const calculator = InvoiceFiscalCalculator();

  group('InvoiceFiscalCalculator - Fiscal Rules & DGI Compliance', () {
    test('Cuota Fija regression test: 1 Latte @ 110.00 produces total = 110.00, tax = 0.00, never 126.50', () {
      final cart = [
        const CartItem(
          productId: 'latte-01',
          productName: 'Café Latte',
          quantity: 1,
          unitPrice: 110.00,
          taxRate: 0.15, // Nominal rate on product definition
        ),
      ];

      final result = calculator.calculate(
        cart: cart,
        taxRegime: TaxRegime.cuotaFija,
      );

      expect(result.taxRegime, TaxRegime.cuotaFija);
      expect(result.subtotal, equals(110.00));
      expect(result.totalTax, equals(0.00));
      expect(result.total, equals(110.00));
      expect(result.lines.first.lineTotal, equals(110.00));
      expect(result.lines.first.taxAmount, equals(0.00));
      expect(result.lines.first.appliedTaxRate, equals(0.00));

      final doc = calculator.buildReceiptDocument(
        calculation: result,
        invoiceNumber: '001-001-01-00000100',
        businessName: 'Mi Café Cuota Fija',
        businessRuc: 'J0310000000001',
        businessAddress: 'Mercado Roberto Huembes',
        cashierName: 'Juan Pérez',
        cashGivenNio: 110.00,
      );

      expect(doc.regimeHeader, equals('REGIMEN: CUOTA FIJA'));
      expect(doc.documentTitle, equals('COMPROBANTE DE VENTA'));
      expect(doc.isCuotaFija, isTrue);
      expect(doc.fiscalNotice, contains('NO RECAUDA IVA'));
      expect(doc.subtotal, equals(110.00));
      expect(doc.totalTax, equals(0.00));
      expect(doc.total, equals(110.00));
      expect(doc.lines.first.lineTotal, equals(110.00));
    });

    test('Régimen General test: 1 Espresso @ 50.00 produces taxableBase = 50.00, taxAmount = 7.50, total = 57.50', () {
      final cart = [
        const CartItem(
          productId: 'esp-01',
          productName: 'Café Espresso',
          quantity: 1,
          unitPrice: 50.00,
          taxRate: 0.15,
        ),
      ];

      final result = calculator.calculate(
        cart: cart,
        taxRegime: TaxRegime.regimenGeneral,
      );

      expect(result.taxRegime, TaxRegime.regimenGeneral);
      expect(result.subtotal, equals(50.00));
      expect(result.taxableSubtotal, equals(50.00));
      expect(result.exemptSubtotal, equals(0.00));
      expect(result.totalTax, equals(7.50));
      expect(result.total, equals(57.50));
      expect(result.lines.first.lineTotal, equals(50.00));
      expect(result.lines.first.taxAmount, equals(7.50));
      expect(result.lines.first.appliedTaxRate, equals(0.15));

      final doc = calculator.buildReceiptDocument(
        calculation: result,
        invoiceNumber: '001-001-01-00000101',
        businessName: 'Café Gourmet S.A.',
        businessRuc: 'J0310000000002',
        businessAddress: 'Plaza Mayor',
        cashierName: 'María López',
        cashGivenNio: 60.00,
      );

      expect(doc.regimeHeader, equals('REGIMEN: GENERAL'));
      expect(doc.documentTitle, equals('FACTURA DE VENTA'));
      expect(doc.isCuotaFija, isFalse);
      expect(doc.subtotal, equals(50.00));
      expect(doc.totalTax, equals(7.50));
      expect(doc.total, equals(57.50));
      expect(doc.changeGiven, equals(2.50));
    });

    test('DGI Classification Toggle: identical product list switches total from 115.00 to 100.00 based strictly on regime', () {
      final cart = [
        const CartItem(
          productId: 'p1',
          productName: 'Almuerzo Ejecutivo',
          quantity: 1,
          unitPrice: 100.00,
          taxRate: 0.15,
        ),
      ];

      final generalResult = calculator.calculate(
        cart: cart,
        taxRegime: TaxRegime.regimenGeneral,
      );
      expect(generalResult.subtotal, equals(100.00));
      expect(generalResult.totalTax, equals(15.00));
      expect(generalResult.total, equals(115.00));

      final cuotaFijaResult = calculator.calculate(
        cart: cart,
        taxRegime: TaxRegime.cuotaFija,
      );
      expect(cuotaFijaResult.subtotal, equals(100.00));
      expect(cuotaFijaResult.totalTax, equals(0.00));
      expect(cuotaFijaResult.total, equals(100.00));
    });

    test('Régimen General with mixed taxable and exempt products', () {
      final cart = [
        const CartItem(
          productId: 'prod-taxable',
          productName: 'Gaseosa',
          quantity: 2,
          unitPrice: 30.00,
          taxRate: 0.15, // 60.00 taxable -> 9.00 IVA
        ),
        const CartItem(
          productId: 'prod-exempt',
          productName: 'Pan Casero',
          quantity: 1,
          unitPrice: 40.00,
          taxRate: 0.0, // Exempt item
        ),
      ];

      final result = calculator.calculate(
        cart: cart,
        taxRegime: TaxRegime.regimenGeneral,
      );

      expect(result.subtotal, equals(100.00));
      expect(result.taxableSubtotal, equals(60.00));
      expect(result.exemptSubtotal, equals(40.00));
      expect(result.totalTax, equals(9.00));
      expect(result.total, equals(109.00));
    });

    test('Global tax exemption override under Régimen General (e.g. Feria sin IVA)', () {
      final cart = [
        const CartItem(
          productId: 'prod-1',
          productName: 'Artículo Promocional',
          quantity: 1,
          unitPrice: 200.00,
          taxRate: 0.15,
        ),
      ];

      final result = calculator.calculate(
        cart: cart,
        taxRegime: TaxRegime.regimenGeneral,
        isGlobalTaxExempt: true,
      );

      expect(result.subtotal, equals(200.00));
      expect(result.taxableSubtotal, equals(0.00));
      expect(result.exemptSubtotal, equals(200.00));
      expect(result.totalTax, equals(0.00));
      expect(result.total, equals(200.00));

      final doc = calculator.buildReceiptDocument(
        calculation: result,
        invoiceNumber: '001-001-01-00000102',
        businessName: 'Feria sin IVA',
      );
      expect(doc.isGlobalTaxExempt, isTrue);
    });

    test('Proportional discount distributes across items correctly', () {
      final cart = [
        const CartItem(
          productId: 'prod-1',
          productName: 'Item 1',
          quantity: 1,
          unitPrice: 100.00,
          taxRate: 0.15,
        ),
        const CartItem(
          productId: 'prod-2',
          productName: 'Item 2',
          quantity: 1,
          unitPrice: 100.00,
          taxRate: 0.15,
        ),
      ];

      final result = calculator.calculate(
        cart: cart,
        taxRegime: TaxRegime.regimenGeneral,
        totalDiscounts: 20.00,
      );

      expect(result.grossSubtotal, equals(200.00));
      expect(result.totalDiscount, equals(20.00));
      expect(result.subtotal, equals(180.00));
      expect(result.lines[0].taxableBase, equals(90.00));
      expect(result.lines[0].taxAmount, equals(13.50));
      expect(result.lines[1].taxableBase, equals(90.00));
      expect(result.lines[1].taxAmount, equals(13.50));
      expect(result.totalTax, equals(27.00));
      expect(result.total, equals(207.00));
    });
  });
}
