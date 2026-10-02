import 'dart:async';
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

/// T2 (OTA automatic discovery) — the silent discovery entry point.
///
/// The three named RED targets each drive a *second concurrent caller* of
/// discovery while the interactive state machine is mid-flight. They pin the
/// AC3 boundary: a background tick must be able to run the same discovery
/// I/O without ever mutating the observable `OtaUpdateState` machine.
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
  final List<OtaUpdateState> emittedStates = <OtaUpdateState>[];

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
    registerFallbackValue(RequestOptions());
  });

  setUp(() {
    mockApiUrlService = _MockApiBaseUrlService();
    mockDownloader = _MockReleaseDownloader();
    mockInstaller = _MockReleaseInstaller();
    mockFiscalGate = _MockFiscalSafetyGate();
    mockDio = _MockDio();
    tempDir = Directory.systemTemp.createTempSync('ota_silent_test_');
    emittedStates.clear();

    when(() => mockApiUrlService.resolve()).thenAnswer(
      (_) async => ApiBaseUrlResolution.persisted('https://api.test'),
    );
    when(() => mockFiscalGate.evaluateSafety()).thenAnswer(
      (_) async => const FiscalGateClear(),
    );
    // The download tail hands off to the platform installer; stub it so a
    // completed download can flow through to OtaHandoffDispatched in tests
    // that finish the pending download.
    when(() => mockInstaller.installRelease(any())).thenAnswer(
      (_) async => InstallHandoffDispatched(filePath: '/tmp/app.apk'),
    );
  });

  tearDown(() {
    if (tempDir.existsSync()) {
      tempDir.deleteSync(recursive: true);
    }
  });

  PackageInfo testPackageInfo({String buildNumber = '2001'}) => PackageInfo(
        appName: 'OmniFood POS',
        packageName: 'com.nhilos.pos_app',
        version: '1.0.0',
        buildNumber: buildNumber,
        buildSignature: '',
      );

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

  late final ReleaseManifest sampleManifest =
      (ReleaseManifest.tryParse(sampleManifestPayload())
              as ReleaseManifestAccepted)
          .manifest;

  OtaUpdateCoordinator createCoordinator() {
    final coordinator = OtaUpdateCoordinator(
      apiBaseUrlService: mockApiUrlService,
      releaseDownloader: mockDownloader,
      releaseInstaller: mockInstaller,
      fiscalSafetyGate: mockFiscalGate,
      dio: mockDio,
      getStorageDirectory: () async => tempDir,
      getPackageInfo: () async => testPackageInfo(),
      resolveAbi: () => TargetAbi.arm64v8a,
    );
    coordinator.addListener(() => emittedStates.add(coordinator.state));
    return coordinator;
  }

  /// Drives `downloadAndInstall` until the interactive machine is parked in
  /// [OtaDownloading] with the (mocked) downloader still pending.
  Future<Completer<ReleaseDownloadResult>> startPendingDownload(
    OtaUpdateCoordinator coordinator,
  ) async {
    final downloadCompleter = Completer<ReleaseDownloadResult>();
    when(() => mockDownloader.downloadAndVerify(
          manifest: any(named: 'manifest'),
          targetDirectory: any(named: 'targetDirectory'),
          onProgress: any(named: 'onProgress'),
        )).thenAnswer((_) => downloadCompleter.future);

    // Unawaited on purpose: the interactive machine stays mid-flight.
    unawaited(coordinator.downloadAndInstall(sampleManifest));
    await pumpEventQueue(times: 10);
    expect(coordinator.state, isA<OtaDownloading>(),
        reason: 'precondition: the interactive machine must be mid-flight');
    return downloadCompleter;
  }

  group('OtaUpdateCoordinator — silent discovery entry point (AC3)', () {
    test(
        'RED(1): a discovery tick during an OtaDownloading leaves that state '
        'intact', () async {
      final coordinator = createCoordinator();
      final downloadCompleter = await startPendingDownload(coordinator);

      // The background tick runs while the download is in flight. The mock
      // discovery response is held pending, then completed with a valid,
      // newer offer — the exact sequence a real timer + network would produce.
      final discoveryCompleter = Completer<Response<dynamic>>();
      when(() => mockDio.get(any(), options: any(named: 'options')))
          .thenAnswer((_) => discoveryCompleter.future);

      final tickFuture = coordinator.discoverSilently();
      await pumpEventQueue(times: 5);
      discoveryCompleter.complete(Response(
        requestOptions: RequestOptions(),
        statusCode: 200,
        data: sampleManifestPayload(versionCode: 2002),
      ));
      final outcome = await tickFuture;

      expect(outcome, isA<OtaDiscoveryOffered>(),
          reason: 'the silent path must return the offer as a value');
      expect(coordinator.state, isA<OtaDownloading>(),
          reason:
              'AC3: the tick must not clobber the in-flight OtaDownloading');
      expect(emittedStates.whereType<OtaChecking>(), isEmpty,
          reason: 'the silent path must not even flash OtaChecking');
      expect(emittedStates.whereType<OtaUpdateAvailable>(), isEmpty,
          reason: 'the offer must land on the silent surface, not the screen');

      // The interactive flow continues unharmed.
      downloadCompleter.complete(VerifiedReleaseArtifact(
        manifest: sampleManifest,
        file: File('${tempDir.path}/app.apk')..writeAsBytesSync([1, 2]),
        sha256Digest: sampleManifest.sha256,
        byteLength: sampleManifest.sizeBytes,
      ));
      await pumpEventQueue(times: 10);
      expect(coordinator.state, isA<OtaHandoffDispatched>());
    });

    test(
        'RED(2): a failed tick produces no OtaFailed observable by the '
        'screen', () async {
      final coordinator = createCoordinator();
      final downloadCompleter = await startPendingDownload(coordinator);

      when(() => mockDio.get(any(), options: any(named: 'options')))
          .thenThrow(DioException.connectionError(
        requestOptions: RequestOptions(),
        reason: 'network blip during the tick',
      ));

      final outcome = await coordinator.discoverSilently();

      expect(outcome, isA<OtaDiscoveryNetworkError>(),
          reason: 'the transient failure is returned, not thrown');
      expect(coordinator.state, isA<OtaDownloading>(),
          reason: 'AC3/AC4: a failed tick must not surface OtaFailed');
      expect(emittedStates.whereType<OtaFailed>(), isEmpty,
          reason: 'no OtaFailed may ever be emitted by a silent tick');

      downloadCompleter.complete(VerifiedReleaseArtifact(
        manifest: sampleManifest,
        file: File('${tempDir.path}/app.apk')..writeAsBytesSync([1, 2]),
        sha256Digest: sampleManifest.sha256,
        byteLength: sampleManifest.sizeBytes,
      ));
      await pumpEventQueue(times: 10);
      expect(coordinator.state, isA<OtaHandoffDispatched>());
    });

    test(
        'RED(3): a 204 lands as "up to date", never as an error — and the '
        'interactive machine is untouched', () async {
      final coordinator = createCoordinator();
      final downloadCompleter = await startPendingDownload(coordinator);

      when(() => mockDio.get(any(), options: any(named: 'options')))
          .thenAnswer(
        (_) async => Response(
          requestOptions: RequestOptions(),
          statusCode: 204,
        ),
      );

      final outcome = await coordinator.discoverSilently();

      expect(outcome, isA<OtaDiscoveryUpToDate>(),
          reason: 'V4: 204 is the normal "up to date" answer');
      final upToDate = outcome as OtaDiscoveryUpToDate;
      expect(upToDate.installedVersionCode, 2001);
      expect(coordinator.state, isA<OtaDownloading>(),
          reason: 'AC3: 204 must not reset the interactive machine either');
      expect(emittedStates.whereType<OtaFailed>(), isEmpty);

      downloadCompleter.complete(VerifiedReleaseArtifact(
        manifest: sampleManifest,
        file: File('${tempDir.path}/app.apk')..writeAsBytesSync([1, 2]),
        sha256Digest: sampleManifest.sha256,
        byteLength: sampleManifest.sizeBytes,
      ));
      await pumpEventQueue(times: 10);
      expect(coordinator.state, isA<OtaHandoffDispatched>());
    });

    test('silent tick on an idle coordinator never mutates OtaInitial', () async {
      final coordinator = createCoordinator();
      when(() => mockDio.get(any(), options: any(named: 'options')))
          .thenAnswer(
        (_) async => Response(
          requestOptions: RequestOptions(),
          statusCode: 200,
          data: sampleManifestPayload(versionCode: 2002),
        ),
      );

      final outcome = await coordinator.discoverSilently();

      expect(outcome, isA<OtaDiscoveryOffered>());
      expect(coordinator.state, isA<OtaInitial>(),
          reason: 'no tick may move the screen out of its idle state');
      expect(emittedStates, isEmpty,
          reason: 'a silent tick must not notifyListeners at all');
    });

    test(
        'silent tick sends exactly the query params the backend DTO allows '
        '(V4: forbidNonWhitelisted)', () async {
      final coordinator = createCoordinator();
      when(() => mockDio.get(any(), options: any(named: 'options')))
          .thenAnswer(
        (_) async => Response(
          requestOptions: RequestOptions(),
          statusCode: 204,
        ),
      );

      await coordinator.discoverSilently(channel: 'production');

      final captured = verify(() => mockDio.get(captureAny(),
              options: any(named: 'options')))
          .captured
          .single as String;
      expect(captured, startsWith('https://api.test/v1/releases/latest?'));
      expect(captured, contains('channel=production'));
      expect(captured, contains('abi=arm64-v8a'));
      expect(captured, contains('currentVersionCode=2001'));
    });
  });
}
