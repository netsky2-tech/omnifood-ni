import '../../../core/platform/target_abi.dart';

/// The one manifest schema this build understands.
///
/// An unknown schema is a hard rejection, never a best-effort parse: silently
/// accepting a future manifest whose fields changed meaning would let a
/// terminal install an artifact it misread. See odd/tasks/ota-update-channel.md
/// rule R6.
const releaseManifestSchema = 'omnifood.pos.release/1';

/// A release offer, as published by the backend registry.
///
/// Immutable value object. Hand-written rather than Freezed on purpose: the
/// generated `fromJson` is permissive (it coerces and defaults), and this
/// parser is a safety boundary that must reject anything it cannot fully
/// understand. Every field is validated in [ReleaseManifest.tryParse].
class ReleaseManifest {
  const ReleaseManifest({
    required this.channel,
    required this.abi,
    required this.versionCode,
    required this.versionName,
    required this.sha256,
    required this.sizeBytes,
    required this.downloadUrl,
    required this.minFromVersionCode,
    required this.mandatory,
    required this.publishedAt,
    this.notes,
  });

  final String channel;
  final TargetAbi abi;

  /// Strictly greater than the installed code is required to offer an install.
  /// Android refuses downgrades on non-debuggable release builds, so a lower
  /// or equal code is not a "missed update", it is an invalid offer.
  final int versionCode;
  final String versionName;

  /// Lowercase hex, 64 chars. Verified against the downloaded bytes before the
  /// installer is ever invoked.
  final String sha256;
  final int sizeBytes;
  final Uri downloadUrl;

  /// Lowest installed versionCode this release may legitimately replace.
  final int minFromVersionCode;
  final bool mandatory;
  final DateTime publishedAt;
  final String? notes;

  /// Parses strictly. Returns a [ReleaseManifestRejection] naming the exact
  /// reason rather than throwing, so the caller must decide what the operator
  /// sees and cannot accidentally swallow a malformed offer.
  static ReleaseManifestParseResult tryParse(Object? json) {
    if (json is! Map) {
      return const ReleaseManifestRejection(
        ReleaseRejectReason.malformedManifest,
        'manifest is not a JSON object',
      );
    }

    final schema = json['schema'];
    if (schema is! String) {
      return const ReleaseManifestRejection(
        ReleaseRejectReason.missingField,
        'field "schema" is absent or not a string',
      );
    }
    if (schema != releaseManifestSchema) {
      return ReleaseManifestRejection(
        ReleaseRejectReason.unknownSchema,
        'expected "$releaseManifestSchema", got "$schema"',
      );
    }

    final channel = json['channel'];
    if (channel is! String || channel.trim().isEmpty) {
      return const ReleaseManifestRejection(
        ReleaseRejectReason.invalidChannel,
        'field "channel" must be a non-empty string',
      );
    }

    final abi = TargetAbi.fromWireName(
      json['abi'] is String ? json['abi'] as String : null,
    );
    if (abi == null) {
      return ReleaseManifestRejection(
        ReleaseRejectReason.unknownAbi,
        'field "abi" is not a recognized ABI: ${json['abi']}',
      );
    }

    final versionCode = _positiveInt(json['versionCode']);
    if (versionCode == null) {
      return const ReleaseManifestRejection(
        ReleaseRejectReason.invalidVersionCode,
        'field "versionCode" must be a positive integer',
      );
    }

    final minFrom = _positiveInt(json['minFromVersionCode']);
    if (minFrom == null) {
      return const ReleaseManifestRejection(
        ReleaseRejectReason.invalidMinFromVersionCode,
        'field "minFromVersionCode" must be a positive integer',
      );
    }
    if (versionCode <= minFrom) {
      return ReleaseManifestRejection(
        ReleaseRejectReason.invertedVersionRange,
        'versionCode $versionCode cannot be <= minFromVersionCode $minFrom',
      );
    }

    final versionName = json['versionName'];
    if (versionName is! String || versionName.trim().isEmpty) {
      return const ReleaseManifestRejection(
        ReleaseRejectReason.missingField,
        'field "versionName" must be a non-empty string',
      );
    }

    final sha = json['sha256'];
    if (sha is! String || !_sha256Pattern.hasMatch(sha)) {
      return const ReleaseManifestRejection(
        ReleaseRejectReason.invalidSha256,
        'field "sha256" must be 64 lowercase hex characters',
      );
    }

    final size = _positiveInt(json['sizeBytes']);
    if (size == null) {
      return const ReleaseManifestRejection(
        ReleaseRejectReason.invalidSize,
        'field "sizeBytes" must be a positive integer',
      );
    }

    final url = json['downloadUrl'];
    if (url is! String) {
      return const ReleaseManifestRejection(
        ReleaseRejectReason.invalidDownloadUrl,
        'field "downloadUrl" is absent or not a string',
      );
    }
    final uri = Uri.tryParse(url);
    if (uri == null ||
        !uri.isAbsolute ||
        (uri.scheme != 'https' && uri.scheme != 'http')) {
      return ReleaseManifestRejection(
        ReleaseRejectReason.invalidDownloadUrl,
        'field "downloadUrl" must be an absolute http(s) URL, got "$url"',
      );
    }

    final mandatory = json['mandatory'];
    if (mandatory is! bool) {
      return const ReleaseManifestRejection(
        ReleaseRejectReason.missingField,
        'field "mandatory" must be a boolean',
      );
    }

    final published = json['publishedAt'];
    if (published is! String) {
      return const ReleaseManifestRejection(
        ReleaseRejectReason.invalidPublishedAt,
        'field "publishedAt" is absent or not a string',
      );
    }
    final publishedAt = DateTime.tryParse(published);
    if (publishedAt == null) {
      return ReleaseManifestRejection(
        ReleaseRejectReason.invalidPublishedAt,
        'field "publishedAt" is not a parseable timestamp: "$published"',
      );
    }

    final notes = json['notes'];
    if (notes != null && notes is! String) {
      return const ReleaseManifestRejection(
        ReleaseRejectReason.missingField,
        'field "notes" must be a string when present',
      );
    }

    return ReleaseManifestAccepted(
      ReleaseManifest(
        channel: channel.trim(),
        abi: abi,
        versionCode: versionCode,
        versionName: versionName.trim(),
        sha256: sha,
        sizeBytes: size,
        downloadUrl: uri,
        minFromVersionCode: minFrom,
        mandatory: mandatory,
        publishedAt: publishedAt.toUtc(),
        notes: notes as String?,
      ),
    );
  }

  static final _sha256Pattern = RegExp(r'^[0-9a-f]{64}$');

  static int? _positiveInt(Object? value) {
    if (value is int) return value > 0 ? value : null;
    return null;
  }
}

/// Why an offer was refused. Structured so the UI can render localized copy
/// per reason while the canonical English [detail] stays available for logs —
/// the same contract the server-URL card uses.
enum ReleaseRejectReason {
  malformedManifest,
  missingField,
  unknownSchema,
  invalidChannel,
  unknownAbi,
  invalidVersionCode,
  invalidMinFromVersionCode,
  invertedVersionRange,
  invalidSha256,
  invalidSize,
  invalidDownloadUrl,
  invalidPublishedAt,
}

sealed class ReleaseManifestParseResult {
  const ReleaseManifestParseResult();
}

class ReleaseManifestAccepted extends ReleaseManifestParseResult {
  const ReleaseManifestAccepted(this.manifest);
  final ReleaseManifest manifest;
}

class ReleaseManifestRejection extends ReleaseManifestParseResult {
  const ReleaseManifestRejection(this.reason, this.detail);
  final ReleaseRejectReason reason;

  /// Canonical English detail for logs and diagnostics. Never shown raw to the
  /// operator; the UI maps [reason] to localized copy.
  final String detail;
}
