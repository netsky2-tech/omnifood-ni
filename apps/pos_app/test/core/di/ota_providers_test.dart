import 'dart:io';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:pos_app/core/di/ota_providers.dart';
import 'package:pos_app/core/platform/target_abi.dart';
import 'package:pos_app/data/daos/local_config_dao.dart';
import 'package:pos_app/data/daos/sales/cashier_session_dao.dart';
import 'package:pos_app/data/models/sales/cashier_session_entity.dart';
import 'package:pos_app/data/services/api_base_url_service.dart';
import 'package:pos_app/domain/models/config/printer_config.dart';
import 'package:pos_app/domain/models/update/release_manifest.dart';
import 'package:pos_app/domain/services/config/printer_config_service.dart';
import 'package:pos_app/domain/services/update/ota_update_coordinator.dart';
import 'package:pos_app/ui/features/config/terminal/terminal_identity_view_model.dart';
import 'package:provider/provider.dart';

class _MockLocalConfigDao extends Mock implements LocalConfigDao {}

class _MockCashierSessionDao extends Mock implements CashierSessionDao {}

class _MockPrinterConfigService extends Mock implements PrinterConfigService {}

/// Records every URL the discovery Dio actually requests, so the test can
/// observe which resolver tier produced the transport (T5).
class _RecordingAdapter implements HttpClientAdapter {
  final List<String> requestedUrls = <String>[];

  @override
  void close({bool force = false}) {}

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requestedUrls.add(options.uri.toString());
    return ResponseBody.fromString('', 204);
  }
}

final ReleaseManifest _sampleManifest = ReleaseManifest(
  channel: 'pilot',
  abi: TargetAbi.arm64v8a,
  versionCode: 2002,
  versionName: '1.0.2',
  sha256: 'c' * 64,
  sizeBytes: 32000000,
  downloadUrl: Uri.parse('https://r2.test/app.apk'),
  minFromVersionCode: 2001,
  mandatory: false,
  publishedAt: DateTime.utc(2026),
);

CashierSessionEntity _session({bool isClosed = false}) => CashierSessionEntity(
      id: 'session-1',
      userId: 'user-1',
      openedAt: 0,
      isClosed: isClosed,
    );

PackageInfo _testPackageInfo() => PackageInfo(
      appName: 'OmniFood POS',
      packageName: 'com.nhilos.pos_app',
      version: '1.0.0',
      buildNumber: '2001',
      buildSignature: '',
    );

void main() {
  late _MockLocalConfigDao configDao;
  late _MockCashierSessionDao cashierSessionDao;
  late _MockPrinterConfigService printerConfigService;

  setUpAll(() {
    registerFallbackValue(const PrinterConfig());
  });

  setUp(() {
    configDao = _MockLocalConfigDao();
    cashierSessionDao = _MockCashierSessionDao();
    printerConfigService = _MockPrinterConfigService();

    // TerminalIdentityViewModel.load() runs in its constructor; keep it quiet.
    when(() => configDao.getConfigByKey(any())).thenAnswer((_) async => null);
    when(() => printerConfigService.getPrinterConfig())
        .thenAnswer((_) async => const PrinterConfig());
    when(() => cashierSessionDao.getAllSessions())
        .thenAnswer((_) async => <CashierSessionEntity>[]);
  });

  OtaDependencies buildDeps() => buildOtaDependencies(
        localConfigDao: configDao,
        cashierSessionDao: cashierSessionDao,
        discoveryDio: Dio(),
        getStorageDirectory: () async => Directory.systemTemp,
        getPackageInfo: () async => _testPackageInfo(),
        resolveAbi: () => TargetAbi.arm64v8a,
      );

  group('ota_providers — build-time API_URL define (T5, V13)', () {
    test(
        'buildOtaDependencies is the site that supplies the define: a '
        'define-only terminal discovers instead of resolving unconfigured',
        () async {
      // Nothing persisted in local_configs — the persisted tier is empty, so
      // only the build-time define can configure the transport.
      when(() => configDao.getConfigByKey(any())).thenAnswer((_) async => null);

      final adapter = _RecordingAdapter();
      final discoveryDio = Dio(BaseOptions())..httpClientAdapter = adapter;

      final deps = buildOtaDependencies(
        localConfigDao: configDao,
        cashierSessionDao: cashierSessionDao,
        discoveryDio: discoveryDio,
        getStorageDirectory: () async => Directory.systemTemp,
        getPackageInfo: () async => _testPackageInfo(),
        resolveAbi: () => TargetAbi.arm64v8a,
        buildTimeApiUrl: 'https://pilot.example/api',
      );

      final outcome = await deps.otaCoordinator.discoverSilently();

      expect(outcome, isA<OtaDiscoveryUpToDate>(),
          reason: 'the define from the DI factory must reach resolver tier 2 '
              'and produce a real discovery request (204 = up to date), not '
              'OtaDiscoveryUnconfigured');
      expect(
        adapter.requestedUrls.single,
        startsWith('https://pilot.example/api/v1/releases/latest'),
      );
    });
  });

  group('ota_providers — extracted factory', () {
    test('buildOtaDownloadDio uses the unauthenticated download timeouts', () {
      final dio = buildOtaDownloadDio();

      expect(dio.options.connectTimeout, const Duration(seconds: 30));
      expect(dio.options.receiveTimeout, const Duration(minutes: 5));
      expect(
        dio.interceptors.map((i) => i.runtimeType.toString()).where(
              (t) => t.contains('Auth'),
            ),
        isEmpty,
        reason: 'APK downloads must not carry auth interceptors',
      );
    });

    test(
        'builds a coordinator in OtaInitial plus the shared ApiBaseUrlService',
        () {
      final deps = buildDeps();

      expect(deps.otaCoordinator, isA<OtaUpdateCoordinator>());
      expect(deps.otaCoordinator.state, isA<OtaInitial>());
      expect(deps.apiBaseUrlService, isA<ApiBaseUrlService>());
    });

    test('wires the fiscal gate to fail closed on an open cashier shift',
        () async {
      when(() => cashierSessionDao.getAllSessions()).thenAnswer(
        (_) async => [_session()],
      );

      final deps = buildDeps();

      // The gate is exercised through the public download guard: an open
      // shift must block any install attempt before a download starts.
      await deps.otaCoordinator.downloadAndInstall(_sampleManifest);

      final state = deps.otaCoordinator.state;
      expect(state, isA<OtaUpdateAvailable>());
      expect((state as OtaUpdateAvailable).canInstallNow, isFalse);
      verify(() => cashierSessionDao.getAllSessions()).called(1);
    });
  });

  group('ota_providers — app-root registration contract', () {
    // Mirrors the production provider registration in main.dart using the
    // SAME extracted factory, because main() itself is unreachable from
    // tests (widget_test.dart builds its own harness). The providers below
    // mirror the main.dart blocks: coordinator provider first (lazy: false),
    // then the terminal-identity VM provider that reads the already-built
    // instance via context.read instead of constructing one.
    Future<(OtaUpdateCoordinator, TerminalIdentityViewModel)>
        pumpFullRegistration(
      WidgetTester tester, {
      required OtaDependencies deps,
    }) async {
      OtaUpdateCoordinator? rootCoordinator;
      TerminalIdentityViewModel? vmFromProvider;

      await tester.pumpWidget(
        MultiProvider(
          providers: [
            ChangeNotifierProvider<OtaUpdateCoordinator>(
              create: (_) => deps.otaCoordinator,
              lazy: false,
            ),
            ChangeNotifierProvider(
              create: (context) => TerminalIdentityViewModel(
                configDao: configDao,
                printerConfigService: printerConfigService,
                apiBaseUrlService: deps.apiBaseUrlService,
                otaCoordinator: context.read<OtaUpdateCoordinator>(),
                buildTimeApiUrl: '',
              ),
            ),
          ],
          child: Builder(
            builder: (context) {
              rootCoordinator = context.read<OtaUpdateCoordinator>();
              vmFromProvider = context.read<TerminalIdentityViewModel>();
              return const SizedBox();
            },
          ),
        ),
      );
      await tester.pump();

      return (rootCoordinator!, vmFromProvider!);
    }

    testWidgets(
        'coordinator is resolvable from the root providers without the '
        'terminal-identity surface ever being built', (tester) async {
      final deps = buildDeps();

      // Only the coordinator provider + a bare Builder: no
      // TerminalIdentityViewModel, no terminal-identity widget.
      OtaUpdateCoordinator? rootCoordinator;
      await tester.pumpWidget(
        MultiProvider(
          providers: [
            ChangeNotifierProvider<OtaUpdateCoordinator>(
              create: (_) => deps.otaCoordinator,
              lazy: false,
            ),
          ],
          child: Builder(
            builder: (context) {
              rootCoordinator = context.read<OtaUpdateCoordinator>();
              return const SizedBox();
            },
          ),
        ),
      );
      await tester.pump();

      expect(rootCoordinator, isNotNull);
      expect(rootCoordinator, same(deps.otaCoordinator));
      expect(rootCoordinator!.state, isA<OtaInitial>());
    });

    testWidgets(
        'TerminalIdentityViewModel receives the SAME coordinator instance '
        'as the app-root provider (no second coordinator can be built)',
        (tester) async {
      final deps = buildDeps();

      final (rootCoordinator, vm) = await pumpFullRegistration(
        tester,
        deps: deps,
      );

      expect(vm.otaCoordinator, isNotNull);
      expect(
        identical(vm.otaCoordinator, rootCoordinator),
        isTrue,
        reason: 'a second coordinator would run a second discovery state '
            'machine against the same terminal',
      );
      expect(identical(vm.otaCoordinator, deps.otaCoordinator), isTrue);
    });
  });
}
