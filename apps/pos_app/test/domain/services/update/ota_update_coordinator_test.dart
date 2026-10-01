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
  }) {
    when(() => mockApiUrlService.resolve()).thenAnswer(
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
    );
  }

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
