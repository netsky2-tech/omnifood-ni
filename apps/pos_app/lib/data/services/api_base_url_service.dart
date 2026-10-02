import 'package:flutter/foundation.dart';

import '../daos/local_config_dao.dart';
import '../models/local_config_entity.dart';

/// Where the effective backend URL came from.
enum ApiBaseUrlSource {
  /// Persisted `local_configs` value under [ApiBaseUrlService.configKey].
  persistedConfig,

  /// Compile-time `--dart-define=API_URL=...` define.
  buildDefine,

  /// Development fallback (`http://127.0.0.1:3000/api`); debug builds only.
  developmentDefault,

  /// Release build with neither a persisted value nor a build define.
  /// The transport has no configured backend; this must be surfaced, never
  /// silently replaced by the localhost default.
  unconfigured,
}

/// Resolved backend URL plus the provenance of the resolution. The source is
/// part of the contract so the configuration UI can report which value is in
/// force instead of guessing.
class ApiBaseUrlResolution {
  const ApiBaseUrlResolution._(this.url, this.source);

  const ApiBaseUrlResolution.persisted(String url)
      : this._(url, ApiBaseUrlSource.persistedConfig);

  const ApiBaseUrlResolution.unconfigured()
      : this._(null, ApiBaseUrlSource.unconfigured);

  const ApiBaseUrlResolution.buildDefine(String url)
      : this._(url, ApiBaseUrlSource.buildDefine);

  const ApiBaseUrlResolution.developmentDefault(String url)
      : this._(url, ApiBaseUrlSource.developmentDefault);

  /// Effective URL, or `null` when [ApiBaseUrlSource.unconfigured].
  final String? url;
  final ApiBaseUrlSource source;

  bool get isConfigured => url != null;
}

/// Why a backend URL was rejected. A structured code, so an operator-facing
/// surface can render its own localized copy without depending on the English
/// message string that mirrors `validate_api_url` in `scripts/build_pos_apk.sh`.
enum ApiBaseUrlValidationReason {
  /// The value is null or empty.
  empty,

  /// The value contains whitespace anywhere.
  whitespace,

  /// Not an absolute `http(s)` URL with a non-empty host.
  notAbsolute,
}

/// A validation rejection: the machine-readable [reason] plus the English
/// [message] kept for the script-mirrored contract and for logs.
class ApiBaseUrlValidationFailure {
  const ApiBaseUrlValidationFailure(this.reason, this.message);

  final ApiBaseUrlValidationReason reason;
  final String message;
}

/// Thrown when an operator-supplied URL fails validation. The rule mirrors
/// `validate_api_url` in `scripts/build_pos_apk.sh` exactly: an absolute
/// `http://` or `https://` URL with a non-empty host and no whitespace.
///
/// [message] is the script-mirrored English text; UI layers should branch on
/// [reason] instead of rendering English copy to a Spanish-only operator.
class ApiBaseUrlValidationException implements Exception {
  const ApiBaseUrlValidationException(this.message, [this.reason]);

  final String message;

  /// The structured rejection reason, when the failure came from
  /// [ApiBaseUrlService.validateApiUrl]. Null for callers that construct the
  /// exception from a plain message.
  final ApiBaseUrlValidationReason? reason;

  @override
  String toString() => message;
}

/// Resolves the POS backend URL at runtime.
///
/// Resolution order, first value wins:
/// 1. persisted `local_configs` value under [configKey],
/// 2. build-time `String.fromEnvironment('API_URL')` define (non-empty),
/// 3. development default `http://127.0.0.1:3000/api` (debug builds only; a
///    release build with neither source reports [ApiBaseUrlSource.unconfigured]).
///
/// CONSTRAINT: this service configures TRANSPORT ONLY. It must never be called
/// from, or depended on by, the sale path, the DGI numbering path, or any
/// fiscal operation — an unconfigured URL must never prevent a sale.
class ApiBaseUrlService {
  ApiBaseUrlService(this._configDao, {bool isReleaseMode = kReleaseMode})
      : _isReleaseMode = isReleaseMode;

  /// `local_configs` key holding the operator-provisioned backend URL.
  static const configKey = 'api_base_url';

  /// Development fallback. Debug builds only; never presented as a configured
  /// backend in release.
  static const developmentDefaultUrl = 'http://127.0.0.1:3000/api';

  final LocalConfigDao _configDao;
  final bool _isReleaseMode;

  /// Resolves the effective backend URL and its source.
  ///
  /// [buildTimeApiUrl] carries the compile-time `API_URL` define; an empty
  /// string means the build omitted the define. A blank persisted value is
  /// treated as absent.
  Future<ApiBaseUrlResolution> resolve({String buildTimeApiUrl = ''}) async {
    final persisted = (await _configDao.getConfigByKey(configKey))?.value.trim();
    if (persisted != null && persisted.isNotEmpty) {
      return ApiBaseUrlResolution._(persisted, ApiBaseUrlSource.persistedConfig);
    }

    final define = buildTimeApiUrl.trim();
    if (define.isNotEmpty) {
      return ApiBaseUrlResolution._(define, ApiBaseUrlSource.buildDefine);
    }

    if (_isReleaseMode) {
      return const ApiBaseUrlResolution._(
        null,
        ApiBaseUrlSource.unconfigured,
      );
    }

    return const ApiBaseUrlResolution._(
      developmentDefaultUrl,
      ApiBaseUrlSource.developmentDefault,
    );
  }

  /// Persists an operator-supplied backend URL after validation.
  ///
  /// Validation mirrors `validate_api_url` in `scripts/build_pos_apk.sh`:
  /// absolute `http://` or `https://` URL, non-empty host, no whitespace
  /// anywhere. Anything else throws [ApiBaseUrlValidationException] and
  /// persists nothing.
  Future<void> save(String url) async {
    final failure = validateApiUrl(url);
    if (failure != null) {
      throw ApiBaseUrlValidationException(failure.message, failure.reason);
    }

    await _configDao.saveConfig(
      LocalConfigEntity(
        key: configKey,
        value: url,
        description: 'Backend base URL provisioned on the device.',
      ),
    );
  }

  /// Removes the persisted backend URL; resolution falls back to the build
  /// define or the documented defaults on the next resolution.
  Future<void> clear() => _configDao.deleteConfig(configKey);

  /// Returns `null` when [raw] is a valid backend URL, otherwise the reason
  /// and a clear rejection message. Exact mirror of `validate_api_url` in
  /// `scripts/build_pos_apk.sh`: empty rejection, whitespace rejection, and a
  /// required non-empty host between the `http(s)://` scheme and the first `/`.
  static ApiBaseUrlValidationFailure? validateApiUrl(String? raw) {
    if (raw == null || raw.isEmpty) {
      return const ApiBaseUrlValidationFailure(
        ApiBaseUrlValidationReason.empty,
        'Invalid API URL: value is empty.',
      );
    }
    if (raw.contains(RegExp(r'\s'))) {
      return ApiBaseUrlValidationFailure(
        ApiBaseUrlValidationReason.whitespace,
        "Invalid API URL: '$raw' contains whitespace.",
      );
    }
    final match = RegExp(r'^https?://([^/]*)').firstMatch(raw);
    final host = match?.group(1) ?? '';
    if (host.isEmpty) {
      return ApiBaseUrlValidationFailure(
        ApiBaseUrlValidationReason.notAbsolute,
        "Invalid API URL: '$raw' must be an absolute http:// or https:// "
        'URL with a non-empty host '
        '(e.g. https://api.nhilospos.com/api).',
      );
    }
    return null;
  }
}
