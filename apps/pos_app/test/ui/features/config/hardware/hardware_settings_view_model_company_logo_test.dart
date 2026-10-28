import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/services/company_logo_adoption_service.dart';
import 'package:pos_app/domain/models/config/printer_config.dart';
import 'package:pos_app/domain/services/config/printer_config_service.dart';
import 'package:pos_app/ui/features/config/hardware/hardware_settings_view_model.dart';

/// Company identity parity P4 (S7/L4): the hardware screen learns that the
/// company HAS a cloud logo and offers the ADOPT action — inert by default,
/// manual and explicit, and failure never touches the local raster.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  PrinterConfig configWithTunedLocalLogo() => const PrinterConfig(
        driverType: PrinterDriverType.iPosQ80,
        paperWidthMm: 80,
        headerBusinessName: 'Cafetín Central',
        logoBase64: 'cHJvZHVjdGlvbi10ZXJtaW5hbC1yYXN0ZXI=',
        logoWidth: 192,
        logoHeight: 48,
        isLogoEnabled: true,
      );

  group('HardwareSettingsViewModel — cloud logo adoption (P4)', () {
    test('without an adoption service wired, no affordance and no reference',
        () async {
      final configService = _FakePrinterConfigService(
        configWithTunedLocalLogo(),
      );
      final vm = HardwareSettingsViewModel(configService: configService);
      addTearDown(vm.dispose);
      await vm.loadConfig();

      expect(vm.canAdoptCompanyLogo, isFalse);
      expect(vm.cloudLogoSha256, isNull);
    });

    test('without a cloud reference in the snapshot, the affordance never '
        'appears (inert for the production tenant)', () async {
      final configService = _FakePrinterConfigService(
        configWithTunedLocalLogo(),
      );
      final adoption = _FakeAdoptionService(cloudSha256: null);
      final vm = HardwareSettingsViewModel(
        configService: configService,
        companyLogoAdoption: adoption,
      );
      addTearDown(vm.dispose);
      await vm.loadConfig();

      expect(vm.cloudLogoSha256, isNull);
      expect(vm.canAdoptCompanyLogo, isFalse);
    });

    test('with a cloud reference the affordance appears and adopting '
        'replaces ONLY the raster', () async {
      final configService = _FakePrinterConfigService(
        configWithTunedLocalLogo(),
      );
      final adoption = _FakeAdoptionService(
        cloudSha256: 'd' * 64,
        result: const CompanyLogoAdoptionResult.success(),
        onAdopt: () {
          // The adoption service wrote only the raster: mirror it in the
          // fake source of truth the VM reloads from.
          configService.config = configService.config.copyWith(
            logoBase64: 'YWRvcHRlZC1yYXN0ZXI=',
          );
        },
      );
      final vm = HardwareSettingsViewModel(
        configService: configService,
        companyLogoAdoption: adoption,
      );
      addTearDown(vm.dispose);
      await vm.loadConfig();

      expect(vm.canAdoptCompanyLogo, isTrue);
      expect(vm.cloudLogoSha256, 'd' * 64);

      await vm.adoptCompanyLogo();

      expect(adoption.adoptCallCount, 1);
      expect(vm.config.logoBase64, 'YWRvcHRlZC1yYXN0ZXI=');
      // The local tuning survived: width/height/enabled untouched.
      expect(vm.config.logoWidth, 192);
      expect(vm.config.logoHeight, 48);
      expect(vm.config.isLogoEnabled, isTrue);
      expect(vm.statusMessage, contains('conservaron'));
    });

    test('a failed adoption keeps the config untouched and surfaces the '
        'declared refusal', () async {
      final configService = _FakePrinterConfigService(
        configWithTunedLocalLogo(),
      );
      final adoption = _FakeAdoptionService(
        cloudSha256: 'd' * 64,
        result: const CompanyLogoAdoptionResult.failure(
          'No se pudo descargar el logo de la empresa: socket cerrado. '
          'El logo local quedó intacto.',
        ),
      );
      final vm = HardwareSettingsViewModel(
        configService: configService,
        companyLogoAdoption: adoption,
      );
      addTearDown(vm.dispose);
      await vm.loadConfig();

      final before = vm.config;

      await vm.adoptCompanyLogo();

      expect(adoption.adoptCallCount, 1);
      expect(vm.config.logoBase64, before.logoBase64);
      expect(vm.config.logoWidth, before.logoWidth);
      expect(vm.config.logoHeight, before.logoHeight);
      expect(vm.config.isLogoEnabled, before.isLogoEnabled);
      expect(vm.statusMessage, contains('intacto'));
    });
  });
}

/// Fake [PrinterConfigService] backed by an in-memory [PrinterConfig].
class _FakePrinterConfigService implements PrinterConfigService {
  _FakePrinterConfigService(this.config);

  PrinterConfig config;

  @override
  Future<PrinterConfig> getPrinterConfig() async => config;

  @override
  Future<void> savePrinterConfig(PrinterConfig newConfig) async {
    config = newConfig;
  }

  @override
  Future<bool> isPrinterProfileConfigured() async => true;

  @override
  Future<String?> getTaxRegime() async => null;

  @override
  Future<void> adoptCompanyLogoRaster(String base64Raster) async {
    config = config.copyWith(logoBase64: base64Raster);
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

/// Fake [CompanyLogoAdoptionService]: the adoption contract is pinned by the
/// service-level tests; this fake observes that the VM calls it exactly once
/// and never through [savePrinterConfig].
class _FakeAdoptionService implements CompanyLogoAdoptionService {
  _FakeAdoptionService({
    required this.cloudSha256,
    this.result = const CompanyLogoAdoptionResult.success(),
    this.onAdopt,
  });

  final String? cloudSha256;
  final CompanyLogoAdoptionResult result;
  final void Function()? onAdopt;
  int adoptCallCount = 0;

  @override
  Future<String?> readCloudLogoSha256() async => cloudSha256;

  @override
  Future<CompanyLogoAdoptionResult> adoptCompanyLogo() async {
    adoptCallCount++;
    onAdopt?.call();
    return result;
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}
