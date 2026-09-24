import 'package:flutter/foundation.dart';
import 'device_sync_exceptions.dart';

/// Immutable device-sync renewal credential record.
///
/// Contains strictly device-sync exchange material:
/// - [credentialId]: unique server-assigned credential ID
/// - [tenantId]: tenant scoping ID
/// - [deviceId]: canonical terminal device ID (resolved via TerminalIdentityService)
/// - [renewalSecret]: high-entropy renewal secret used exclusively for token exchange
/// - [credentialVersion]: monotonically increasing version number (prevents stale overwrites)
/// - [expiresAt]: UTC expiration timestamp for the renewal credential itself
/// - [scopes]: granted device-sync scopes (e.g. `['sync:push', 'sync:pull']`)
/// - [slug]: OPTIONAL tenant slug echoed by the provisioning/confirm response
///   (issue #556). Pre-auth routing context only — never authority, never a
///   secret. Not part of credential identity (excluded from ==/hashCode).
///
/// Under no circumstances may this record store human tokens, passwords, PIN hashes,
/// TOTP seeds, or user session data.
@immutable
class DeviceSyncCredentialRecord {
  static const Set<String> allowedScopes = {'sync:push', 'sync:pull'};
  static const List<String> defaultScopes = ['sync:push', 'sync:pull'];

  DeviceSyncCredentialRecord({
    required this.credentialId,
    required this.tenantId,
    required this.deviceId,
    required this.renewalSecret,
    required this.credentialVersion,
    required this.expiresAt,
    List<String>? scopes,
    this.slug = '',
  })  : scopes = List.unmodifiable(_validateScopes(scopes ?? defaultScopes)) {
    if (credentialId.trim().isEmpty) {
      throw ArgumentError.value(credentialId, 'credentialId', 'Must not be empty');
    }
    if (tenantId.trim().isEmpty) {
      throw ArgumentError.value(tenantId, 'tenantId', 'Must not be empty');
    }
    if (deviceId.trim().isEmpty) {
      throw ArgumentError.value(deviceId, 'deviceId', 'Must not be empty');
    }
    if (renewalSecret.trim().isEmpty) {
      throw ArgumentError.value(renewalSecret, 'renewalSecret', 'Must not be empty');
    }
    if (credentialVersion <= 0) {
      throw ArgumentError.value(credentialVersion, 'credentialVersion', 'Must be positive (> 0)');
    }
  }

  static List<String> _validateScopes(List<String> scopes) {
    if (scopes.isEmpty) {
      throw ArgumentError.value(scopes, 'scopes', 'Scopes must not be empty');
    }
    final seen = <String>{};
    for (final scope in scopes) {
      if (!allowedScopes.contains(scope)) {
        throw ArgumentError.value(
          scope,
          'scopes',
          'Unknown scope "$scope". Allowed scopes: $allowedScopes',
        );
      }
      if (!seen.add(scope)) {
        throw ArgumentError.value(
          scopes,
          'scopes',
          'Duplicate scope "$scope" detected',
        );
      }
    }
    return scopes;
  }

  final String credentialId;
  final String tenantId;
  final String deviceId;
  final String renewalSecret;
  final int credentialVersion;
  final DateTime expiresAt;
  final List<String> scopes;

  /// Optional tenant slug echoed by the backend provisioning/confirm/bootstrap
  /// responses. Empty for legacy responses that do not include it.
  final String slug;

  static const Set<String> _allowedKeys = {
    'credentialId',
    'tenantId',
    'deviceId',
    'renewalSecret',
    'credentialVersion',
    'expiresAt',
    'scopes',
    'slug',
  };

  static const Set<String> _prohibitedKeys = {
    'accessToken',
    'access_token',
    'refreshToken',
    'refresh_token',
    'password',
    'pin',
    'pinHash',
    'pin_hash',
    'totpSecret',
    'totp_secret',
    'totpSecretSeed',
    'totp_secret_seed',
    'cashier',
    'cashierId',
    'cashier_id',
    'role',
    'permissions',
    'adminSecret',
    'admin_secret',
    'email',
    'user',
    'userId',
    'user_id',
  };

  bool isRenewalExpired([DateTime? at]) {
    final reference = (at ?? DateTime.now()).toUtc();
    return reference.isAfter(expiresAt.toUtc());
  }

  Map<String, dynamic> toJson() => {
        'credentialId': credentialId,
        'tenantId': tenantId,
        'deviceId': deviceId,
        'renewalSecret': renewalSecret,
        'credentialVersion': credentialVersion,
        'expiresAt': expiresAt.toUtc().toIso8601String(),
        'scopes': scopes,
        'slug': slug,
      };

  factory DeviceSyncCredentialRecord.fromJson(Map<String, dynamic> json) {
    for (final key in json.keys) {
      if (_prohibitedKeys.contains(key)) {
        throw DeviceSyncProhibitedFieldException(key);
      }
      if (!_allowedKeys.contains(key)) {
        throw DeviceSyncProhibitedFieldException(key);
      }
    }

    final rawExpiresAt = json['expiresAt'];
    final parsedExpiresAt = rawExpiresAt is String
        ? DateTime.parse(rawExpiresAt).toUtc()
        : throw ArgumentError.value(rawExpiresAt, 'expiresAt', 'Must be ISO8601 string');

    final rawScopes = json['scopes'];
    List<String>? scopesList;
    if (rawScopes != null) {
      if (rawScopes is! List) {
        throw ArgumentError.value(rawScopes, 'scopes', 'Must be a List');
      }
      scopesList = rawScopes.map((e) => e.toString()).toList();
    }

    return DeviceSyncCredentialRecord(
      credentialId: json['credentialId'] as String? ?? '',
      tenantId: json['tenantId'] as String? ?? '',
      deviceId: json['deviceId'] as String? ?? '',
      renewalSecret: json['renewalSecret'] as String? ?? '',
      credentialVersion: (json['credentialVersion'] as num?)?.toInt() ?? 0,
      expiresAt: parsedExpiresAt,
      scopes: scopesList,
      slug: json['slug'] as String? ?? '',
    );
  }

  DeviceSyncCredentialRecord copyWith({
    String? credentialId,
    String? tenantId,
    String? deviceId,
    String? renewalSecret,
    int? credentialVersion,
    DateTime? expiresAt,
    List<String>? scopes,
    String? slug,
  }) {
    return DeviceSyncCredentialRecord(
      credentialId: credentialId ?? this.credentialId,
      tenantId: tenantId ?? this.tenantId,
      deviceId: deviceId ?? this.deviceId,
      renewalSecret: renewalSecret ?? this.renewalSecret,
      credentialVersion: credentialVersion ?? this.credentialVersion,
      expiresAt: expiresAt ?? this.expiresAt,
      scopes: scopes ?? this.scopes,
      slug: slug ?? this.slug,
    );
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is DeviceSyncCredentialRecord &&
          runtimeType == other.runtimeType &&
          credentialId == other.credentialId &&
          tenantId == other.tenantId &&
          deviceId == other.deviceId &&
          renewalSecret == other.renewalSecret &&
          credentialVersion == other.credentialVersion &&
          expiresAt.isAtSameMomentAs(other.expiresAt) &&
          listEquals(scopes, other.scopes);

  @override
  int get hashCode => Object.hash(
        credentialId,
        tenantId,
        deviceId,
        renewalSecret,
        credentialVersion,
        expiresAt.millisecondsSinceEpoch,
        Object.hashAll(scopes),
      );

  @override
  String toString() {
    return 'DeviceSyncCredentialRecord(id: $credentialId, tenant: $tenantId, device: $deviceId, v: $credentialVersion, secret: [REDACTED], exp: $expiresAt)';
  }
}
