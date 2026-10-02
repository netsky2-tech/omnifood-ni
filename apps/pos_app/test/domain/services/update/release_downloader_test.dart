import 'dart:io';
import 'package:crypto/crypto.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:pos_app/core/platform/target_abi.dart';
import 'package:pos_app/domain/models/update/release_manifest.dart';
import 'package:pos_app/domain/services/update/release_downloader.dart';

class _MockDio extends Mock implements Dio {}

void main() {
  late _MockDio mockDio;
  late Directory tempDir;

  setUp(() {
    mockDio = _MockDio();
    tempDir = Directory.systemTemp.createTempSync('downloader_test_');
  });

  tearDown(() {
    if (tempDir.existsSync()) {
      tempDir.deleteSync(recursive: true);
    }
  });

  final testBytes = List<int>.generate(1024, (i) => i % 256);
  final expectedSha256 = sha256.convert(testBytes).toString();
  final expectedSize = testBytes.length;

  ReleaseManifest sampleManifest({
    String? sha,
    int? size,
  }) {
    return ReleaseManifest(
      channel: 'pilot',
      abi: TargetAbi.arm64v8a,
      versionCode: 2002,
      versionName: '1.0.2',
      sha256: sha ?? expectedSha256,
      sizeBytes: size ?? expectedSize,
      downloadUrl: Uri.parse('https://r2.example.com/nhilos-pos/arm64-2002.apk'),
      minFromVersionCode: 2001,
      mandatory: false,
      publishedAt: DateTime.utc(2026, 10, 2),
    );
  }

  group('ReleaseDownloader — R4 and R5 verification', () {
    test('happy path: verified artifact returned when size and hash match', () async {
      when(() => mockDio.download(
            any(),
            any(),
            onReceiveProgress: any(named: 'onReceiveProgress'),
            cancelToken: any(named: 'cancelToken'),
          )).thenAnswer((invocation) async {
        final path = invocation.positionalArguments[1] as String;
        File(path).writeAsBytesSync(testBytes);
        final progress = invocation.namedArguments[#onReceiveProgress] as void Function(int, int)?;
        progress?.call(1024, 1024);
        return Response(requestOptions: RequestOptions());
      });

      final downloader = ReleaseDownloader(dio: mockDio);
      int reportedReceived = 0;

      final result = await downloader.downloadAndVerify(
        manifest: sampleManifest(),
        targetDirectory: tempDir,
        onProgress: (received, total) {
          reportedReceived = received;
        },
      );

      expect(result, isA<VerifiedReleaseArtifact>());
      final verified = result as VerifiedReleaseArtifact;
      expect(verified.byteLength, 1024);
      expect(verified.sha256Digest, expectedSha256);
      expect(verified.file.existsSync(), isTrue);
      expect(reportedReceived, 1024);
    });

    test('Rule R5: size mismatch deletes file and returns DownloadVerificationFailure', () async {
      // Dio writes 500 bytes, but manifest expects 1024
      when(() => mockDio.download(
            any(),
            any(),
            onReceiveProgress: any(named: 'onReceiveProgress'),
            cancelToken: any(named: 'cancelToken'),
          )).thenAnswer((invocation) async {
        final path = invocation.positionalArguments[1] as String;
        File(path).writeAsBytesSync(testBytes.sublist(0, 500));
        return Response(requestOptions: RequestOptions());
      });

      final downloader = ReleaseDownloader(dio: mockDio);
      final result = await downloader.downloadAndVerify(
        manifest: sampleManifest(),
        targetDirectory: tempDir,
      );

      expect(result, isA<DownloadVerificationFailure>());
      final failure = result as DownloadVerificationFailure;
      expect(failure.reason, ReleaseDownloadRejectReason.sizeMismatch);
      expect(failure.actual, '500');
      expect(failure.expected, '1024');

      // The unverified file MUST be deleted immediately
      final expectedPath = '${tempDir.path}/nhilos-pos-arm64-v8a-2002.apk';
      expect(File(expectedPath).existsSync(), isFalse);
    });

    test('Rule R4: sha256 mismatch deletes file and returns DownloadVerificationFailure', () async {
      // Dio writes 1024 bytes, but manifest expects a different hash
      when(() => mockDio.download(
            any(),
            any(),
            onReceiveProgress: any(named: 'onReceiveProgress'),
            cancelToken: any(named: 'cancelToken'),
          )).thenAnswer((invocation) async {
        final path = invocation.positionalArguments[1] as String;
        File(path).writeAsBytesSync(testBytes);
        return Response(requestOptions: RequestOptions());
      });

      final wrongSha = '0' * 64;
      final downloader = ReleaseDownloader(dio: mockDio);
      final result = await downloader.downloadAndVerify(
        manifest: sampleManifest(sha: wrongSha),
        targetDirectory: tempDir,
      );

      expect(result, isA<DownloadVerificationFailure>());
      final failure = result as DownloadVerificationFailure;
      expect(failure.reason, ReleaseDownloadRejectReason.sha256Mismatch);
      expect(failure.actual, expectedSha256);
      expect(failure.expected, wrongSha);

      // File must be deleted
      final expectedPath = '${tempDir.path}/nhilos-pos-arm64-v8a-2002.apk';
      expect(File(expectedPath).existsSync(), isFalse);
    });

    test('network error cleans up target file and returns DownloadNetworkFailure', () async {
      when(() => mockDio.download(
            any(),
            any(),
            onReceiveProgress: any(named: 'onReceiveProgress'),
            cancelToken: any(named: 'cancelToken'),
          )).thenAnswer((invocation) async {
        final path = invocation.positionalArguments[1] as String;
        // Partial file left before error
        File(path).writeAsBytesSync([1, 2, 3]);
        throw DioException(
          requestOptions: RequestOptions(),
          error: 'Connection reset by peer',
          type: DioExceptionType.connectionError,
        );
      });

      final downloader = ReleaseDownloader(dio: mockDio);
      final result = await downloader.downloadAndVerify(
        manifest: sampleManifest(),
        targetDirectory: tempDir,
      );

      expect(result, isA<DownloadNetworkFailure>());
      final failure = result as DownloadNetworkFailure;
      expect(failure.detail, contains('Connection reset'));

      // Partial file cleaned up
      final expectedPath = '${tempDir.path}/nhilos-pos-arm64-v8a-2002.apk';
      expect(File(expectedPath).existsSync(), isFalse);
    });

    test('creates target directory if it does not exist yet', () async {
      final subDir = Directory('${tempDir.path}/nested/releases');
      expect(subDir.existsSync(), isFalse);

      when(() => mockDio.download(
            any(),
            any(),
            onReceiveProgress: any(named: 'onReceiveProgress'),
            cancelToken: any(named: 'cancelToken'),
          )).thenAnswer((invocation) async {
        final path = invocation.positionalArguments[1] as String;
        File(path).writeAsBytesSync(testBytes);
        return Response(requestOptions: RequestOptions());
      });

      final downloader = ReleaseDownloader(dio: mockDio);
      final result = await downloader.downloadAndVerify(
        manifest: sampleManifest(),
        targetDirectory: subDir,
      );

      expect(result, isA<VerifiedReleaseArtifact>());
      expect(subDir.existsSync(), isTrue);
    });
  });
}
