import 'dart:io';
import 'package:crypto/crypto.dart';
import 'package:dio/dio.dart';
import '../../models/update/release_manifest.dart';

/// The result of attempting to download and verify a release artifact.
sealed class ReleaseDownloadResult {
  const ReleaseDownloadResult();
}

/// Download succeeded and the on-disk bytes were verified against the
/// manifest's exact sha256 (Rule R4) and sizeBytes (Rule R5).
class VerifiedReleaseArtifact extends ReleaseDownloadResult {
  const VerifiedReleaseArtifact({
    required this.manifest,
    required this.file,
    required this.sha256Digest,
    required this.byteLength,
  });

  final ReleaseManifest manifest;
  final File file;
  final String sha256Digest;
  final int byteLength;
}

/// The download finished or was interrupted, but the resulting bytes failed
/// verification (R4/R5). Any partial or corrupt file on disk is deleted before
/// this result is returned, so unverified bytes never linger on the device.
class DownloadVerificationFailure extends ReleaseDownloadResult {
  const DownloadVerificationFailure({
    required this.reason,
    required this.detail,
    required this.expected,
    required this.actual,
  });

  final ReleaseDownloadRejectReason reason;
  final String detail;
  final String expected;
  final String actual;
}

/// The download failed due to network, filesystem, or HTTP error before
/// verification could complete.
class DownloadNetworkFailure extends ReleaseDownloadResult {
  const DownloadNetworkFailure(this.error, this.detail);
  final Object error;
  final String detail;
}

enum ReleaseDownloadRejectReason {
  /// R5 — The file on disk does not match the manifest's sizeBytes.
  sizeMismatch,

  /// R4 — The streaming SHA-256 digest does not match the manifest's sha256.
  sha256Mismatch,
}

/// Downloads and verifies release APKs against the strict manifest contract.
///
/// Memory safety: uses streaming SHA-256 computation over the file stream
/// rather than buffering 32 MB into heap memory, keeping memory overhead
/// constant on constrained POS hardware.
class ReleaseDownloader {
  const ReleaseDownloader({
    required Dio dio,
  }) : _dio = dio;

  final Dio _dio;

  /// Downloads [manifest] into [targetDirectory] and cryptographically verifies
  /// its size and SHA-256 hash before returning.
  ///
  /// If verification fails, the file is immediately removed from disk to ensure
  /// unverified or corrupted bytes can never be submitted to the installer.
  Future<ReleaseDownloadResult> downloadAndVerify({
    required ReleaseManifest manifest,
    required Directory targetDirectory,
    void Function(int received, int total)? onProgress,
    CancelToken? cancelToken,
  }) async {
    final fileName = 'nhilos-pos-${manifest.abi.wireName}-${manifest.versionCode}.apk';
    final targetFile = File('${targetDirectory.path}/$fileName');

    // Ensure the parent directory exists
    if (!targetDirectory.existsSync()) {
      targetDirectory.createSync(recursive: true);
    }

    // 1. Download artifact to disk
    try {
      await _dio.download(
        manifest.downloadUrl.toString(),
        targetFile.path,
        onReceiveProgress: onProgress,
        cancelToken: cancelToken,
      );
    } catch (e) {
      if (targetFile.existsSync()) {
        try {
          targetFile.deleteSync();
        } catch (_) {}
      }
      return DownloadNetworkFailure(e, 'Failed to download release artifact: $e');
    }

    // 2. Rule R5 — Size check
    final actualSize = targetFile.lengthSync();
    if (actualSize != manifest.sizeBytes) {
      targetFile.deleteSync();
      return DownloadVerificationFailure(
        reason: ReleaseDownloadRejectReason.sizeMismatch,
        detail: 'Downloaded size ($actualSize bytes) does not match manifest (${manifest.sizeBytes} bytes)',
        expected: manifest.sizeBytes.toString(),
        actual: actualSize.toString(),
      );
    }

    // 3. Rule R4 — Streaming SHA-256 computation (constant memory)
    final Digest computedDigest;
    try {
      computedDigest = await sha256.bind(targetFile.openRead()).first;
    } catch (e) {
      targetFile.deleteSync();
      return DownloadNetworkFailure(e, 'Failed to compute SHA-256 over downloaded file: $e');
    }

    final computedHash = computedDigest.toString().toLowerCase();
    if (computedHash != manifest.sha256.toLowerCase()) {
      targetFile.deleteSync();
      return DownloadVerificationFailure(
        reason: ReleaseDownloadRejectReason.sha256Mismatch,
        detail: 'Computed SHA-256 ($computedHash) does not match manifest (${manifest.sha256})',
        expected: manifest.sha256,
        actual: computedHash,
      );
    }

    return VerifiedReleaseArtifact(
      manifest: manifest,
      file: targetFile,
      sha256Digest: computedHash,
      byteLength: actualSize,
    );
  }
}
