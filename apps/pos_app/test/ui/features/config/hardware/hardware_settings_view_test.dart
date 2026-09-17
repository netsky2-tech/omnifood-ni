import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/annotations.dart';
import 'package:mockito/mockito.dart';
import 'package:pos_app/domain/models/config/printer_config.dart';
import 'package:pos_app/domain/models/config/tax_regime.dart';
import 'package:pos_app/domain/ports/printer_port.dart';
import 'package:pos_app/domain/services/config/printer_config_service.dart';
import 'package:pos_app/ui/features/config/hardware/hardware_settings_view.dart';
import 'package:pos_app/ui/features/config/hardware/hardware_settings_view_model.dart';
import 'package:provider/provider.dart';

import 'hardware_settings_view_test.mocks.dart';

@GenerateNiceMocks([
  MockSpec<PrinterConfigService>(),
  MockSpec<PrinterPort>(),
])
void main() {
  late MockPrinterConfigService mockConfigService;
  late MockPrinterPort mockPrinterPort;

  setUp(() {
    mockConfigService = MockPrinterConfigService();
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
        configService: mockConfigService,
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
}
