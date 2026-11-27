import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:pos_app/data/adapters/printer/mock_printer_adapter.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/local_config_entity.dart';
import 'package:pos_app/domain/models/config/printer_config.dart';
import 'package:pos_app/domain/models/config/tax_regime.dart';
import 'package:pos_app/domain/models/printer/receipt_document.dart';
import 'package:pos_app/domain/models/sales/cashier_session.dart';
import 'package:pos_app/domain/models/sales/invoice.dart';
import 'package:pos_app/domain/models/sales/invoice_item.dart';
import 'package:pos_app/domain/models/sales/payment.dart';
import 'package:pos_app/domain/repositories/sales/sales_repository.dart';
import 'package:pos_app/domain/services/config/printer_config_service.dart';
import 'package:pos_app/domain/services/printer/receipt_layout_formatter.dart';
import 'package:pos_app/domain/services/sales/invoice_fiscal_calculator.dart';
import 'package:pos_app/ui/features/sales/reports/dgi_report_view_model.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

import '../config/printer_config_service_test.mocks.dart';

class _StubSalesRepository extends Fake implements SalesRepository {
  @override
  Future<List<Invoice>> getInvoicesBySessionId(String sessionId) async =>
      const [];

  @override
  Future<List<Payment>> getPaymentsBySessionId(String sessionId) async =>
      const [];
}

Invoice _exemptInvoice() => Invoice(
      id: 'inv-exempt-540',
      number: '001-001-01-00000077',
      createdAt: DateTime(2026, 11, 27, 14, 0),
      userId: 'cashier-1',
      subtotal: 100.0,
      totalTax: 0.0,
      total: 100.0,
      globalTaxOverride: true,
    );

List<InvoiceItem> _exemptItems() => const [
      InvoiceItem(
        id: 'item-1',
        invoiceId: 'inv-exempt-540',
        productId: 'prod-1',
        productName: 'Producto Exento',
        quantity: 1,
        unitPrice: 100.0,
        originalTaxRate: 0.0,
        appliedTaxRate: 0.0,
        taxAmount: 0.0,
        total: 100.0,
      ),
    ];

void main() {
  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  group('#540 S1 (AC-4): never print unverified POLITICA TEMPORAL literal', () {
    for (final entry in {
      '58mm': ReceiptLayoutFormatter.format58mm(),
      '80mm': ReceiptLayoutFormatter.format80mm(),
    }.entries) {
      test('${entry.key} text & ESC/POS omit POLITICA TEMPORAL on exempt RG sale', () {
        final doc = ReceiptDocument.fromInvoice(
          _exemptInvoice(),
          items: _exemptItems(),
          payments: const [],
          businessName: 'Cafe Prueba',
          taxRegime: TaxRegime.regimenGeneral,
          isTaxExempt: true,
        );

        final text = entry.value.formatReceiptDocumentText(doc);
        final escPos = latin1.decode(
          entry.value.formatReceiptDocumentEscPos(doc),
          allowInvalid: true,
        );

        expect(text, contains('VENTA EXENTA (IVA 0%):'));
        expect(text, contains('TOTAL CORDOBAS:'));
        expect(text.toUpperCase(), isNot(contains('POLITICA')));
        expect(text.toUpperCase(), isNot(contains('TEMPORAL')));
        expect(escPos.toUpperCase(), isNot(contains('POLITICA')));
        expect(escPos.toUpperCase(), isNot(contains('TEMPORAL')));
      });
    }
  });

  group('#540 S3 (AC-3): zero hardcoded OMNIFOOD NI fiscal fallbacks', () {
    test('PrinterConfig default headerBusinessName is empty, never OMNIFOOD NI', () {
      const config = PrinterConfig();
      expect(config.headerBusinessName, isEmpty);
      expect(config.headerBusinessName, isNot(contains('OMNIFOOD')));
    });

    test('PrinterConfigService returns empty headerBusinessName when unconfigured', () async {
      final mockDao = MockLocalConfigDao();
      when(mockDao.getConfigByKey(any)).thenAnswer((_) async => null);
      final service = PrinterConfigService(mockDao);
      addTearDown(service.dispose);

      final config = await service.getPrinterConfig();
      expect(config.headerBusinessName, isEmpty);
      expect(config.headerBusinessName, isNot(contains('OMNIFOOD')));
    });

    test('ReceiptDocument.fromInvoice never substitutes OMNIFOOD NI when blank', () {
      final docNull = ReceiptDocument.fromInvoice(
        _exemptInvoice(),
        items: _exemptItems(),
        payments: const [],
        businessName: null,
        taxRegime: TaxRegime.regimenGeneral,
      );
      final docBlank = ReceiptDocument.fromInvoice(
        _exemptInvoice(),
        items: _exemptItems(),
        payments: const [],
        businessName: '   ',
        taxRegime: TaxRegime.regimenGeneral,
      );

      expect(docNull.businessName, isEmpty);
      expect(docBlank.businessName, isEmpty);

      final text = ReceiptLayoutFormatter.format58mm().formatReceiptDocumentText(docNull);
      final escPos = latin1.decode(
        ReceiptLayoutFormatter.format58mm().formatReceiptDocumentEscPos(docNull),
        allowInvalid: true,
      );
      expect(text, isNot(contains('OMNIFOOD')));
      expect(escPos, isNot(contains('OMNIFOOD')));
    });

    test('InvoiceFiscalCalculator.buildReceiptDocument never substitutes OMNIFOOD NI', () {
      const calculation = FiscalCalculationResult(
        taxRegime: TaxRegime.cuotaFija,
        lines: [],
        grossSubtotal: 50.0,
        totalDiscount: 0.0,
        subtotal: 50.0,
        taxableSubtotal: 0.0,
        exemptSubtotal: 50.0,
        totalTax: 0.0,
        total: 50.0,
        commercialRate: 36.50,
        bcnOfficialRate: 36.6241,
        totalUsd: 1.37,
      );
      final doc = InvoiceFiscalCalculator().buildReceiptDocument(
        calculation: calculation,
        invoiceNumber: '001-001-01-00000001',
        businessName: '   ',
      );
      expect(doc.businessName, isEmpty);
      expect(doc.businessName, isNot(contains('OMNIFOOD')));
    });

    test('DgiReportViewModel uses configured business_name and never hardcodes OMNIFOOD NI', () async {
      final db = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();
      try {
        final vm = DgiReportViewModel(_StubSalesRepository(), db);
        final session = CashierSession(
          id: 'shift-1',
          userId: 'cashier-1',
          openedAt: DateTime(2026, 11, 27, 8, 0),
          openingBalance: 500.0,
        );

        await vm.selectSession(session);
        final unconfiguredReport = vm.generatePrintString();
        expect(unconfiguredReport, isNot(contains('OMNIFOOD')));
        expect(unconfiguredReport, contains('REPORTE X/Z'));

        await db.localConfigDao.saveConfig(
          LocalConfigEntity(
            key: 'business_name',
            value: 'Pulperia El Sol',
          ),
        );
        await vm.selectSession(session);
        final configuredReport = vm.generatePrintString();
        expect(configuredReport, contains('PULPERIA EL SOL - REPORTE X/Z'));
        expect(configuredReport, isNot(contains('OMNIFOOD')));
      } finally {
        await db.close();
      }
    });
  });

  group('#540 S2 (AC-2/AC-5): legal_footer and customerRuc reach printed output', () {
    test('PrinterConfigService reads legal_footer and trims blank to null', () async {
      final mockDao = MockLocalConfigDao();
      when(mockDao.getConfigByKey(any)).thenAnswer((_) async => null);
      when(mockDao.getConfigByKey(PrinterConfigService.legalFooterKey))
          .thenAnswer(
        (_) async => LocalConfigEntity(
          key: 'legal_footer',
          value: '  Conserve su comprobante para reclamos  ',
        ),
      );
      final service = PrinterConfigService(mockDao);
      addTearDown(service.dispose);

      final config = await service.getPrinterConfig();
      expect(config.legalFooter, 'Conserve su comprobante para reclamos');

      when(mockDao.getConfigByKey(PrinterConfigService.legalFooterKey))
          .thenAnswer(
        (_) async => LocalConfigEntity(key: 'legal_footer', value: '   '),
      );
      final blankConfig = await service.getPrinterConfig();
      expect(blankConfig.legalFooter, isNull);
    });

    test('MockPrinterAdapter forwards footerMessage and customerRuc to rendered receipt', () async {
      final adapter = MockPrinterAdapter();
      final result = await adapter.printInvoice(
        _exemptInvoice(),
        items: _exemptItems(),
        payments: const [],
        businessName: 'Cafe Sol',
        customerRuc: '001-150885-0002Y',
        taxRegime: TaxRegime.regimenGeneral,
        footerMessage: 'SIN CAMBIOS DESPUES DE 48 HORAS',
      );

      expect(result.isSuccess, isTrue);
      expect(adapter.lastPrintedText, contains('001-150885-0002Y'));
      expect(adapter.lastPrintedText, contains('SIN CAMBIOS DESPUES DE 48 HORAS'));
      expect(
        adapter.lastPrintedText,
        isNot(contains('*** GRACIAS POR SU COMPRA ***')),
      );
    });

    test('PrinterConfigService reads tax_exemption_reason and trims blank to null', () async {
      final mockDao = MockLocalConfigDao();
      when(mockDao.getConfigByKey(any)).thenAnswer((_) async => null);
      when(mockDao.getConfigByKey(PrinterConfigService.taxExemptionReasonKey))
          .thenAnswer(
        (_) async => LocalConfigEntity(
          key: 'tax_exemption_reason',
          value: '  Acuerdo MHCP-INTUR-DGI 01-2025 - Fiestas Patrias  ',
        ),
      );
      final service = PrinterConfigService(mockDao);
      addTearDown(service.dispose);

      final config = await service.getPrinterConfig();
      expect(
        config.taxExemptionReason,
        'Acuerdo MHCP-INTUR-DGI 01-2025 - Fiestas Patrias',
      );

      when(mockDao.getConfigByKey(PrinterConfigService.taxExemptionReasonKey))
          .thenAnswer(
        (_) async => LocalConfigEntity(key: 'tax_exemption_reason', value: '   '),
      );
      final blankConfig = await service.getPrinterConfig();
      expect(blankConfig.taxExemptionReason, isNull);
    });

    test('MockPrinterAdapter and 58mm/80mm text & ESC/POS print configured taxExemptionReason within maxCols', () async {
      const reason = 'Acuerdo MHCP-INTUR-DGI 01-2025 - Fiestas Patrias Sin IVA';
      final adapter = MockPrinterAdapter();
      final result = await adapter.printInvoice(
        _exemptInvoice(),
        items: _exemptItems(),
        payments: const [],
        businessName: 'Cafe Sol',
        taxRegime: TaxRegime.regimenGeneral,
        isTaxExempt: true,
        taxExemptionReason: reason,
      );

      expect(result.isSuccess, isTrue);
      expect(adapter.lastPrintedText, contains('Acuerdo MHCP-INTUR-DGI'));
      expect(adapter.lastPrintedText, isNot(contains('POLITICA TEMPORAL')));

      for (final entry in {
        '58mm': ReceiptLayoutFormatter.format58mm(),
        '80mm': ReceiptLayoutFormatter.format80mm(),
      }.entries) {
        final doc = ReceiptDocument.fromInvoice(
          _exemptInvoice(),
          items: _exemptItems(),
          payments: const [],
          businessName: 'Cafe Sol',
          taxRegime: TaxRegime.regimenGeneral,
          isTaxExempt: true,
          taxExemptionReason: reason,
        );
        final text = entry.value.formatReceiptDocumentText(doc);
        final escPos = latin1.decode(
          entry.value.formatReceiptDocumentEscPos(doc),
          allowInvalid: true,
        );
        expect(text, contains('Acuerdo MHCP-INTUR-DGI'));
        expect(escPos, contains('Acuerdo MHCP-INTUR-DGI'));
        for (final line in text.split('\n')) {
          expect(
            line.length,
            lessThanOrEqualTo(entry.value.maxCols),
            reason: '${entry.key} line exceeded maxCols: "$line"',
          );
        }
      }
    });
  });
}
