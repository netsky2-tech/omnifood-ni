import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:pos_app/data/daos/local_config_dao.dart';
import 'package:pos_app/data/models/local_config_entity.dart';
import 'package:pos_app/data/services/terminal_identity_service.dart';
import 'package:pos_app/domain/models/config/printer_config.dart';
import 'package:pos_app/domain/services/config/printer_config_service.dart';
import 'package:pos_app/ui/features/config/terminal/terminal_identity_view_model.dart';

class _MockLocalConfigDao extends Mock implements LocalConfigDao {}

class _MockPrinterConfigService extends Mock implements PrinterConfigService {}

/// Runs pending microtasks and zero-duration timers so async view model loads
/// settle deterministically in pure Dart (non-widget) tests.
Future<void> pumpEventLoop() async {
  for (var i = 0; i < 10; i++) {
    await Future<void>.delayed(Duration.zero);
  }
}

LocalConfigEntity _identityEntity(String value) => LocalConfigEntity(
      key: TerminalIdentityService.localDeviceIdKey,
      value: value,
      description: 'test identity',
    );

void main() {
  late _MockLocalConfigDao configDao;
  late _MockPrinterConfigService printerConfigService;

  setUpAll(() {
    registerFallbackValue(
      LocalConfigEntity(key: 'fallback-key', value: 'fallback-value'),
    );
    registerFallbackValue(const PrinterConfig());
  });

  PrinterConfig defaultPrinterConfig({
    PrinterDriverType driverType = PrinterDriverType.sunmiV2s,
    int paperWidthMm = 58,
  }) =>
      PrinterConfig(
        driverType: driverType,
        paperWidthMm: paperWidthMm,
        headerBusinessName: 'OMNIFOOD NI',
      );

  TerminalIdentityViewModel buildViewModel({
    String? persistedValue,
    String buildTimeDeviceId = '',
    PrinterConfig printerConfig = const PrinterConfig(),
  }) {
    when(() => configDao.getConfigByKey(any())).thenAnswer(
      (_) async =>
          persistedValue == null ? null : _identityEntity(persistedValue),
    );
    when(() => printerConfigService.getPrinterConfig())
        .thenAnswer((_) async => printerConfig);
    return TerminalIdentityViewModel(
      configDao: configDao,
      printerConfigService: printerConfigService,
      buildTimeDeviceId: buildTimeDeviceId,
    );
  }

  setUp(() {
    configDao = _MockLocalConfigDao();
    printerConfigService = _MockPrinterConfigService();
  });

  group('TerminalIdentityViewModel build-time id comparison', () {
    // NOTE: the view model exposes a factual comparison only. It can never
    // know WHERE the persisted identity came from; it can only report whether
    // the persisted value equals the compiled build-time id.
    test(
      'reports a match when the persisted value equals the injected build-time id',
      () async {
        final vm = buildViewModel(
          persistedValue: 'POS-TENANT-01',
          buildTimeDeviceId: 'POS-TENANT-01',
        );
        await pumpEventLoop();

        expect(vm.terminalId, equals('POS-TENANT-01'));
        expect(vm.matchesBuildTimeId, isTrue);
        expect(vm.buildTimeId, equals('POS-TENANT-01'));
      },
    );

    test(
      'reports no match when the persisted value differs from the injected build-time id',
      () async {
        final vm = buildViewModel(
          persistedValue: 'pos-local-abc-123',
          buildTimeDeviceId: 'POS-TENANT-01',
        );
        await pumpEventLoop();

        expect(vm.terminalId, equals('pos-local-abc-123'));
        expect(vm.matchesBuildTimeId, isFalse);
        expect(vm.buildTimeId, equals('POS-TENANT-01'));
      },
    );

    test(
      'reports no match when a value is persisted but no build-time id was compiled in',
      () async {
        final vm = buildViewModel(
          persistedValue: 'pos-local-abc-123',
          buildTimeDeviceId: '',
        );
        await pumpEventLoop();

        expect(vm.terminalId, equals('pos-local-abc-123'));
        expect(vm.matchesBuildTimeId, isFalse);
        expect(vm.buildTimeId, isEmpty);
      },
    );

    test(
      'reports no match for a persisted value that differs only by letter case',
      () async {
        final vm = buildViewModel(
          persistedValue: 'pos-tenant-01',
          buildTimeDeviceId: 'POS-TENANT-01',
        );
        await pumpEventLoop();

        expect(vm.terminalId, equals('pos-tenant-01'));
        expect(vm.matchesBuildTimeId, isFalse);
      },
    );

    test(
      'exposes no terminal id and no comparison when nothing is persisted',
      () async {
        final vm = buildViewModel(persistedValue: null);
        await pumpEventLoop();

        expect(vm.terminalId, isNull);
        expect(vm.matchesBuildTimeId, isNull);
        expect(vm.buildTimeId, isEmpty);
      },
    );
  });

  group('TerminalIdentityViewModel printer profile', () {
    test('passes through the active paper width in millimetres', () async {
      final vm = buildViewModel(
        persistedValue: 'POS-TENANT-01',
        buildTimeDeviceId: 'POS-TENANT-01',
        printerConfig: defaultPrinterConfig(paperWidthMm: 80),
      );
      await pumpEventLoop();

      expect(vm.paperWidthMm, equals(80));
    });

    test('maps every driver type to the label shown on the hardware screen',
        () async {
      final expectedLabels = {
        PrinterDriverType.sunmiV2s: 'Sunmi V2s',
        PrinterDriverType.mock: 'Simulador',
        PrinterDriverType.escPosNetwork: 'Red TCP/IP',
        PrinterDriverType.iPosQ80: 'Q80 / iPos',
      };

      for (final entry in expectedLabels.entries) {
        final vm = buildViewModel(
          persistedValue: 'POS-TENANT-01',
          printerConfig: defaultPrinterConfig(driverType: entry.key),
        );
        await pumpEventLoop();

        expect(vm.printerDriverLabel, equals(entry.value),
            reason: 'driver ${entry.key} must map to "${entry.value}"');
      }
    });
  });

  group('TerminalIdentityViewModel loading flag', () {
    test('starts loading and finishes loading once data is available',
        () async {
      when(() => configDao.getConfigByKey(any()))
          .thenAnswer((_) async => _identityEntity('POS-TENANT-01'));
      when(() => printerConfigService.getPrinterConfig())
          .thenAnswer((_) async => defaultPrinterConfig());

      final vm = TerminalIdentityViewModel(
        configDao: configDao,
        printerConfigService: printerConfigService,
      );
      expect(vm.isLoading, isTrue);

      await pumpEventLoop();
      expect(vm.isLoading, isFalse);
    });
  });

  group('TerminalIdentityViewModel read-only guarantee', () {
    test(
      'never writes to the DAO when a persisted identity matches the build-time id',
      () async {
        final vm = buildViewModel(
          persistedValue: 'POS-TENANT-01',
          buildTimeDeviceId: 'POS-TENANT-01',
        );
        await pumpEventLoop();

        verifyNever(() => configDao.saveConfig(any()));
        verifyNever(() => configDao.deleteConfig(any()));
        expect(vm.terminalId, equals('POS-TENANT-01'));
      },
    );

    test(
      'never writes to the DAO when a persisted identity differs from the build-time id',
      () async {
        final vm = buildViewModel(
          persistedValue: 'pos-local-abc-123',
          buildTimeDeviceId: 'POS-TENANT-01',
        );
        await pumpEventLoop();

        verifyNever(() => configDao.saveConfig(any()));
        verifyNever(() => configDao.deleteConfig(any()));
      },
    );

    test(
      'never writes to the DAO when a value is persisted but no build-time id was compiled in',
      () async {
        final vm = buildViewModel(
          persistedValue: 'pos-local-abc-123',
          buildTimeDeviceId: '',
        );
        await pumpEventLoop();

        verifyNever(() => configDao.saveConfig(any()));
        verifyNever(() => configDao.deleteConfig(any()));
      },
    );

    test(
      'never writes to the DAO when no identity is persisted (must not generate)',
      () async {
        final vm = buildViewModel(persistedValue: null);
        await pumpEventLoop();

        verifyNever(() => configDao.saveConfig(any()));
        verifyNever(() => configDao.deleteConfig(any()));
        verifyNever(() => printerConfigService.savePrinterConfig(any()));
        expect(vm.terminalId, isNull);
      },
    );
  });
}
