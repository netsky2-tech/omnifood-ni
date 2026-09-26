import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/annotations.dart';
import 'package:mockito/mockito.dart';
import 'package:pos_app/domain/models/config/printer_config.dart';
import 'package:pos_app/domain/models/config/tax_regime.dart';
import 'package:pos_app/domain/models/sales/invoice.dart';
import 'package:pos_app/domain/models/sales/invoice_item.dart';
import 'package:pos_app/domain/ports/printer_port.dart';
import 'package:pos_app/domain/services/config/printer_config_service.dart';
import 'package:pos_app/ui/features/config/hardware/hardware_settings_view.dart';
import 'package:pos_app/ui/features/config/hardware/hardware_settings_view_model.dart';
import 'package:provider/provider.dart';

import 'hardware_settings_view_test.mocks.dart';

/// Thin spy around the generated Mockito mock.
///
/// The committed generated mock predates `isPrinterProfileConfigured` and
/// `confirmPrinterProfile`; invoking those members on the raw mock fails at
/// runtime (missing-member noSuchMethod forwarder returns null for a
/// non-nullable Future). The spy owns the profile state itself and delegates
/// every other member to the Mockito mock so existing stubs/verifies keep
/// working without regenerating mocks.
class _PrinterConfigServiceSpy implements PrinterConfigService {
  _PrinterConfigServiceSpy(this._delegate);

  final PrinterConfigService _delegate;
  bool profileConfigured = true;
  int confirmCallCount = 0;
  PrinterDriverType? confirmedDriverType;
  int? confirmedPaperWidthMm;

  @override
  Stream<PrinterConfig> get onConfigChanged => _delegate.onConfigChanged;

  @override
  Future<PrinterConfig> getPrinterConfig() => _delegate.getPrinterConfig();

  @override
  Future<void> savePrinterConfig(PrinterConfig config) =>
      _delegate.savePrinterConfig(config);

  @override
  Future<bool> isPrinterProfileConfigured() async => profileConfigured;

  @override
  Future<void> confirmPrinterProfile({
    required PrinterDriverType driverType,
    required int paperWidthMm,
  }) async {
    confirmCallCount++;
    confirmedDriverType = driverType;
    confirmedPaperWidthMm = paperWidthMm;
    profileConfigured = true;
  }

  @override
  void dispose() => _delegate.dispose();
}

@GenerateNiceMocks([
  MockSpec<PrinterConfigService>(),
  MockSpec<PrinterPort>(),
])
void main() {
  late MockPrinterConfigService mockConfigService;
  late _PrinterConfigServiceSpy configServiceSpy;
  late MockPrinterPort mockPrinterPort;

  setUp(() {
    mockConfigService = MockPrinterConfigService();
    configServiceSpy = _PrinterConfigServiceSpy(mockConfigService);
    mockPrinterPort = MockPrinterPort();

    when(mockConfigService.getPrinterConfig()).thenAnswer(
      (_) async => const PrinterConfig(
        driverType: PrinterDriverType.sunmiV2s,
        autoPrintInvoice: true,
        autoPrintKitchen: false,
        openDrawerOnCash: true,
        paperWidthMm: 58,
        headerBusinessName: 'NHILOS POS HW Test',
        taxRegime: 'REGIMEN_GENERAL',
      ),
    );

    when(mockPrinterPort.checkStatus()).thenAnswer((_) async => PrinterStatus.ready);
    when(mockPrinterPort.printInvoice(
      any,
      items: anyNamed('items'),
      payments: anyNamed('payments'),
      taxRegime: TaxRegime.regimenGeneral,
      businessName: anyNamed('businessName'),
      ruc: anyNamed('ruc'),
    )).thenAnswer((_) async => PrinterResult.success());
    when(mockPrinterPort.openCashDrawer()).thenAnswer((_) async => PrinterResult.success());
  });

  Widget buildTestWidget() {
    return ChangeNotifierProvider<HardwareSettingsViewModel>(
      create: (_) => HardwareSettingsViewModel(
        configService: configServiceSpy,
        printerPort: mockPrinterPort,
      ),
      child: const MaterialApp(
        home: HardwareSettingsView(),
      ),
    );
  }

  group('HardwareSettingsView Tests', () {
    testWidgets('renders hardware status card, driver selector, and action buttons', (tester) async {
      await tester.pumpWidget(buildTestWidget());
      await tester.pumpAndSettle();

      expect(find.text('Ajustes de Hardware e Impresora'), findsOneWidget);
      expect(find.text('Impresora Conectada y Lista'), findsOneWidget);
      expect(find.text('Controlador de Impresión (Driver)'), findsOneWidget);
      expect(find.text('Sunmi V2s'), findsOneWidget);
      expect(find.text('Simulador'), findsOneWidget);
      expect(find.text('Reglas de Impresión Automática'), findsOneWidget);
      expect(find.byKey(const Key('test_print_button')), findsOneWidget);
      expect(find.byKey(const Key('test_drawer_button')), findsOneWidget);
    });

    testWidgets('tapping test print triggers printInvoice and shows feedback', (tester) async {
      tester.view.physicalSize = const Size(1024, 1000);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() => tester.view.resetPhysicalSize());

      await tester.pumpWidget(buildTestWidget());
      await tester.pumpAndSettle();

      final printButton = find.byKey(const Key('test_print_button'));
      await tester.ensureVisible(printButton);
      await tester.pumpAndSettle();

      await tester.tap(printButton);
      await tester.pumpAndSettle();

      verify(mockPrinterPort.printInvoice(
        any,
        items: anyNamed('items'),
        payments: anyNamed('payments'),
        taxRegime: TaxRegime.regimenGeneral,
        businessName: anyNamed('businessName'),
        ruc: anyNamed('ruc'),
      )).called(1);

      expect(find.textContaining('Impresión de prueba enviada'), findsWidgets);
    });

    testWidgets(
        'B2e D-3: test print sample derives its fiscal amounts from the configured tax regime',
        (tester) async {
      tester.view.physicalSize = const Size(1024, 1000);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() => tester.view.resetPhysicalSize());

      Object? capturedInvoice;
      List<Object?>? capturedItems;
      when(mockPrinterPort.printInvoice(
        any,
        items: anyNamed('items'),
        payments: anyNamed('payments'),
        businessName: anyNamed('businessName'),
        legalName: anyNamed('legalName'),
        ruc: anyNamed('ruc'),
        address: anyNamed('address'),
        phone: anyNamed('phone'),
        logoRasterBytes: anyNamed('logoRasterBytes'),
        taxRegime: anyNamed('taxRegime'),
        isTaxExempt: anyNamed('isTaxExempt'),
        paperWidthMm: anyNamed('paperWidthMm'),
      )).thenAnswer((Invocation invocation) async {
        capturedInvoice = invocation.positionalArguments.first;
        capturedItems =
            invocation.namedArguments[const Symbol('items')] as List<Object?>?;
        return PrinterResult.success();
      });

      // CUOTA_FIJA: the diagnostic ticket must never carry an invented 15%.
      when(mockConfigService.getPrinterConfig()).thenAnswer(
        (_) async => const PrinterConfig(
          driverType: PrinterDriverType.sunmiV2s,
          paperWidthMm: 58,
          headerBusinessName: 'NHILOS POS HW Test',
          taxRegime: 'CUOTA_FIJA',
        ),
      );

      await tester.pumpWidget(buildTestWidget());
      await tester.pumpAndSettle();

      final printButton = find.byKey(const Key('test_print_button'));
      await tester.ensureVisible(printButton);
      await tester.pumpAndSettle();
      await tester.tap(printButton);
      await tester.pumpAndSettle();

      final invoice = capturedInvoice as Invoice;
      expect(invoice.totalTax, equals(0.0));
      expect(invoice.total, equals(100.0));
      final item = capturedItems!.single as InvoiceItem;
      expect(item.originalTaxRate, equals(0.0));
      expect(item.appliedTaxRate, equals(0.0));
      expect(item.taxAmount, equals(0.0));
      expect(item.total, equals(100.0));
    });

    testWidgets(
        'B2e D-3: test print under REGIMEN_GENERAL keeps the 15% sample amounts',
        (tester) async {
      tester.view.physicalSize = const Size(1024, 1000);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() => tester.view.resetPhysicalSize());

      Object? capturedInvoice;
      when(mockPrinterPort.printInvoice(
        any,
        items: anyNamed('items'),
        payments: anyNamed('payments'),
        businessName: anyNamed('businessName'),
        legalName: anyNamed('legalName'),
        ruc: anyNamed('ruc'),
        address: anyNamed('address'),
        phone: anyNamed('phone'),
        logoRasterBytes: anyNamed('logoRasterBytes'),
        taxRegime: anyNamed('taxRegime'),
        isTaxExempt: anyNamed('isTaxExempt'),
        paperWidthMm: anyNamed('paperWidthMm'),
      )).thenAnswer((Invocation invocation) async {
        capturedInvoice = invocation.positionalArguments.first;
        return PrinterResult.success();
      });

      when(mockConfigService.getPrinterConfig()).thenAnswer(
        (_) async => const PrinterConfig(
          driverType: PrinterDriverType.sunmiV2s,
          paperWidthMm: 58,
          headerBusinessName: 'NHILOS POS HW Test',
          taxRegime: 'REGIMEN_GENERAL',
        ),
      );

      await tester.pumpWidget(buildTestWidget());
      await tester.pumpAndSettle();

      final printButton = find.byKey(const Key('test_print_button'));
      await tester.ensureVisible(printButton);
      await tester.pumpAndSettle();
      await tester.tap(printButton);
      await tester.pumpAndSettle();

      final invoice = capturedInvoice as Invoice;
      expect(invoice.totalTax, equals(15.0));
      expect(invoice.total, equals(115.0));
    });

    testWidgets('preview prints the locally persisted issuer RUC, never the header override',
        (tester) async {
      tester.view.physicalSize = const Size(1024, 1000);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() => tester.view.resetPhysicalSize());

      when(mockConfigService.getPrinterConfig()).thenAnswer(
        (_) async => const PrinterConfig(
          driverType: PrinterDriverType.sunmiV2s,
          paperWidthMm: 80,
          headerBusinessName: 'NHILOS POS HW Test',
          taxRegime: 'CUOTA_FIJA',
          fiscalRuc: 'J0310000000001',
          headerRuc: 'J0310000999999',
        ),
      );

      String? capturedRuc;
      when(mockPrinterPort.printInvoice(
        any,
        items: anyNamed('items'),
        payments: anyNamed('payments'),
        businessName: anyNamed('businessName'),
        legalName: anyNamed('legalName'),
        ruc: anyNamed('ruc'),
        address: anyNamed('address'),
        phone: anyNamed('phone'),
        logoRasterBytes: anyNamed('logoRasterBytes'),
        taxRegime: anyNamed('taxRegime'),
        isTaxExempt: anyNamed('isTaxExempt'),
        paperWidthMm: anyNamed('paperWidthMm'),
      )).thenAnswer((Invocation invocation) async {
        capturedRuc = invocation.namedArguments[const Symbol('ruc')] as String?;
        return PrinterResult.success();
      });

      await tester.pumpWidget(buildTestWidget());
      await tester.pumpAndSettle();
      final printButton = find.byKey(const Key('test_print_button'));
      await tester.ensureVisible(printButton);
      await tester.pumpAndSettle();
      await tester.tap(printButton);
      await tester.pumpAndSettle();

      expect(capturedRuc, equals('J0310000000001'));
    });

    testWidgets('preview never fabricates a RUC when nothing is configured',
        (tester) async {
      tester.view.physicalSize = const Size(1024, 1000);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() => tester.view.resetPhysicalSize());

      when(mockConfigService.getPrinterConfig()).thenAnswer(
        (_) async => const PrinterConfig(
          driverType: PrinterDriverType.sunmiV2s,
          paperWidthMm: 80,
          headerBusinessName: 'NHILOS POS HW Test',
          taxRegime: 'CUOTA_FIJA',
        ),
      );

      String? capturedRuc = 'sentinel';
      when(mockPrinterPort.printInvoice(
        any,
        items: anyNamed('items'),
        payments: anyNamed('payments'),
        businessName: anyNamed('businessName'),
        legalName: anyNamed('legalName'),
        ruc: anyNamed('ruc'),
        address: anyNamed('address'),
        phone: anyNamed('phone'),
        logoRasterBytes: anyNamed('logoRasterBytes'),
        taxRegime: anyNamed('taxRegime'),
        isTaxExempt: anyNamed('isTaxExempt'),
        paperWidthMm: anyNamed('paperWidthMm'),
      )).thenAnswer((Invocation invocation) async {
        capturedRuc = invocation.namedArguments[const Symbol('ruc')] as String?;
        return PrinterResult.success();
      });

      await tester.pumpWidget(buildTestWidget());
      await tester.pumpAndSettle();
      final printButton = find.byKey(const Key('test_print_button'));
      await tester.ensureVisible(printButton);
      await tester.pumpAndSettle();
      await tester.tap(printButton);
      await tester.pumpAndSettle();

      expect(capturedRuc, isNull);
    });

    testWidgets('tapping test drawer triggers openCashDrawer and shows feedback', (tester) async {
      tester.view.physicalSize = const Size(1024, 1000);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() => tester.view.resetPhysicalSize());

      await tester.pumpWidget(buildTestWidget());
      await tester.pumpAndSettle();

      final drawerButton = find.byKey(const Key('test_drawer_button'));
      await tester.ensureVisible(drawerButton);
      await tester.pumpAndSettle();

      await tester.tap(drawerButton);
      await tester.pumpAndSettle();

      verify(mockPrinterPort.openCashDrawer()).called(1);
      expect(find.textContaining('Pulso de apertura'), findsWidgets);
    });
  });

  group('HardwareSettingsViewModel printer profile state (L1-08b)', () {
    test('reports the profile as unconfigured when the service says so', () async {
      configServiceSpy.profileConfigured = false;
      final viewModel = HardwareSettingsViewModel(
        configService: configServiceSpy,
        printerPort: mockPrinterPort,
      );
      await pumpEventQueue();

      expect(viewModel.isProfileConfigured, isFalse);
      viewModel.dispose();
    });

    test('reports the profile as configured when the service says so', () async {
      configServiceSpy.profileConfigured = true;
      final viewModel = HardwareSettingsViewModel(
        configService: configServiceSpy,
        printerPort: mockPrinterPort,
      );
      await pumpEventQueue();

      expect(viewModel.isProfileConfigured, isTrue);
      viewModel.dispose();
    });

    test('confirming the profile persists it and refreshes the configured state', () async {
      configServiceSpy.profileConfigured = false;
      final viewModel = HardwareSettingsViewModel(
        configService: configServiceSpy,
        printerPort: mockPrinterPort,
      );
      await pumpEventQueue();

      expect(viewModel.canConfirmPrinterProfile, isFalse);
      viewModel.selectDriverType(PrinterDriverType.mock);
      viewModel.selectPaperWidth(80);
      expect(viewModel.canConfirmPrinterProfile, isTrue);

      await viewModel.confirmPrinterProfile();

      expect(configServiceSpy.confirmCallCount, 1);
      expect(configServiceSpy.confirmedDriverType, PrinterDriverType.mock);
      expect(configServiceSpy.confirmedPaperWidthMm, 80);
      expect(viewModel.isProfileConfigured, isTrue);
      viewModel.dispose();
    });
  });

  group('HardwareSettingsView unconfigured printer profile (L1-08b)', () {
    testWidgets(
        'shows the explicit unconfigured state, requires explicit confirmation, then switches to the configured presentation',
        (tester) async {
      configServiceSpy.profileConfigured = false;
      await tester.pumpWidget(buildTestWidget());
      await tester.pumpAndSettle();

      expect(find.text('Perfil de impresora sin configurar'), findsOneWidget);
      expect(find.textContaining('nunca configuró'), findsWidgets);
      final confirmButton =
          find.byKey(const Key('confirm_printer_profile_button'));
      expect(tester.widget<FilledButton>(confirmButton).onPressed, isNull);

      await tester.tap(find.text('Simulador'));
      await tester.pump();
      final widthSegment = find.text('80 mm (44 columnas)');
      await tester.ensureVisible(widthSegment);
      await tester.pumpAndSettle();
      await tester.tap(widthSegment);
      await tester.pump();

      expect(tester.widget<FilledButton>(confirmButton).onPressed, isNotNull);

      await tester.ensureVisible(confirmButton);
      await tester.pumpAndSettle();
      await tester.tap(confirmButton);
      await tester.pumpAndSettle();

      expect(configServiceSpy.confirmCallCount, 1);
      expect(configServiceSpy.confirmedDriverType, PrinterDriverType.mock);
      expect(configServiceSpy.confirmedPaperWidthMm, 80);
      expect(find.text('Perfil de impresora sin configurar'), findsNothing);
    });

    testWidgets(
        'rule toggles keep saving without materialising the profile while unconfigured',
        (tester) async {
      configServiceSpy.profileConfigured = false;
      await tester.pumpWidget(buildTestWidget());
      await tester.pumpAndSettle();

      final kitchenSwitch = find.text('Impresión automática a Cocina');
      await tester.ensureVisible(kitchenSwitch);
      await tester.pumpAndSettle();
      await tester.tap(kitchenSwitch);
      await tester.pumpAndSettle();

      verify(mockConfigService.savePrinterConfig(any)).called(1);
      expect(configServiceSpy.confirmCallCount, 0);
      expect(find.text('Perfil de impresora sin configurar'), findsOneWidget);
    });
  });

  group('HardwareSettingsView configured printer profile (L1-08b)', () {
    testWidgets(
        'keeps today behaviour: selections reflect the stored profile and persist on change',
        (tester) async {
      configServiceSpy.profileConfigured = true;
      await tester.pumpWidget(buildTestWidget());
      await tester.pumpAndSettle();

      expect(find.text('Perfil de impresora sin configurar'), findsNothing);

      await tester.tap(find.text('Simulador'));
      await tester.pumpAndSettle();

      verify(mockConfigService.savePrinterConfig(any)).called(1);
    });
  });
}
