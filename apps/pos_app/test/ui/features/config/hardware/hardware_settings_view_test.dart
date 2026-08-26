import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/annotations.dart';
import 'package:mockito/mockito.dart';
import 'package:pos_app/domain/models/config/printer_config.dart';
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
        headerBusinessName: 'OmniFood HW Test',
      ),
    );

    when(mockPrinterPort.checkStatus()).thenAnswer((_) async => PrinterStatus.ready);
    when(mockPrinterPort.printInvoice(
      any,
      items: anyNamed('items'),
      payments: anyNamed('payments'),
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
        businessName: anyNamed('businessName'),
        ruc: anyNamed('ruc'),
      )).called(1);

      expect(find.textContaining('Impresión de prueba enviada'), findsWidgets);
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
