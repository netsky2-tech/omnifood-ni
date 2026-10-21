import 'dart:io';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:pos_app/core/platform/target_abi.dart';
import 'package:pos_app/data/services/api_base_url_service.dart';
import 'package:pos_app/domain/models/update/release_manifest.dart';
import 'package:pos_app/domain/ports/fiscal_safety_gate_port.dart';
import 'package:pos_app/domain/ports/release_installer_port.dart';
import 'package:pos_app/domain/services/update/ota_update_coordinator.dart';
import 'package:pos_app/domain/services/update/release_downloader.dart';

class _MockApiBaseUrlService extends Mock implements ApiBaseUrlService {}
class _MockReleaseDownloader extends Mock implements ReleaseDownloader {}
class _MockReleaseInstaller extends Mock implements ReleaseInstallerPort {}
class _MockFiscalSafetyGate extends Mock implements FiscalSafetyGatePort {}
class _MockDio extends Mock implements Dio {}

void main() {
  late _MockApiBaseUrlService mockApiUrlService;
  late _MockReleaseDownloader mockDownloader;
  late _MockReleaseInstaller mockInstaller;
  late _MockFiscalSafetyGate mockFiscalGate;
  late _MockDio mockDio;
  late Directory tempDir;

  setUpAll(() {
    registerFallbackValue(
      ReleaseManifest(
        channel: 'pilot',
        abi: TargetAbi.arm64v8a,
        versionCode: 1,
        versionName: '1',
        sha256: 'a' * 64,
        sizeBytes: 1,
        downloadUrl: Uri.parse('https://example.com'),
        minFromVersionCode: 1,
        mandatory: false,
        publishedAt: DateTime.utc(2026),
      ),
    );
    registerFallbackValue(Directory(''));
    registerFallbackValue(File(''));
    registerFallbackValue(Uri.parse('https://example.com'));
    registerFallbackValue(RequestOptions());
    // T5: the resolver stubs match on the `buildTimeApiUrl` named argument.
    registerFallbackValue('');
  });

  setUp(() {
    mockApiUrlService = _MockApiBaseUrlService();
    mockDownloader = _MockReleaseDownloader();
    mockInstaller = _MockReleaseInstaller();
    mockFiscalGate = _MockFiscalSafetyGate();
    mockDio = _MockDio();
    tempDir = Directory.systemTemp.createTempSync('ota_coordinator_test_');
  });

  tearDown(() {
    if (tempDir.existsSync()) {
      tempDir.deleteSync(recursive: true);
    }
  });

  PackageInfo testPackageInfo({String buildNumber = '2001'}) {
    return PackageInfo(
      appName: 'OmniFood POS',
      packageName: 'com.nhilos.pos_app',
      version: '1.0.0',
      buildNumber: buildNumber,
      buildSignature: '',
    );
  }

  Map<String, dynamic> sampleManifestPayload({int versionCode = 2002}) => {
        'schema': 'omnifood.pos.release/1',
        'channel': 'pilot',
        'abi': 'arm64-v8a',
        'versionCode': versionCode,
        'versionName': '1.0.2',
        'sha256': 'c' * 64,
        'sizeBytes': 32000000,
        'downloadUrl': 'https://r2.test/app.apk',
        'minFromVersionCode': 2001,
        'mandatory': false,
        'publishedAt': '2026-10-02T18:00:00Z',
      };

  OtaUpdateCoordinator createCoordinator({
    TargetAbi? Function()? resolveAbi,
    String? configuredUrl = 'https://api.test',
    String buildTimeApiUrl = '',
  }) {
    when(() => mockApiUrlService.resolve(
          buildTimeApiUrl: any(named: 'buildTimeApiUrl'),
        )).thenAnswer(
      (_) async => configuredUrl != null
          ? ApiBaseUrlResolution.persisted(configuredUrl)
          : const ApiBaseUrlResolution.unconfigured(),
    );

    return OtaUpdateCoordinator(
      apiBaseUrlService: mockApiUrlService,
      releaseDownloader: mockDownloader,
      releaseInstaller: mockInstaller,
      fiscalSafetyGate: mockFiscalGate,
      dio: mockDio,
      getStorageDirectory: () async => tempDir,
      getPackageInfo: () async => testPackageInfo(),
      resolveAbi: resolveAbi ?? () => TargetAbi.arm64v8a,
      buildTimeApiUrl: buildTimeApiUrl,
    );
  }

  void stubDefineResolve(String url) {
    when(() => mockApiUrlService.resolve(buildTimeApiUrl: url))
        .thenAnswer((_) async => ApiBaseUrlResolution.buildDefine(url));
  }

  void stubDio204() {
    when(() => mockDio.get(any(), options: any(named: 'options'))).thenAnswer(
      (_) async => Response(requestOptions: RequestOptions(), statusCode: 204),
    );
  }

  // REGRESSION (device-reported): the operator closed the cash register
  // and the OTA card kept demanding "close the cash register before
  // updating". The verdict carried by the offer is a SNAPSHOT taken at
  // discovery time; nothing re-read the live terminal state, so the stale
  // message survived the operator's action.
  group('OtaUpdateCoordinator — refreshFiscalVerdict', () {
    test(
        're-evaluates the gate against live state so a closed register '
        'clears the stale blocked verdict',
        () async {
      when(() => mockDio.get(any(), options: any(named: 'options'))).thenAnswer(
        (_) async => Response(
          requestOptions: RequestOptions(),
          statusCode: 200,
          data: sampleManifestPayload(versionCode: 2002),
        ),
      );
      // At discovery time the terminal was NOT quiet (open register).
      when(() => mockFiscalGate.evaluateSafety()).thenAnswer(
        (_) async => const FiscalGateBlocked(
          reasons: [FiscalBlockReason.shiftOpen],
        ),
      );

      final coordinator = createCoordinator();
      await coordinator.checkForUpdate();

      expect(coordinator.state, isA<OtaUpdateAvailable>());
      expect((coordinator.state as OtaUpdateAvailable).canInstallNow, isFalse);

      // The operator closes the register. The live state is now quiet.
      when(() => mockFiscalGate.evaluateSafety()).thenAnswer(
        (_) async => const FiscalGateClear(),
      );

      await coordinator.refreshFiscalVerdict();

      final refreshed = coordinator.state as OtaUpdateAvailable;
      expect(refreshed.canInstallNow, isTrue);
      // The OFFERED version must not change — only the verdict does.
      expect(refreshed.manifest.versionCode, 2002);
    });

    test('is a no-op when there is no offer to re-evaluate', () async {
      // The coordinator starts in OtaInitial: no offer, nothing to
      // re-evaluate. (A discovery is NOT run here on purpose: any
      // non-offer outcome would be a different state and would muddy
      // what this test asserts.)
      final coordinator = createCoordinator();

      expect(coordinator.state, isA<OtaInitial>());

      await coordinator.refreshFiscalVerdict();

      // It must never fabricate an offer out of nothing.
      expect(coordinator.state, isA<OtaInitial>());
      verifyNever(() => mockFiscalGate.evaluateSafety());
    });

    test(
        'does not notify listeners when the verdict did not actually change',
        () async {
      when(() => mockDio.get(any(), options: any(named: 'options'))).thenAnswer(
        (_) async => Response(
          requestOptions: RequestOptions(),
          statusCode: 200,
          data: sampleManifestPayload(versionCode: 2002),
        ),
      );
      when(() => mockFiscalGate.evaluateSafety()).thenAnswer(
        (_) async => const FiscalGateBlocked(
          reasons: [FiscalBlockReason.shiftOpen],
        ),
      );

      final coordinator = createCoordinator();
      await coordinator.checkForUpdate();

      var notifications = 0;
      coordinator.addListener(() => notifications++);

      await coordinator.refreshFiscalVerdict();

      // An unchanged verdict must not rebuild the card for nothing.
      expect(notifications, 0);
      expect((coordinator.state as OtaUpdateAvailable).canInstallNow, isFalse);
    });
  });

  group('OtaUpdateCoordinator — Discovery & Decision', () {
    test('fails closed if ABI cannot be resolved on the device', () async {
      final coordinator = createCoordinator(resolveAbi: () => null);

      await coordinator.checkForUpdate();

      expect(coordinator.state, isA<OtaFailed>());
      final failed = coordinator.state as OtaFailed;
      expect(failed.reasonCode, 'ABI_UNKNOWN');
    });

    test('stays in OtaInitial silently when backend URL is unconfigured', () async {
      final coordinator = createCoordinator(configuredUrl: null);

      await coordinator.checkForUpdate();

      expect(coordinator.state, isA<OtaInitial>());
      verifyNever(() => mockDio.get(any(), options: any(named: 'options')));
    });

    test('emits OtaUpToDate when server returns 204 No Content', () async {
      final coordinator = createCoordinator();
      when(() => mockDio.get(any(), options: any(named: 'options'))).thenAnswer(
        (_) async => Response(
          requestOptions: RequestOptions(),
          statusCode: 204,
        ),
      );

      await coordinator.checkForUpdate();

      expect(coordinator.state, isA<OtaUpToDate>());
      expect((coordinator.state as OtaUpToDate).versionCode, 2001);
    });

    test('emits OtaUpdateAvailable when server offers a valid newer version and gate is clear', () async {
      final coordinator = createCoordinator();
      when(() => mockDio.get(any(), options: any(named: 'options'))).thenAnswer(
        (_) async => Response(
          requestOptions: RequestOptions(),
          statusCode: 200,
          data: sampleManifestPayload(versionCode: 2002),
        ),
      );
      when(() => mockFiscalGate.evaluateSafety()).thenAnswer(
        (_) async => const FiscalGateClear(),
      );

      await coordinator.checkForUpdate();

      expect(coordinator.state, isA<OtaUpdateAvailable>());
      final available = coordinator.state as OtaUpdateAvailable;
      expect(available.manifest.versionCode, 2002);
      expect(available.canInstallNow, isTrue);
    });

    test('emits OtaUpdateAvailable with canInstallNow=false when fiscal gate is blocked', () async {
      final coordinator = createCoordinator();
      when(() => mockDio.get(any(), options: any(named: 'options'))).thenAnswer(
        (_) async => Response(
          requestOptions: RequestOptions(),
          statusCode: 200,
          data: sampleManifestPayload(versionCode: 2002),
        ),
      );
      when(() => mockFiscalGate.evaluateSafety()).thenAnswer(
        (_) async => const FiscalGateBlocked(reasons: [FiscalBlockReason.shiftOpen]),
      );

      await coordinator.checkForUpdate();

      expect(coordinator.state, isA<OtaUpdateAvailable>());
      final available = coordinator.state as OtaUpdateAvailable;
      expect(available.canInstallNow, isFalse);
      expect((available.fiscalVerdict as FiscalGateBlocked).summary, contains('caja'));
    });
  });

  group('OtaUpdateCoordinator — build-time API_URL define (T5, V13)', () {
    test(
        'discovery resolves the URL WITH the build-time define (V13 '
        'regression: define-only pilot build must discover)', () async {
      // Coordinator first: its catch-all resolver stub (configuredUrl: null
      // → unconfigured) must be registered BEFORE the specific define stub
      // below, because mocktail's last-registered matching stub wins.
      final coordinator = createCoordinator(
        configuredUrl: null,
        buildTimeApiUrl: 'https://pilot.example/api',
      );

      // Nothing persisted in local_configs; only the define can configure
      // the transport — exactly the founder's pilot APK.
      when(() => mockApiUrlService.resolve(
            buildTimeApiUrl: 'https://pilot.example/api',
          )).thenAnswer(
        (_) async =>
            ApiBaseUrlResolution.buildDefine('https://pilot.example/api'),
      );
      when(() => mockDio.get(any(), options: any(named: 'options')))
          .thenAnswer(
        (_) async =>
            Response(requestOptions: RequestOptions(), statusCode: 204),
      );
      // R4-Q5: discovery now persists the define URL; keep the stub quiet.
      when(() => mockApiUrlService.save(any())).thenAnswer((_) async {});

      final outcome = await coordinator.discoverSilently();

      // The define must be the value actually handed to the resolver.
      verify(() => mockApiUrlService.resolve(
            buildTimeApiUrl: 'https://pilot.example/api',
          )).called(1);
      expect(outcome, isNot(isA<OtaDiscoveryUnconfigured>()),
          reason: 'a define-only build must NOT resolve unconfigured');
      expect(outcome, isA<OtaDiscoveryUpToDate>());
    });

    test(
        'a coordinator built WITHOUT the parameter behaves exactly as '
        'before (backward compatible)', () async {
      when(() => mockDio.get(any(), options: any(named: 'options')))
          .thenAnswer(
        (_) async =>
            Response(requestOptions: RequestOptions(), statusCode: 204),
      );

      final coordinator = createCoordinator(); // no buildTimeApiUrl passed

      final outcome = await coordinator.discoverSilently();

      // Empty define, exactly the pre-T5 contract; the persisted URL wins.
      verify(() => mockApiUrlService.resolve(buildTimeApiUrl: '')).called(1);
      expect(outcome, isA<OtaDiscoveryUpToDate>());
      final captured = verify(() => mockDio.get(captureAny(),
              options: any(named: 'options')))
          .captured
          .single as String;
      expect(captured, startsWith('https://api.test/v1/releases/latest'));
    });

    test(
        'empty define + nothing persisted still yields '
        'OtaDiscoveryUnconfigured', () async {
      final coordinator = createCoordinator(configuredUrl: null);

      final outcome = await coordinator.discoverSilently();

      expect(outcome, isA<OtaDiscoveryUnconfigured>());
      verifyNever(() => mockDio.get(any(), options: any(named: 'options')));
    });
    // R4-Q5-OTA-CONFIG-LOSS: a define-only URL must reach persisted config,
    // because the OTA artifact carries no define of its own.
    test('promotes a build-define URL to persisted config once', () async {
      final url = 'https://pilot.example/api';
      final coordinator =
          createCoordinator(configuredUrl: null, buildTimeApiUrl: url);
      stubDefineResolve(url);
      when(() => mockApiUrlService.save(any())).thenAnswer((_) async {});
      stubDio204();
      final outcome = await coordinator.discoverSilently();
      verify(() => mockApiUrlService.save(url)).called(1);
      expect(outcome, isA<OtaDiscoveryUpToDate>());
    });

    test('does not re-save an already persisted URL', () async {
      stubDio204();
      await createCoordinator().discoverSilently(); // persistedConfig source
      verifyNever(() => mockApiUrlService.save(any()));
    });

    test('never persists the development default URL', () async {
      final coordinator = createCoordinator(configuredUrl: null);
      when(() => mockApiUrlService.resolve(buildTimeApiUrl: '')).thenAnswer(
        (_) async => const ApiBaseUrlResolution.developmentDefault(
            'http://127.0.0.1:3000/api'),
      );
      stubDio204();
      final outcome = await coordinator.discoverSilently();
      verifyNever(() => mockApiUrlService.save(any()));
      expect(outcome, isA<OtaDiscoveryUpToDate>());
    });

    test('discovery still completes when persisting the URL throws', () async {
      final url = 'https://pilot.example/api';
      final coordinator =
          createCoordinator(configuredUrl: null, buildTimeApiUrl: url);
      stubDefineResolve(url);
      when(() => mockApiUrlService.save(any()))
          .thenThrow(const ApiBaseUrlValidationException('invalid url'));
      stubDio204();
      expect(
          await coordinator.discoverSilently(), isA<OtaDiscoveryUpToDate>());
    });
  });

  group('OtaUpdateCoordinator — Download & Install flow', () {
    final sampleManifest = (ReleaseManifest.tryParse(
      sampleManifestPayload(versionCode: 2002),
    ) as ReleaseManifestAccepted).manifest;

    test('aborts install if fiscal gate is blocked at trigger time (Rule R7)', () async {
      final coordinator = createCoordinator();
      when(() => mockFiscalGate.evaluateSafety()).thenAnswer(
        (_) async => const FiscalGateBlocked(reasons: [FiscalBlockReason.cartNotEmpty]),
      );

      await coordinator.downloadAndInstall(sampleManifest);

      expect(coordinator.state, isA<OtaUpdateAvailable>());
      expect((coordinator.state as OtaUpdateAvailable).canInstallNow, isFalse);
      verifyNever(() => mockDownloader.downloadAndVerify(
            manifest: any(named: 'manifest'),
            targetDirectory: any(named: 'targetDirectory'),
          ));
    });

    test('downloads, verifies, and dispatches handoff when all clear', () async {
      final coordinator = createCoordinator();
      final dummyApk = File('${tempDir.path}/app.apk')..writeAsBytesSync([1, 2]);

      when(() => mockFiscalGate.evaluateSafety()).thenAnswer(
        (_) async => const FiscalGateClear(),
      );
      when(() => mockDownloader.downloadAndVerify(
            manifest: any(named: 'manifest'),
            targetDirectory: any(named: 'targetDirectory'),
            onProgress: any(named: 'onProgress'),
          )).thenAnswer(
        (_) async => VerifiedReleaseArtifact(
          manifest: sampleManifest,
          file: dummyApk,
          sha256Digest: sampleManifest.sha256,
          byteLength: sampleManifest.sizeBytes,
        ),
      );
      when(() => mockInstaller.installRelease(any())).thenAnswer(
        (_) async => InstallHandoffDispatched(filePath: dummyApk.path),
      );

      await coordinator.downloadAndInstall(sampleManifest);

      expect(coordinator.state, isA<OtaHandoffDispatched>());
      verify(() => mockInstaller.installRelease(dummyApk)).called(1);
    });

    test('sets OtaPermissionRequired when REQUEST_INSTALL_PACKAGES is missing', () async {
      final coordinator = createCoordinator();
      final dummyApk = File('${tempDir.path}/app.apk')..writeAsBytesSync([1, 2]);

      when(() => mockFiscalGate.evaluateSafety()).thenAnswer(
        (_) async => const FiscalGateClear(),
      );
      when(() => mockDownloader.downloadAndVerify(
            manifest: any(named: 'manifest'),
            targetDirectory: any(named: 'targetDirectory'),
            onProgress: any(named: 'onProgress'),
          )).thenAnswer(
        (_) async => VerifiedReleaseArtifact(
          manifest: sampleManifest,
          file: dummyApk,
          sha256Digest: sampleManifest.sha256,
          byteLength: sampleManifest.sizeBytes,
        ),
      );
      when(() => mockInstaller.installRelease(any())).thenAnswer(
        (_) async => const InstallPermissionRequired(),
      );

      await coordinator.downloadAndInstall(sampleManifest);

      expect(coordinator.state, isA<OtaPermissionRequired>());
    });

    test('sets OtaFailed when download verification fails', () async {
      final coordinator = createCoordinator();

      when(() => mockFiscalGate.evaluateSafety()).thenAnswer(
        (_) async => const FiscalGateClear(),
      );
      when(() => mockDownloader.downloadAndVerify(
            manifest: any(named: 'manifest'),
            targetDirectory: any(named: 'targetDirectory'),
            onProgress: any(named: 'onProgress'),
          )).thenAnswer(
        (_) async => const DownloadVerificationFailure(
          reason: ReleaseDownloadRejectReason.sha256Mismatch,
          detail: 'mismatch',
          expected: 'abc',
          actual: 'def',
        ),
      );

      await coordinator.downloadAndInstall(sampleManifest);

      expect(coordinator.state, isA<OtaFailed>());
      final failed = coordinator.state as OtaFailed;
      expect(failed.reasonCode, 'sha256Mismatch');
      verifyNever(() => mockInstaller.installRelease(any()));
    });
  });
}
