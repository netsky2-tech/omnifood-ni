import 'dart:convert';
import 'package:flutter/foundation.dart';
import '../../domain/security/device_sync_credential_record.dart';
import '../../domain/security/device_sync_credential_store.dart';
import '../../domain/security/device_sync_exceptions.dart';
import '../daos/local_config_dao.dart';
import '../models/local_config_entity.dart';

/// Dedicated app-private software sync-only store encapsulated behind [DeviceSyncCredentialStore].
///
/// THREAT MODEL DOCUMENTATION:
/// - Protection scope: Protects renewal credentials against ordinary Android applications
///   and accidental filesystem exposure via OS application sandbox boundary (Floor/SQLite
///   app-private internal storage).
/// - Non-goals & Limitations: Does NOT protect against root access, privileged filesystem
///   extraction, physical hardware compromise, or full OS takeover.
/// - Never claim hardware equivalence: This store is software-level fallback and cannot
///   replicate the hardware security guarantees of Android Keystore, StrongBox, or Secure Enclave.
/// - Server-side defense-in-depth: The server enforces independent defense-in-depth through:
///   1) Short-lived sync access tokens (15 minutes),
///   2) Narrow scopes restricted strictly to sync transport (`sync:push`, `sync:pull`),
///   3) Cryptographic binding to tenantId and canonical deviceId,
///   4) Strict monotonic credential versioning rejecting replay or older state,
///   5) Revocation checks and append-only audit event trails.
class AppPrivateDeviceSyncCredentialStore implements DeviceSyncCredentialStore {
  AppPrivateDeviceSyncCredentialStore(this._configDao);

  static const String fallbackStorageKey = 'device_sync_credential_fallback_v1';
  static const String candidateStorageKey = 'device_sync_credential_candidate_fallback_v1';

  final LocalConfigDao _configDao;

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

  @override
  Future<DeviceSyncCredentialRecord?> readCredential() async {
    final entity = await _configDao.getConfigByKey(fallbackStorageKey);
    if (entity == null || entity.value.trim().isEmpty) {
      return null;
    }

    final decoded = jsonDecode(entity.value);
    if (decoded is! Map<String, dynamic>) {
      throw const DeviceSyncUnavailableException('Corrupted fallback credential format');
    }

    _assertNoProhibitedFields(decoded);
    return DeviceSyncCredentialRecord.fromJson(decoded);
  }

  @override
  Future<void> writeCredential(DeviceSyncCredentialRecord record) async {
    final jsonMap = record.toJson();
    _assertNoProhibitedFields(jsonMap);

    await _configDao.saveConfig(
      LocalConfigEntity(
        key: fallbackStorageKey,
        value: jsonEncode(jsonMap),
        description: 'App-private device sync credential fallback store.',
      ),
    );
  }

  /// Writes a raw JSON map, validating that no prohibited human auth or cloud
  /// session fields exist before persisting.
  @visibleForTesting
  Future<void> writeRawJson(Map<String, dynamic> rawJson) async {
    _assertNoProhibitedFields(rawJson);
    final record = DeviceSyncCredentialRecord.fromJson(rawJson);
    await writeCredential(record);
  }

  @override
  Future<void> clearCredential() async {
    await _configDao.deleteConfig(fallbackStorageKey);
    await _configDao.deleteConfig(candidateStorageKey);
  }

  @override
  Future<void> stageCandidate(DeviceSyncCredentialRecord record) async {
    final jsonMap = record.toJson();
    _assertNoProhibitedFields(jsonMap);

    await _configDao.saveConfig(
      LocalConfigEntity(
        key: candidateStorageKey,
        value: jsonEncode(jsonMap),
        description: 'App-private device sync candidate credential staging store.',
      ),
    );
  }

  @override
  Future<DeviceSyncCredentialRecord?> readCandidate() async {
    final entity = await _configDao.getConfigByKey(candidateStorageKey);
    if (entity == null || entity.value.trim().isEmpty) {
      return null;
    }

    final decoded = jsonDecode(entity.value);
    if (decoded is! Map<String, dynamic>) {
      throw const DeviceSyncUnavailableException('Corrupted fallback candidate format');
    }

    _assertNoProhibitedFields(decoded);
    return DeviceSyncCredentialRecord.fromJson(decoded);
  }

  @override
  Future<void> commitCandidate() async {
    final entity = await _configDao.getConfigByKey(candidateStorageKey);
    if (entity == null || entity.value.trim().isEmpty) {
      throw const DeviceSyncUnavailableException('No candidate staged to commit');
    }

    final decoded = jsonDecode(entity.value);
    if (decoded is! Map<String, dynamic>) {
      throw const DeviceSyncUnavailableException('Corrupted fallback candidate format');
    }
    _assertNoProhibitedFields(decoded);

    await _configDao.saveConfig(
      LocalConfigEntity(
        key: fallbackStorageKey,
        value: entity.value,
        description: 'App-private device sync credential fallback store.',
      ),
    );
    await _configDao.deleteConfig(candidateStorageKey);
  }

  @override
  Future<void> rollbackCandidate() async {
    await _configDao.deleteConfig(candidateStorageKey);
  }

  void _assertNoProhibitedFields(Map<String, dynamic> map) {
    for (final key in map.keys) {
      if (_prohibitedKeys.contains(key)) {
        throw DeviceSyncProhibitedFieldException(key);
      }
    }
  }
}
