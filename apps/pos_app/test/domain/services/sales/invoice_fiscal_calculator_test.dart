import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/models/config/tax_regime.dart';
import 'package:pos_app/domain/models/inventory/product.dart';
import 'package:pos_app/domain/models/printer/receipt_document.dart';
import 'package:pos_app/domain/models/sales/cart_item.dart';
import 'package:pos_app/domain/models/sales/invoice.dart';
import 'package:pos_app/domain/models/sales/invoice_item.dart';
import 'package:pos_app/domain/services/printer/receipt_layout_formatter.dart';
import 'package:pos_app/domain/services/sales/invoice_fiscal_calculator.dart';

void main() {
  const calculator = InvoiceFiscalCalculator();

  group('InvoiceFiscalCalculator - Fiscal Rules & DGI Compliance', () {
    // -------------------------------------------------------------------------
    // TEST DE REGRESIÓN CRÍTICO -- C$ 110.00 (CUOTA FIJA)
    // -------------------------------------------------------------------------
    test('Cuota Fija regression test: 1 Latte @ 110.00 produces total = 110.00, tax = 0.00, never 126.50', () {
      final cart = [
        const CartItem(
          productId: 'latte-01',
          productName: 'Café Latte 12oz',
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
      expect(result.taxableSubtotal, equals(0.00));
      expect(result.exemptSubtotal, equals(0.00)); // Cuota Fija is NOT venta exenta
      expect(result.totalTax, equals(0.00));
      expect(result.total, equals(110.00));
      expect(result.lines.first.lineSubtotal, equals(110.00));
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
      expect(doc.isTaxExempt, isFalse); // Must not be classified as exempt sale
      expect(doc.fiscalNotice, contains('NO RECAUDA IVA'));
      expect(doc.subtotal, equals(110.00));
      expect(doc.totalTax, equals(0.00));
      expect(doc.total, equals(110.00));
      expect(doc.lines.first.lineSubtotal, equals(110.00));
      expect(doc.lines.first.lineTotal, equals(110.00));
    });

    // -------------------------------------------------------------------------
    // TEST DE REGRESIÓN CRÍTICO -- C$ 50.00 (RÉGIMEN GENERAL)
    // -------------------------------------------------------------------------
    test('Régimen General test: 1 Espresso @ 50.00 produces gross = 50.00, taxableBase = 50.00, taxAmount = 7.50, lineTotal = 57.50, total = 57.50', () {
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
      expect(result.grossSubtotal, equals(50.00));
      expect(result.subtotal, equals(50.00));
      expect(result.taxableSubtotal, equals(50.00));
      expect(result.exemptSubtotal, equals(0.00));
      expect(result.totalTax, equals(7.50));
      expect(result.total, equals(57.50));

      final line = result.lines.first;
      expect(line.grossAmount, equals(50.00));
      expect(line.discount, equals(0.00));
      expect(line.taxableBase, equals(50.00));
      expect(line.exemptBase, equals(0.00));
      expect(line.appliedTaxRate, equals(0.15));
      expect(line.taxAmount, equals(7.50));
      expect(line.lineSubtotal, equals(50.00)); // Base amount of line
      expect(line.lineTotal, equals(57.50));    // Total amount including tax

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
      expect(doc.isTaxExempt, isFalse);
      expect(doc.subtotal, equals(50.00));
      expect(doc.totalTax, equals(7.50));
      expect(doc.total, equals(57.50));
      expect(doc.lines.first.lineSubtotal, equals(50.00));
      expect(doc.lines.first.lineTotal, equals(57.50));
      expect(doc.changeGiven, equals(2.50));
    });

    test('buildReceiptDocument carries authoritative cart modifier presentation without changing fiscal totals', () {
      final cart = [
        const CartItem(
          productId: 'mod-1',
          productName: 'Hamburguesa',
          quantity: 2,
          unitPrice: 100,
          taxRate: 0.15,
          selectedModifiers: [Modifier(id: 'cheese', name: 'Queso extra', extraPrice: 15)],
        ),
      ];
      final calculation = calculator.calculate(cart: cart, taxRegime: TaxRegime.regimenGeneral);
      final document = calculator.buildReceiptDocument(
        calculation: calculation,
        sourceCart: cart,
        invoiceNumber: '001-001-01-00000102',
      );
      final text = ReceiptLayoutFormatter.format80mm().formatReceiptDocumentText(document);

      expect(document.lines.single.lineSubtotal, 230); // (100 + 15) x 2
      expect(document.lines.single.modifierDisplays.single.printableText, 'Queso extra (por unidad: C\$ 15.00)');
      expect(text, contains('Queso extra (por unidad: C\$ 15.00)'));
      expect(document.subtotal, calculation.subtotal);
      expect(document.total, calculation.total);
    });

    // -------------------------------------------------------------------------
    // CAMBIO DINÁMICO DE CLASIFICACIÓN DGI: 115.00 -> 100.00
    // -------------------------------------------------------------------------
    test('DGI Classification Toggle: identical sale switches total from 115.00 to 100.00 based strictly on company regime', () {
      final cart = [
        const CartItem(
          productId: 'p1',
          productName: 'Almuerzo Ejecutivo',
          quantity: 1,
          unitPrice: 100.00,
          taxRate: 0.15,
        ),
      ];

      // CASO A: Régimen General
      final generalResult = calculator.calculate(
        cart: cart,
        taxRegime: TaxRegime.regimenGeneral,
      );
      expect(generalResult.subtotal, equals(100.00));
      expect(generalResult.totalTax, equals(15.00));
      expect(generalResult.total, equals(115.00));

      // CASO B: Cuota Fija (exactamente los mismos items)
      final cuotaFijaResult = calculator.calculate(
        cart: cart,
        taxRegime: TaxRegime.cuotaFija,
      );
      expect(cuotaFijaResult.subtotal, equals(100.00));
      expect(cuotaFijaResult.totalTax, equals(0.00));
      expect(cuotaFijaResult.total, equals(100.00));
    });

    // -------------------------------------------------------------------------
    // PRODUCTO EXENTO EN RÉGIMEN GENERAL vs CUOTA FIJA
    // -------------------------------------------------------------------------
    test('Product truly exempt under Régimen General produces taxAmount = 0.0 and accumulates in exemptSubtotal', () {
      final cart = [
        const CartItem(
          productId: 'prod-exempt',
          productName: 'Pan Casero Artesanal',
          quantity: 1,
          unitPrice: 100.00,
          taxRate: 0.0, // Marked as exempt
        ),
      ];

      final result = calculator.calculate(
        cart: cart,
        taxRegime: TaxRegime.regimenGeneral,
      );

      expect(result.subtotal, equals(100.00));
      expect(result.taxableSubtotal, equals(0.00));
      expect(result.exemptSubtotal, equals(100.00)); // Classified as exempt sale under general regime
      expect(result.totalTax, equals(0.00));
      expect(result.total, equals(100.00));
      expect(result.lines.first.appliedTaxRate, equals(0.00));
      expect(result.lines.first.taxAmount, equals(0.00));
      expect(result.lines.first.exemptBase, equals(100.00));
      expect(result.lines.first.taxableBase, equals(0.00));
      expect(result.lines.first.lineSubtotal, equals(100.00));
      expect(result.lines.first.lineTotal, equals(100.00));

      final doc = calculator.buildReceiptDocument(
        calculation: result,
        invoiceNumber: '001-001-01-00000105',
      );
      expect(doc.isTaxExempt, isTrue); // Truly exempt sale under Régimen General
    });

    // -------------------------------------------------------------------------
    // RÉGIMEN GENERAL: MEZCLA GRAVADO + EXENTO
    // -------------------------------------------------------------------------
    test('Régimen General with mixed taxable and exempt products consolidates bases correctly', () {
      final cart = [
        const CartItem(
          productId: 'prod-taxable',
          productName: 'Gaseosa Coca Cola',
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

      expect(result.grossSubtotal, equals(100.00));
      expect(result.subtotal, equals(100.00));
      expect(result.taxableSubtotal, equals(60.00));
      expect(result.exemptSubtotal, equals(40.00));
      expect(result.totalTax, equals(9.00));
      expect(result.total, equals(109.00));
    });

    // -------------------------------------------------------------------------
    // PRECIOS PEQUEÑOS Y PRECIOS DE MILES (RÉGIMEN GENERAL Y CUOTA FIJA)
    // -------------------------------------------------------------------------
    test('Small price calculation (e.g. C\$ 1.50)', () {
      final cart = [
        const CartItem(
          productId: 'candy-01',
          productName: 'Caramelo',
          quantity: 1,
          unitPrice: 1.50,
          taxRate: 0.15,
        ),
      ];

      final resGeneral = calculator.calculate(
        cart: cart,
        taxRegime: TaxRegime.regimenGeneral,
      );
      // 1.50 * 0.15 = 0.225 -> rounded to 0.23
      expect(resGeneral.subtotal, equals(1.50));
      expect(resGeneral.totalTax, equals(0.23));
      expect(resGeneral.total, equals(1.73));

      final resCuotaFija = calculator.calculate(
        cart: cart,
        taxRegime: TaxRegime.cuotaFija,
      );
      expect(resCuotaFija.subtotal, equals(1.50));
      expect(resCuotaFija.totalTax, equals(0.00));
      expect(resCuotaFija.total, equals(1.50));
    });

    test('Thousands price calculation (e.g. C\$ 12,500.00)', () {
      final cart = [
        const CartItem(
          productId: 'catering-01',
          productName: 'Servicio de Banquete',
          quantity: 1,
          unitPrice: 12500.00,
          taxRate: 0.15,
        ),
      ];

      final resGeneral = calculator.calculate(
        cart: cart,
        taxRegime: TaxRegime.regimenGeneral,
      );
      // 12500 * 0.15 = 1875.00
      expect(resGeneral.subtotal, equals(12500.00));
      expect(resGeneral.totalTax, equals(1875.00));
      expect(resGeneral.total, equals(14375.00));

      final resCuotaFija = calculator.calculate(
        cart: cart,
        taxRegime: TaxRegime.cuotaFija,
      );
      expect(resCuotaFija.subtotal, equals(12500.00));
      expect(resCuotaFija.totalTax, equals(0.00));
      expect(resCuotaFija.total, equals(12500.00));
    });

    // -------------------------------------------------------------------------
    // CANTIDADES MAYORES A 1 Y DOS DÍGITOS
    // -------------------------------------------------------------------------
    test('Quantities greater than 1 and two digits (e.g. 3 and 25)', () {
      final cart = [
        const CartItem(
          productId: 'p-3',
          productName: 'Tacos',
          quantity: 3,
          unitPrice: 80.00,
          taxRate: 0.15,
        ),
        const CartItem(
          productId: 'p-25',
          productName: 'Refrescos',
          quantity: 25,
          unitPrice: 20.00,
          taxRate: 0.15,
        ),
      ];

      // line 1: 3 * 80 = 240.00, tax: 36.00, lineTotal: 276.00
      // line 2: 25 * 20 = 500.00, tax: 75.00, lineTotal: 575.00
      // subtotal: 740.00, totalTax: 111.00, total: 851.00
      final resGeneral = calculator.calculate(
        cart: cart,
        taxRegime: TaxRegime.regimenGeneral,
      );
      expect(resGeneral.subtotal, equals(740.00));
      expect(resGeneral.totalTax, equals(111.00));
      expect(resGeneral.total, equals(851.00));
      expect(resGeneral.lines[0].lineSubtotal, equals(240.00));
      expect(resGeneral.lines[0].lineTotal, equals(276.00));
      expect(resGeneral.lines[1].lineSubtotal, equals(500.00));
      expect(resGeneral.lines[1].lineTotal, equals(575.00));

      final resCuotaFija = calculator.calculate(
        cart: cart,
        taxRegime: TaxRegime.cuotaFija,
      );
      expect(resCuotaFija.subtotal, equals(740.00));
      expect(resCuotaFija.totalTax, equals(0.00));
      expect(resCuotaFija.total, equals(740.00));
      expect(resCuotaFija.lines[0].lineSubtotal, equals(240.00));
      expect(resCuotaFija.lines[0].lineTotal, equals(240.00));
      expect(resCuotaFija.lines[1].lineSubtotal, equals(500.00));
      expect(resCuotaFija.lines[1].lineTotal, equals(500.00));
    });

    // -------------------------------------------------------------------------
    // DESCUENTOS PROPORCIONALES
    // -------------------------------------------------------------------------
    test('Proportional discount distributes across items and updates taxable base', () {
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
      expect(result.lines[0].lineSubtotal, equals(90.00));
      expect(result.lines[0].lineTotal, equals(103.50));
      expect(result.lines[1].taxableBase, equals(90.00));
      expect(result.lines[1].taxAmount, equals(13.50));
      expect(result.lines[1].lineSubtotal, equals(90.00));
      expect(result.lines[1].lineTotal, equals(103.50));
      expect(result.totalTax, equals(27.00));
      expect(result.total, equals(207.00));
    });

    // -------------------------------------------------------------------------
    // INVARIANTES MATEMÁTICAS
    // -------------------------------------------------------------------------
    test('Mathematical invariants hold across all lines and totals', () {
      final cart = [
        const CartItem(
          productId: 'i1',
          productName: 'Item Gravado',
          quantity: 2,
          unitPrice: 75.50,
          taxRate: 0.15,
        ),
        const CartItem(
          productId: 'i2',
          productName: 'Item Exento',
          quantity: 1,
          unitPrice: 50.00,
          taxRate: 0.0,
        ),
      ];

      // Régimen General
      final resRG = calculator.calculate(
        cart: cart,
        taxRegime: TaxRegime.regimenGeneral,
        totalDiscounts: 15.00,
      );

      for (final line in resRG.lines) {
        // Invariant 1: gross - discount == lineSubtotal
        expect(line.grossAmount - line.discount, closeTo(line.lineSubtotal, 0.01));
        // Invariant 2: lineSubtotal + taxAmount == lineTotal
        expect(line.lineSubtotal + line.taxAmount, closeTo(line.lineTotal, 0.01));
      }
      // Invariant 3: subtotal == taxableSubtotal + exemptSubtotal
      expect(resRG.subtotal, closeTo(resRG.taxableSubtotal + resRG.exemptSubtotal, 0.01));
      // Invariant 4: total == subtotal + totalTax
      expect(resRG.total, closeTo(resRG.subtotal + resRG.totalTax, 0.01));

      // Cuota Fija
      final resCF = calculator.calculate(
        cart: cart,
        taxRegime: TaxRegime.cuotaFija,
        totalDiscounts: 15.00,
      );

      for (final line in resCF.lines) {
        expect(line.taxAmount, equals(0.00));
        expect(line.lineSubtotal, equals(line.lineTotal));
      }
      expect(resCF.totalTax, equals(0.00));
      expect(resCF.total, equals(resCF.subtotal));
    });

    // -------------------------------------------------------------------------
    // NO REGRESIÓN DEL RENDERER: RECIBE VALORES YA CALCULADOS
    // -------------------------------------------------------------------------
    test('Renderer non-regression: consumes arbitrary pre-calculated ReceiptDocument without tax formula knowledge', () {
      final externalDoc = ReceiptDocument(
        businessName: 'TEST BUSINESS',
        documentTitle: 'FACTURA DE VENTA',
        documentNumber: '001-001-01-99999999',
        date: DateTime(2026, 9, 4, 12, 0),
        taxRegime: TaxRegime.regimenGeneral,
        lines: [
          ReceiptLine(
            quantity: 1,
            description: 'Item de Prueba Arbitrario',
            unitPrice: 100.00,
            taxableBase: 100.00,
            lineSubtotal: 100.00,
            lineTotal: 115.00,
            taxRate: 0.15,
            taxAmount: 15.00,
          ),
        ],
        subtotal: 100.00,
        taxableSubtotal: 100.00,
        totalTax: 15.00,
        total: 115.00,
        commercialRate: 36.50,
        totalUsd: 3.15,
      );

      final formatter = ReceiptLayoutFormatter.format58mm();
      final text = formatter.formatReceiptDocumentText(externalDoc);

      expect(text, contains('FACTURA DE VENTA'));
      expect(text, contains('SUBTOTAL:'));
      expect(text, contains('C\$ 100.00'));
      expect(text, contains('IVA (15%):'));
      expect(text, contains('C\$ 15.00'));
      expect(text, contains('TOTAL CORDOBAS:'));
      expect(text, contains('C\$ 115.00'));
      // The line table displays the base amount 100.00
      expect(text, contains('1 x Item de Prueba Arbitrario'));
      expect(text, contains('@ C\$ 100.00'));
    });

    // -------------------------------------------------------------------------
    // HARDENING: CONFIGURACIÓN FISCAL AUSENTE O INVÁLIDA (SECCIONES 4, 5, 6)
    // -------------------------------------------------------------------------
    group('Configuración Fiscal Ausente o Inválida (No Silenced Fallback)', () {
      test('TaxRegime.fromString returns null for null, empty, invalid, and legacy unknown strings', () {
        expect(TaxRegime.fromString(null), isNull);
        expect(TaxRegime.fromString(''), isNull);
        expect(TaxRegime.fromString('   '), isNull);
        expect(TaxRegime.fromString('INVALID'), isNull);
        expect(TaxRegime.fromString('UNKNOWN_LEGACY_CODE_99'), isNull);
        expect(TaxRegime.fromString('REGIMEN_INVENTADO'), isNull);

        // Valid strings still resolve
        expect(TaxRegime.fromString('CUOTA_FIJA'), equals(TaxRegime.cuotaFija));
        expect(TaxRegime.fromString('cuota_fija'), equals(TaxRegime.cuotaFija));
        expect(TaxRegime.fromString('REGIMEN_GENERAL'), equals(TaxRegime.regimenGeneral));
        expect(TaxRegime.fromString('regimen_general'), equals(TaxRegime.regimenGeneral));
      });

      test('InvoiceFiscalCalculator with taxRegime == null does NOT assume Régimen General, produces zero tax', () {
        final cart = [
          const CartItem(
            productId: 'p-unconfigured',
            productName: 'Producto Sin Régimen',
            quantity: 1,
            unitPrice: 100.00,
            taxRate: 0.15,
          ),
        ];

        final result = calculator.calculate(
          cart: cart,
          taxRegime: null,
        );

        expect(result.taxRegime, isNull);
        expect(result.isFiscalPolicyConfigured, isFalse);
        expect(result.subtotal, equals(100.00));
        expect(result.taxableSubtotal, equals(0.00));
        expect(result.exemptSubtotal, equals(0.00)); // No false exemption invented
        expect(result.totalTax, equals(0.00));       // No IVA silently added
        expect(result.total, equals(100.00));
        expect(result.lines.first.appliedTaxRate, equals(0.00));
        expect(result.lines.first.taxAmount, equals(0.00));
        expect(result.lines.first.lineSubtotal, equals(100.00));
        expect(result.lines.first.lineTotal, equals(100.00));
      });

      test('buildReceiptDocument throws FiscalConfigurationException if taxRegime is null', () {
        final cart = [
          const CartItem(
            productId: 'p1',
            productName: 'Producto',
            quantity: 1,
            unitPrice: 100.00,
            taxRate: 0.15,
          ),
        ];

        final result = calculator.calculate(
          cart: cart,
          taxRegime: null,
        );

        expect(
          () => calculator.buildReceiptDocument(
            calculation: result,
            invoiceNumber: '001-001-01-00000999',
          ),
          throwsA(isA<FiscalConfigurationException>()),
        );
      });
    });

    // -------------------------------------------------------------------------
    // HARDENING: PRORRATEO DETERMINÍSTICO Y EXACTITUD MONETARIA (SECCIONES 18, 19, 20)
    // -------------------------------------------------------------------------
    group('Prorrateo de Descuentos y Redondeo Invariante (Largest Remainder)', () {
      test('3 equal lines @ 100.00 with discount 1.00: exactly 1.00 distributed without losing 1 cent', () {
        final cart = [
          const CartItem(productId: 'l1', productName: 'Item A', quantity: 1, unitPrice: 100.0, taxRate: 0.15),
          const CartItem(productId: 'l2', productName: 'Item B', quantity: 1, unitPrice: 100.0, taxRate: 0.15),
          const CartItem(productId: 'l3', productName: 'Item C', quantity: 1, unitPrice: 100.0, taxRate: 0.15),
        ];

        final result = calculator.calculate(
          cart: cart,
          taxRegime: TaxRegime.regimenGeneral,
          totalDiscounts: 1.00,
        );

        // Discarded rounding would produce 0.33 + 0.33 + 0.33 = 0.99 (losing 1 cent).
        // Largest remainder ensures remainder cent is allocated: 0.34 + 0.33 + 0.33 = 1.00.
        expect(result.lines[0].discount, equals(0.34));
        expect(result.lines[1].discount, equals(0.33));
        expect(result.lines[2].discount, equals(0.33));

        final sumDiscounts = result.lines.fold(0.0, (acc, l) => acc + l.discount);
        expect(double.parse(sumDiscounts.toStringAsFixed(2)), equals(1.00));
        expect(result.totalDiscount, equals(1.00));

        // Subtotal invariant: grossSubtotal - totalDiscount
        expect(result.grossSubtotal, equals(300.00));
        expect(result.subtotal, equals(299.00));
      });

      test('3 equal lines @ 100.00 with discount 2.00: exactly 2.00 distributed without creating 1 cent', () {
        final cart = [
          const CartItem(productId: 'l1', productName: 'Item A', quantity: 1, unitPrice: 100.0, taxRate: 0.15),
          const CartItem(productId: 'l2', productName: 'Item B', quantity: 1, unitPrice: 100.0, taxRate: 0.15),
          const CartItem(productId: 'l3', productName: 'Item C', quantity: 1, unitPrice: 100.0, taxRate: 0.15),
        ];

        final result = calculator.calculate(
          cart: cart,
          taxRegime: TaxRegime.regimenGeneral,
          totalDiscounts: 2.00,
        );

        expect(result.lines[0].discount, equals(0.67));
        expect(result.lines[1].discount, equals(0.67));
        expect(result.lines[2].discount, equals(0.66));

        final sumDiscounts = result.lines.fold(0.0, (acc, l) => acc + l.discount);
        expect(double.parse(sumDiscounts.toStringAsFixed(2)), equals(2.00));
        expect(result.totalDiscount, equals(2.00));
        expect(result.subtotal, equals(298.00));
      });

      test('Invariants hold across tricky discount amounts: 0.01, 0.05, 0.10, 1.00, 10.00 with multi-line carts', () {
        final trickyDiscounts = [0.01, 0.05, 0.10, 1.00, 10.00];

        final cart = [
          const CartItem(productId: 'p1', productName: 'Prod 1', quantity: 2, unitPrice: 33.33, taxRate: 0.15),
          const CartItem(productId: 'p2', productName: 'Prod 2', quantity: 1, unitPrice: 125.50, taxRate: 0.15),
          const CartItem(productId: 'p3', productName: 'Prod 3', quantity: 3, unitPrice: 47.80, taxRate: 0.0),
        ];

        for (final disc in trickyDiscounts) {
          final res = calculator.calculate(
            cart: cart,
            taxRegime: TaxRegime.regimenGeneral,
            totalDiscounts: disc,
          );

          final sumDiscounts = double.parse(
            res.lines.fold<double>(0.0, (acc, l) => acc + l.discount).toStringAsFixed(2),
          );
          expect(sumDiscounts, equals(disc), reason: 'Discount $disc must match sum of line discounts');
          expect(res.totalDiscount, equals(disc));
          expect(
            res.subtotal,
            equals(double.parse((res.grossSubtotal - res.totalDiscount).toStringAsFixed(2))),
            reason: 'subtotal == grossSubtotal - totalDiscount for discount $disc',
          );
        }
      });
    });

    // -------------------------------------------------------------------------
    // HARDENING: MODELO FISCAL DE PRODUCTO Y PRECEDENCIA CANÓNICA (SECCIONES 7, 8, 9, 34, 35)
    // -------------------------------------------------------------------------
    group('Product Fiscal Precedence & Contradictory State Normalization', () {
      test('Contradictory state 1: taxRate: 0.15 + isTaxExempt: true => canonical rate is 0.0', () {
        const product = Product(
          id: 'p-contradictory-1',
          name: 'Pan Casero',
          uom: 'UND',
          stock: 10,
          averageCost: 5,
          sellPrice: 100,
          taxRate: 0.15,
          isTaxExempt: true,
        );

        expect(product.isGenuinelyExempt, isTrue);
        expect(product.effectiveTaxRate, equals(0.0));
      });

      test('Contradictory state 2: taxRate: 0.0 + isTaxExempt: false => canonical rate is 0.0', () {
        const product = Product(
          id: 'p-contradictory-2',
          name: 'Medicamento',
          uom: 'UND',
          stock: 10,
          averageCost: 5,
          sellPrice: 100,
          taxRate: 0.0,
          isTaxExempt: false,
        );

        expect(product.isGenuinelyExempt, isTrue);
        expect(product.effectiveTaxRate, equals(0.0));
      });

      test('Legacy product JSON without taxRate or isTaxExempt resolves documented business default', () {
        // Simulates old product JSON stored or synced prior to fiscal fields
        final legacyJson = {
          'id': 'legacy-001',
          'name': 'Gaseosa Antigua',
          'uom': 'UND',
          'stock': 20.0,
          'averageCost': 15.0,
          'sellPrice': 50.0,
          'isActive': true,
        };

        final product = Product.fromJson(legacyJson);

        // Under Nicaraguan tax law (Ley 822 Art. 114), standard retail goods have 15% IVA default
        expect(product.taxRate, equals(0.15));
        expect(product.isTaxExempt, isFalse);
        expect(product.isGenuinelyExempt, isFalse);
        expect(product.effectiveTaxRate, equals(0.15));

        // When sold under Cuota Fija, Cuota Fija rule strictly overrides: IVA = 0
        final cfResult = calculator.calculate(
          cart: [
            CartItem(
              productId: product.id,
              productName: product.name,
              quantity: 1,
              unitPrice: product.sellPrice,
              taxRate: product.effectiveTaxRate,
            ),
          ],
          taxRegime: TaxRegime.cuotaFija,
        );
        expect(cfResult.totalTax, equals(0.00));
        expect(cfResult.total, equals(50.00));
      });
    });

    // -------------------------------------------------------------------------
    // HARDENING: RECEIPTDOCUMENT.FROMINVOICE VS BUILRECEIPTDOCUMENT (SECCIÓN 14, 36)
    // -------------------------------------------------------------------------
    group('ReceiptDocument Construction Consistency (buildReceiptDocument vs fromInvoice)', () {
      test('Both construction paths yield identical financial values under Régimen General', () {
        final cart = [
          const CartItem(productId: 'p1', productName: 'Item A', quantity: 2, unitPrice: 50.0, taxRate: 0.15),
          const CartItem(productId: 'p2', productName: 'Item B Exento', quantity: 1, unitPrice: 40.0, taxRate: 0.0),
        ];

        final calc = calculator.calculate(
          cart: cart,
          taxRegime: TaxRegime.regimenGeneral,
          totalDiscounts: 10.0,
        );

        // Path A: buildReceiptDocument directly from calculation
        final docA = calculator.buildReceiptDocument(
          calculation: calc,
          invoiceNumber: '001-001-01-00000500',
          businessName: 'OMNIFOOD',
        );

        // Simulate Invoice and InvoiceItems created from that exact calculation
        final invoice = Invoice(
          id: 'inv-500',
          number: '001-001-01-00000500',
          createdAt: docA.date,
          userId: 'u1',
          subtotal: calc.subtotal,
          totalTax: calc.totalTax,
          total: calc.total,
          commercialRate: calc.commercialRate,
          bcnOfficialRate: calc.bcnOfficialRate,
          totalUsd: calc.totalUsd,
        );

        final invoiceItems = [
          for (final l in calc.lines)
            InvoiceItem(
              id: 'item-${l.productId}',
              invoiceId: invoice.id,
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

        // Path B: fromInvoice (e.g. reprint/history from database)
        final docB = ReceiptDocument.fromInvoice(
          invoice,
          items: invoiceItems,
          payments: const [],
          businessName: 'OMNIFOOD',
          taxRegime: TaxRegime.regimenGeneral,
        );

        expect(docB.subtotal, equals(docA.subtotal));
        expect(docB.totalTax, equals(docA.totalTax));
        expect(docB.total, equals(docA.total));
        expect(docB.taxableSubtotal, equals(docA.taxableSubtotal));
        expect(docB.exemptSubtotal, equals(docA.exemptSubtotal));
        expect(docB.discountTotal, equals(docA.discountTotal));
        expect(docB.lines.length, equals(docA.lines.length));

        for (var i = 0; i < docA.lines.length; i++) {
          expect(docB.lines[i].lineSubtotal, equals(docA.lines[i].lineSubtotal));
          expect(docB.lines[i].taxAmount, equals(docA.lines[i].taxAmount));
          expect(docB.lines[i].lineTotal, equals(docA.lines[i].lineTotal));
        }
      });

      test('Both construction paths yield identical financial values under Cuota Fija', () {
        final cart = [
          const CartItem(productId: 'latte', productName: 'Latte', quantity: 1, unitPrice: 110.0, taxRate: 0.15),
        ];

        final calc = calculator.calculate(
          cart: cart,
          taxRegime: TaxRegime.cuotaFija,
        );

        final docA = calculator.buildReceiptDocument(
          calculation: calc,
          invoiceNumber: '001-001-01-00000501',
          businessName: 'COMEDOR CUOTA FIJA',
        );

        final invoice = Invoice(
          id: 'inv-501',
          number: '001-001-01-00000501',
          createdAt: docA.date,
          userId: 'u1',
          subtotal: calc.subtotal,
          totalTax: 0.0,
          total: calc.total,
          commercialRate: calc.commercialRate,
          bcnOfficialRate: calc.bcnOfficialRate,
          totalUsd: calc.totalUsd,
        );

        final invoiceItems = [
          for (final l in calc.lines)
            InvoiceItem(
              id: 'item-${l.productId}',
              invoiceId: invoice.id,
              productId: l.productId,
              productName: l.productName,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              originalTaxRate: l.nominalTaxRate,
              appliedTaxRate: l.appliedTaxRate,
              taxAmount: 0.0,
              total: l.lineTotal,
              discount: l.discount,
            ),
        ];

        final docB = ReceiptDocument.fromInvoice(
          invoice,
          items: invoiceItems,
          payments: const [],
          businessName: 'COMEDOR CUOTA FIJA',
          taxRegime: TaxRegime.cuotaFija,
        );

        expect(docB.subtotal, equals(110.00));
        expect(docB.totalTax, equals(0.00));
        expect(docB.total, equals(110.00));
        expect(docB.isTaxExempt, isFalse);
        expect(docB.lines.first.lineSubtotal, equals(110.00));
        expect(docB.lines.first.lineTotal, equals(110.00));
        expect(docB.lines.first.taxAmount, equals(0.00));
      });
    });
  });
}
