import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/core/utils/nicaragua_fiscal_validator.dart';
import 'package:pos_app/domain/models/sales/invoice.dart';
import 'package:pos_app/domain/models/sales/invoice_item.dart';
import 'package:pos_app/domain/models/sales/payment.dart';
import 'package:pos_app/domain/services/printer/receipt_58mm_formatter.dart';
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

      expect(formattedTicket, contains('Disposicion Tecnica 09-2007'));
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
  });
}
