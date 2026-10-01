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

  /// Effective URL, or `null` when [ApiBaseUrlSource.unconfigured].
  final String? url;
  final ApiBaseUrlSource source;

  bool get isConfigured => url != null;
}

/// Thrown when an operator-supplied URL fails validation. The rule mirrors
/// `validate_api_url` in `scripts/build_pos_apk.sh` exactly: an absolute
/// `http://` or `https://` URL with a non-empty host and no whitespace.
class ApiBaseUrlValidationException implements Exception {
  const ApiBaseUrlValidationException(this.message);

  final String message;

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
    final error = validateApiUrl(url);
    if (error != null) {
      throw ApiBaseUrlValidationException(error);
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

  /// Returns `null` when [raw] is a valid backend URL, otherwise a clear
  /// rejection reason. Exact mirror of `validate_api_url` in
  /// `scripts/build_pos_apk.sh`: empty rejection, whitespace rejection, and a
  /// required non-empty host between the `http(s)://` scheme and the first `/`.
  static String? validateApiUrl(String? raw) {
    if (raw == null || raw.isEmpty) {
      return 'Invalid API URL: value is empty.';
    }
    if (raw.contains(RegExp(r'\s'))) {
      return "Invalid API URL: '$raw' contains whitespace.";
    }
    final match = RegExp(r'^https?://([^/]*)').firstMatch(raw);
    final host = match?.group(1) ?? '';
    if (host.isEmpty) {
      return "Invalid API URL: '$raw' must be an absolute http:// or https:// "
          'URL with a non-empty host '
          '(e.g. https://api-staging.example.com/api).';
    }
    return null;
  }
}
