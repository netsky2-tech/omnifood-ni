import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/services/company_logo_adoption_service.dart';
import 'package:pos_app/domain/models/config/printer_config.dart';
import 'package:pos_app/domain/ports/printer_port.dart';
import 'package:pos_app/domain/services/config/printer_config_service.dart';
import 'package:pos_app/ui/features/config/hardware/hardware_settings_view.dart';
import 'package:pos_app/ui/features/config/hardware/hardware_settings_view_model.dart';
import 'package:provider/provider.dart';

/// Company identity parity P4 (S7/L4): the adoption affordance is INERT
/// unless the adoption service is wired AND the snapshot declares a cloud
/// logo; applying it is an explicit human tap that calls the adoption
/// service exactly once.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  PrinterConfig tunedLocalLogo() => const PrinterConfig(
        driverType: PrinterDriverType.sunmiV2s,
        paperWidthMm: 58,
        headerBusinessName: 'Cafetín Central',
        taxRegime: 'REGIMEN_GENERAL',
        logoBase64: 'cHJvZHVjdGlvbi10ZXJtaW5hbC1yYXN0ZXI=',
        logoWidth: 192,
        logoHeight: 48,
        isLogoEnabled: true,
      );

  HardwareSettingsViewModel? vmRef;

  Widget buildWidget({
    required _FakePrinterConfigService configService,
    required _FakeAdoptionService? adoption,
  }) {
    return ChangeNotifierProvider<HardwareSettingsViewModel>(
      create: (_) {
        final vm = HardwareSettingsViewModel(
        configService: configService,
        printerPort: _ReadyPrinterPort(),
        companyLogoAdoption: adoption,
        );
        vmRef = vm;
        return vm;
      },
      child: const MaterialApp(home: HardwareSettingsView()),
    );
  }

  const adoptButtonLabel = 'Aplicar logo de la empresa';

  testWidgets('a terminal with a local logo and NO cloud logo renders no '
      'adoption affordance (inert for the production tenant)', (tester) async {
    final configService = _FakePrinterConfigService(tunedLocalLogo());
    final adoption = _FakeAdoptionService(cloudSha256: null);

    await tester.pumpWidget(buildWidget(
      configService: configService,
      adoption: adoption,
    ));
    await tester.pumpAndSettle();

    expect(find.text(adoptButtonLabel), findsNothing);
    expect(find.textContaining('logo configurado en la nube'), findsNothing);
    expect(adoption.adoptCallCount, 0);
  });

  testWidgets('without a wired adoption service the affordance never appears',
      (tester) async {
    final configService = _FakePrinterConfigService(tunedLocalLogo());

    await tester.pumpWidget(buildWidget(
      configService: configService,
      adoption: null,
    ));
    await tester.pumpAndSettle();

    expect(find.text(adoptButtonLabel), findsNothing);
  });

  testWidgets('when the snapshot declares a cloud logo, the affordance '
      'appears and one tap applies it exactly once', (tester) async {
    final configService = _FakePrinterConfigService(tunedLocalLogo());
    final adoption = _FakeAdoptionService(
      cloudSha256: 'e' * 64,
      onAdopt: () {
        configService.config = configService.config.copyWith(
          logoBase64: 'YWRvcHRlZC1yYXN0ZXI=',
        );
      },
    );

    await tester.pumpWidget(buildWidget(
      configService: configService,
      adoption: adoption,
    ));
    await tester.pumpAndSettle();

    expect(find.text(adoptButtonLabel), findsOneWidget);

    await tester.ensureVisible(find.text(adoptButtonLabel));
    await tester.pumpAndSettle();
    await tester.tap(find.text(adoptButtonLabel));
    await tester.pumpAndSettle();

    expect(adoption.adoptCallCount, 1);
    // The success message renders in the action card, possibly below the
    // fold on the test surface — assert on the view model's state.
    expect(vmRef!.statusMessage, contains('conservaron'));
  });
}

class _FakePrinterConfigService implements PrinterConfigService {
  _FakePrinterConfigService(this.config);

  PrinterConfig config;

  @override
  Future<PrinterConfig> getPrinterConfig() async => config;

  @override
  Future<bool> isPrinterProfileConfigured() async => true;

  @override
  Future<String?> getTaxRegime() async => 'REGIMEN_GENERAL';

  @override
  Stream<PrinterConfig> get onConfigChanged => const Stream.empty();

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

/// Always-ready printer port so the status card renders without platform
/// channels or ongoing animations (pumpAndSettle must terminate).
class _ReadyPrinterPort implements PrinterPort {
  @override
  Future<PrinterStatus> checkStatus() async => PrinterStatus.ready;

  @override
  dynamic noSuchMethod(Invocation invocation) {
    if (invocation.isMethod) {
      return Future<PrinterResult>.value(
        const PrinterResult(isSuccess: true, status: PrinterStatus.ready),
      );
    }
    return super.noSuchMethod(invocation);
  }
}

class _FakeAdoptionService implements CompanyLogoAdoptionService {
  _FakeAdoptionService({
    required this.cloudSha256,
    this.onAdopt,
  });

  final String? cloudSha256;
  final void Function()? onAdopt;
  int adoptCallCount = 0;

  @override
  Future<String?> readCloudLogoSha256() async => cloudSha256;

  @override
  Future<CompanyLogoAdoptionResult> adoptCompanyLogo() async {
    adoptCallCount++;
    onAdopt?.call();
    return const CompanyLogoAdoptionResult.success();
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}
