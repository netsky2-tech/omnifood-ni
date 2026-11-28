import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/sales/invoice_entity.dart';
import 'package:pos_app/data/services/sales/dgi_numbering_service_impl.dart';
import 'package:pos_app/domain/models/config/tax_regime.dart';
import 'package:pos_app/domain/models/sales/cart_item.dart';
import 'package:pos_app/domain/services/printer/receipt_layout_formatter.dart';
import 'package:pos_app/domain/services/sales/invoice_fiscal_calculator.dart';
import 'package:pos_app/ui/features/config/business_profile/business_profile_view_model.dart';

/// Real Android Hardware E2E Runner for #1049 (CONTROL_INTERNO Non-Fiscal Mode
/// & Smooth Formalization Transitions on Samsung Galaxy S23 SM-S918B ARM64).
///
/// Uses 100% REAL on-device SQLite (AppDatabase via Floor), REAL LocalConfigDao,
/// REAL BusinessProfileViewModel, REAL DgiNumberingServiceImpl, REAL
/// InvoiceFiscalCalculator, and REAL ReceiptLayoutFormatter (58mm & 80mm text +
/// ESC/POS) — ZERO MOCKS.
///
/// Build & run on attached Android device:
///   flutter build apk --debug -t integration_test/control_interno_s23_hardware_e2e_test.dart
///   adb install -r build/app/outputs/flutter-apk/app-debug.apk
///   adb logcat -c && adb shell am start -n com.example.pos_app/.MainActivity
///   adb logcat -d -s flutter
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const _HardwareE2EControlInternoApp());
}

class _HardwareE2EControlInternoApp extends StatefulWidget {
  const _HardwareE2EControlInternoApp();

  @override
  State<_HardwareE2EControlInternoApp> createState() =>
      _HardwareE2EControlInternoAppState();
}

class _HardwareE2EControlInternoAppState
    extends State<_HardwareE2EControlInternoApp> {
  final List<String> _logs = [];
  String _status = 'RUNNING';

  @override
  void initState() {
    super.initState();
    _runAll();
  }

  void _log(String msg) {
    debugPrint('[S23_E2E_CONTROL_INTERNO] $msg');
    if (mounted) {
      setState(() => _logs.add(msg));
    }
  }

  void _assertClose(double actual, double expected, String label) {
    if ((actual - expected).abs() > 0.0001) {
      throw StateError(
        'Assertion failed [$label]: expected $expected, got $actual',
      );
    }
  }

  void _assertTrue(bool condition, String label) {
    if (!condition) {
      throw StateError('Assertion failed [$label]');
    }
  }

  void _assertContains(String haystack, String needle, String label) {
    if (!haystack.contains(needle)) {
      throw StateError(
        'Assertion failed [$label]: expected to contain "$needle"',
      );
    }
  }

  void _assertNotContains(String haystack, String needle, String label) {
    if (haystack.contains(needle)) {
      throw StateError(
        'Assertion failed [$label]: expected NOT to contain "$needle"',
      );
    }
  }

  Future<void> _runAll() async {
    int passed = 0;
    const int total = 3;

    final docsDir = await getApplicationDocumentsDirectory();
    final workDir = Directory(
      '${docsDir.path}/s23_e2e_control_interno_${DateTime.now().millisecondsSinceEpoch}',
    );
    await workDir.create(recursive: true);
    final db1Path = '${workDir.path}/control_interno_case12.db';
    final db2Path = '${workDir.path}/control_interno_case3.db';

    AppDatabase? db1;
    AppDatabase? db2;
    try {
      db1 = await $FloorAppDatabase.databaseBuilder(db1Path).build();
      final configDao1 = db1.localConfigDao;
      final invoiceDao1 = db1.invoiceDao;
      final vm1 = BusinessProfileViewModel(configDao1);
      final numbering1 = DgiNumberingServiceImpl(configDao1, invoiceDao1);
      const calculator = InvoiceFiscalCalculator();
      final fmt58 = ReceiptLayoutFormatter.format58mm();
      final fmt80 = ReceiptLayoutFormatter.format80mm();

      // =======================================================================
      // CASE 1 — CONTROL_INTERNO Onboarding Without RUC + Auto-Numbering
      //          (NV-00000001) + 0% IVA + Legally Honest Ticket (58mm & 80mm)
      // =======================================================================
      _log(
        'E2E_CASE: [1/3] CONTROL_INTERNO Onboarding Without RUC + NV-00000001 + 0% IVA + Honest Ticket',
      );

      await vm1.loadConfig();
      await vm1.saveConfig({
        ...vm1.config,
        'business_name': 'Pulpería La Esperanza',
        'ruc': '',
        'address': 'Bo. Monseñor Lezcano, Managua',
        'phone': '8888-1234',
        'tax_regime': 'CONTROL_INTERNO',
        'dgi_prefix': '',
        'dgi_range_start': '',
        'dgi_current_number': '',
      });

      final persistedPrefix1 =
          (await configDao1.getConfigByKey('dgi_prefix'))?.value;
      final persistedCurrent1 =
          (await configDao1.getConfigByKey('dgi_current_number'))?.value;
      _assertTrue(
        persistedPrefix1 == 'NV-',
        'Case 1 SQLite dgi_prefix == NV- (got $persistedPrefix1)',
      );
      _assertTrue(
        persistedCurrent1 == '1',
        'Case 1 SQLite dgi_current_number == 1 (got $persistedCurrent1)',
      );

      final docNumber1 = await numbering1.getNextNumber();
      _assertTrue(
        docNumber1 == 'NV-00000001',
        'Case 1 DgiNumberingServiceImpl.getNextNumber() == NV-00000001 (got $docNumber1)',
      );

      final calc1 = calculator.calculate(
        cart: const [
          CartItem(
            productId: 'prod-taxed',
            productName: 'Gaseosa 1L',
            quantity: 1,
            unitPrice: 100.0,
            taxRate: 0.15,
          ),
          CartItem(
            productId: 'prod-exempt',
            productName: 'Arroz 1Lb',
            quantity: 1,
            unitPrice: 50.0,
            taxRate: 0.0,
          ),
        ],
        taxRegime: TaxRegime.controlInterno,
        commercialRate: 36.50,
        bcnOfficialRate: 36.6241,
      );

      _assertClose(calc1.totalTax, 0.0, 'Case 1 totalTax == 0.0');
      _assertClose(calc1.subtotal, 150.0, 'Case 1 subtotal == 150.0');
      _assertClose(calc1.total, 150.0, 'Case 1 total == 150.0');

      final doc1 = calculator.buildReceiptDocument(
        calculation: calc1,
        invoiceNumber: docNumber1,
        businessName: vm1.config['business_name'],
        businessRuc: vm1.config['ruc'],
        businessAddress: vm1.config['address'],
        businessPhone: vm1.config['phone'],
        date: DateTime(2026, 10, 20, 10, 30),
        cashGivenNio: 200.0,
      );

      final text58_1 = fmt58.formatReceiptDocumentText(doc1);
      final text80_1 = fmt80.formatReceiptDocumentText(doc1);
      final escPos58_1 = fmt58.formatReceiptDocumentEscPos(doc1);
      final escPos80_1 = fmt80.formatReceiptDocumentEscPos(doc1);

      _assertTrue(escPos58_1.isNotEmpty, 'Case 1 58mm ESC/POS non-empty');
      _assertTrue(escPos80_1.isNotEmpty, 'Case 1 80mm ESC/POS non-empty');

      final escText58_1 = latin1.decode(escPos58_1, allowInvalid: true);
      final escText80_1 = latin1.decode(escPos80_1, allowInvalid: true);

      for (final entry in <String, String>{
        '58mm': text58_1,
        '80mm': text80_1,
        '58mm_escpos': escText58_1,
        '80mm_escpos': escText80_1,
      }.entries) {
        final label = entry.key;
        final ticket = entry.value;
        _assertContains(ticket, 'NOTA DE VENTA', 'Case 1 [$label] NOTA DE VENTA');
        _assertContains(ticket, 'NV-00000001', 'Case 1 [$label] NV-00000001');
        _assertContains(
          ticket,
          'DOCUMENTO NO FISCAL',
          'Case 1 [$label] DOCUMENTO NO FISCAL',
        );
        _assertContains(
          ticket,
          'NO VALIDO COMO FACTURA',
          'Case 1 [$label] NO VALIDO COMO FACTURA',
        );
        _assertContains(
          ticket,
          'SOLO CONTROL INTERNO',
          'Case 1 [$label] SOLO CONTROL INTERNO',
        );

        _assertNotContains(
          ticket,
          'FACTURA DE VENTA',
          'Case 1 [$label] no FACTURA DE VENTA',
        );
        _assertNotContains(
          ticket,
          'CONTRIBUYENTE',
          'Case 1 [$label] no CONTRIBUYENTE',
        );
        _assertNotContains(
          ticket,
          'REGIMEN:',
          'Case 1 [$label] no REGIMEN:',
        );
        _assertNotContains(ticket, 'RUC:', 'Case 1 [$label] no RUC:');
        _assertNotContains(ticket, 'IVA', 'Case 1 [$label] no IVA');
        _assertNotContains(
          ticket,
          'VENTA EXENTA',
          'Case 1 [$label] no VENTA EXENTA',
        );
        _assertNotContains(
          ticket,
          'Autorización DGI',
          'Case 1 [$label] no Autorización DGI',
        );
        _assertNotContains(
          ticket,
          'Autorizacion DGI',
          'Case 1 [$label] no Autorizacion DGI',
        );
      }

      passed++;
      _log(
        'E2E_RESULT: PASS [1/3] CONTROL_INTERNO setup without RUC, NV-00000001, 0% IVA, and honest 58mm/80mm + ESC/POS tickets verified',
      );

      // Persist NV-00000027 in real SQLite invoices before formalizing to CUOTA_FIJA
      await invoiceDao1.insertInvoice(
        InvoiceEntity(
          id: 'e2e-nv-1-27',
          number: 'NV-00000027',
          createdAt: DateTime.now().millisecondsSinceEpoch,
          userId: 'e2e-cashier',
          subtotal: calc1.subtotal,
          totalTax: 0.0,
          total: calc1.total,
        ),
      );

      // =======================================================================
      // CASE 2 — Smooth Formalization Transition (CONTROL_INTERNO -> CUOTA_FIJA)
      // =======================================================================
      _log(
        'E2E_CASE: [2/3] Smooth Formalization Transition (CONTROL_INTERNO -> CUOTA_FIJA)',
      );

      await vm1.saveConfig({
        ...vm1.config,
        'tax_regime': 'CUOTA_FIJA',
        'ruc': '0011203900012A',
      });

      final persistedPrefix2 =
          (await configDao1.getConfigByKey('dgi_prefix'))?.value;
      final persistedCurrent2 =
          (await configDao1.getConfigByKey('dgi_current_number'))?.value;
      _assertTrue(
        persistedPrefix2 == '',
        'Case 2 SQLite dgi_prefix cleared to empty (got "$persistedPrefix2")',
      );
      _assertTrue(
        persistedCurrent2 == '1',
        'Case 2 SQLite dgi_current_number reset to 1 (got "$persistedCurrent2")',
      );

      final docNumber2 = await numbering1.getNextNumber();
      _assertTrue(
        docNumber2 == '1' || docNumber2 == '00000001',
        'Case 2 DgiNumberingServiceImpl.getNextNumber() == 1 or 00000001 (got $docNumber2)',
      );

      final calc2 = calculator.calculate(
        cart: const [
          CartItem(
            productId: 'prod-taxed',
            productName: 'Gaseosa 1L',
            quantity: 1,
            unitPrice: 100.0,
            taxRate: 0.15,
          ),
        ],
        taxRegime: TaxRegime.cuotaFija,
        commercialRate: 36.50,
        bcnOfficialRate: 36.6241,
      );

      _assertClose(calc2.totalTax, 0.0, 'Case 2 totalTax == 0.0');
      _assertClose(calc2.total, 100.0, 'Case 2 total == 100.0');

      final doc2 = calculator.buildReceiptDocument(
        calculation: calc2,
        invoiceNumber: docNumber2,
        businessName: vm1.config['business_name'],
        businessRuc: vm1.config['ruc'],
        businessAddress: vm1.config['address'],
        businessPhone: vm1.config['phone'],
        date: DateTime(2026, 10, 20, 11, 0),
        cashGivenNio: 100.0,
      );

      final text58_2 = fmt58.formatReceiptDocumentText(doc2);
      final text80_2 = fmt80.formatReceiptDocumentText(doc2);
      final escPos58_2 = fmt58.formatReceiptDocumentEscPos(doc2);
      final escPos80_2 = fmt80.formatReceiptDocumentEscPos(doc2);

      _assertTrue(escPos58_2.isNotEmpty, 'Case 2 58mm ESC/POS non-empty');
      _assertTrue(escPos80_2.isNotEmpty, 'Case 2 80mm ESC/POS non-empty');

      for (final entry in <String, String>{
        '58mm': text58_2,
        '80mm': text80_2,
        '58mm_escpos': latin1.decode(escPos58_2, allowInvalid: true),
        '80mm_escpos': latin1.decode(escPos80_2, allowInvalid: true),
      }.entries) {
        final label = entry.key;
        final ticket = entry.value;
        _assertContains(
          ticket,
          'COMPROBANTE DE VENTA',
          'Case 2 [$label] COMPROBANTE DE VENTA',
        );
        _assertContains(
          ticket,
          'REGIMEN: CUOTA FIJA',
          'Case 2 [$label] REGIMEN: CUOTA FIJA',
        );
        _assertContains(
          ticket,
          'CONTRIBUYENTE DE CUOTA FIJA',
          'Case 2 [$label] CONTRIBUYENTE DE CUOTA FIJA',
        );
        _assertContains(
          ticket,
          'NO RECAUDA IVA',
          'Case 2 [$label] NO RECAUDA IVA',
        );
        _assertContains(
          ticket,
          'RUC: 0011203900012A',
          'Case 2 [$label] RUC: 0011203900012A',
        );
        _assertNotContains(
          ticket,
          'DOCUMENTO NO FISCAL',
          'Case 2 [$label] no DOCUMENTO NO FISCAL',
        );
      }

      passed++;
      _log(
        'E2E_RESULT: PASS [2/3] CONTROL_INTERNO -> CUOTA_FIJA transition cleared NV-, reset consecutive to $docNumber2, 0% IVA, and preserved Cuota Fija ticket',
      );

      // =======================================================================
      // CASE 3 — Smooth Formalization Transition (CONTROL_INTERNO -> REGIMEN_GENERAL)
      // =======================================================================
      _log(
        'E2E_CASE: [3/3] Smooth Formalization Transition (CONTROL_INTERNO -> REGIMEN_GENERAL)',
      );

      db2 = await $FloorAppDatabase.databaseBuilder(db2Path).build();
      final configDao2 = db2.localConfigDao;
      final invoiceDao2 = db2.invoiceDao;
      final vm2 = BusinessProfileViewModel(configDao2);
      final numbering2 = DgiNumberingServiceImpl(configDao2, invoiceDao2);

      await vm2.loadConfig();
      await vm2.saveConfig({
        ...vm2.config,
        'business_name': 'Ferretería El Roble',
        'ruc': '',
        'address': 'Carretera Norte Km 4',
        'phone': '2244-5566',
        'tax_regime': 'CONTROL_INTERNO',
        'dgi_prefix': '',
        'dgi_range_start': '',
        'dgi_current_number': '',
      });

      final issuedNv = await numbering2.getNextNumber();
      _assertTrue(
        issuedNv == 'NV-00000001',
        'Case 3 initial CONTROL_INTERNO number == NV-00000001 (got $issuedNv)',
      );
      await numbering2.incrementNumber();
      _assertTrue(
        (await configDao2.getConfigByKey('dgi_current_number'))?.value == '2',
        'Case 3 cursor advanced to 2 after issuing NV-00000001',
      );

      // Persist NV-00000027 in real SQLite invoices before formalizing to REGIMEN_GENERAL
      await invoiceDao2.insertInvoice(
        InvoiceEntity(
          id: 'e2e-nv-2-27',
          number: 'NV-00000027',
          createdAt: DateTime.now().millisecondsSinceEpoch,
          userId: 'e2e-cashier',
          subtotal: 100.0,
          totalTax: 0.0,
          total: 100.0,
        ),
      );

      // Reload VM config so it reflects current SQLite state, then upgrade
      await vm2.loadConfig();
      await vm2.saveConfig({
        ...vm2.config,
        'tax_regime': 'REGIMEN_GENERAL',
        'ruc': 'J0310000001234',
      });

      final persistedPrefix3 =
          (await configDao2.getConfigByKey('dgi_prefix'))?.value;
      final persistedCurrent3 =
          (await configDao2.getConfigByKey('dgi_current_number'))?.value;
      _assertTrue(
        persistedPrefix3 == 'F-',
        'Case 3 SQLite dgi_prefix == F- (got "$persistedPrefix3")',
      );
      _assertTrue(
        persistedCurrent3 == '1',
        'Case 3 SQLite dgi_current_number == 1 (got "$persistedCurrent3")',
      );

      final docNumber3 = await numbering2.getNextNumber();
      _assertTrue(
        docNumber3 == 'F-00000001',
        'Case 3 DgiNumberingServiceImpl.getNextNumber() == F-00000001 (got $docNumber3)',
      );

      // Also verify custom start ('F-00000500') when operator enters explicit dgi_current_number/dgi_range_start
      await vm2.saveConfig({
        ...vm2.config,
        'tax_regime': 'CONTROL_INTERNO',
        'dgi_prefix': 'NV-',
        'dgi_current_number': '27',
        'dgi_range_start': '',
      });
      await vm2.loadConfig();
      await vm2.saveConfig({
        ...vm2.config,
        'tax_regime': 'REGIMEN_GENERAL',
        'ruc': 'J0310000001234',
        'dgi_prefix': 'NV-',
        'dgi_current_number': '500',
        'dgi_range_start': '500',
      });
      final customStartNumber = await numbering2.getNextNumber();
      _assertTrue(
        customStartNumber == 'F-00000500',
        'Case 3 custom start DgiNumberingServiceImpl.getNextNumber() == F-00000500 (got $customStartNumber)',
      );

      final calc3 = calculator.calculate(
        cart: const [
          CartItem(
            productId: 'prod-hammer',
            productName: 'Martillo Carpintero',
            quantity: 1,
            unitPrice: 100.0,
            taxRate: 0.15,
          ),
        ],
        taxRegime: TaxRegime.regimenGeneral,
        commercialRate: 36.50,
        bcnOfficialRate: 36.6241,
      );

      _assertClose(calc3.totalTax, 15.0, 'Case 3 totalTax == 15.0');
      _assertClose(calc3.total, 115.0, 'Case 3 total == 115.0');

      final doc3 = calculator.buildReceiptDocument(
        calculation: calc3,
        invoiceNumber: docNumber3,
        businessName: vm2.config['business_name'],
        businessRuc: vm2.config['ruc'],
        businessAddress: vm2.config['address'],
        businessPhone: vm2.config['phone'],
        date: DateTime(2026, 10, 20, 12, 0),
        cashGivenNio: 120.0,
      );

      final text58_3 = fmt58.formatReceiptDocumentText(doc3);
      final text80_3 = fmt80.formatReceiptDocumentText(doc3);
      final escPos58_3 = fmt58.formatReceiptDocumentEscPos(doc3);
      final escPos80_3 = fmt80.formatReceiptDocumentEscPos(doc3);

      _assertTrue(escPos58_3.isNotEmpty, 'Case 3 58mm ESC/POS non-empty');
      _assertTrue(escPos80_3.isNotEmpty, 'Case 3 80mm ESC/POS non-empty');

      for (final entry in <String, String>{
        '58mm': text58_3,
        '80mm': text80_3,
        '58mm_escpos': latin1.decode(escPos58_3, allowInvalid: true),
        '80mm_escpos': latin1.decode(escPos80_3, allowInvalid: true),
      }.entries) {
        final label = entry.key;
        final ticket = entry.value;
        _assertContains(
          ticket,
          'FACTURA DE VENTA',
          'Case 3 [$label] FACTURA DE VENTA',
        );
        _assertContains(
          ticket,
          'REGIMEN: GENERAL',
          'Case 3 [$label] REGIMEN: GENERAL',
        );
        _assertContains(
          ticket,
          'RUC: J0310000001234',
          'Case 3 [$label] RUC: J0310000001234',
        );
        _assertContains(ticket, 'IVA', 'Case 3 [$label] IVA');
        _assertContains(ticket, 'F-00000001', 'Case 3 [$label] F-00000001');
        _assertNotContains(
          ticket,
          'DOCUMENTO NO FISCAL',
          'Case 3 [$label] no DOCUMENTO NO FISCAL',
        );
      }

      passed++;
      _log(
        'E2E_RESULT: PASS [3/3] CONTROL_INTERNO -> REGIMEN_GENERAL transition issued F-00000001, 15% IVA (C\$115.00), and valid FACTURA DE VENTA',
      );

      _log('E2E_RESULT: $passed/$total ALL_TESTS_PASSED');
      if (mounted) setState(() => _status = 'ALL_TESTS_PASSED ($passed/$total)');
    } catch (e, st) {
      _log('TEST_FAILED: $e\n$st');
      if (mounted) setState(() => _status = 'TEST_FAILED: $e');
    } finally {
      await db1?.close();
      await db2?.close();
      if (await workDir.exists()) {
        await workDir.delete(recursive: true);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      home: Scaffold(
        appBar: AppBar(title: Text('#1049 S23 E2E — $_status')),
        body: ListView(
          padding: const EdgeInsets.all(16),
          children: _logs.map((l) => Text(l)).toList(),
        ),
      ),
    );
  }
}
