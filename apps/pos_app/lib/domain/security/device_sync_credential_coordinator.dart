import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'device_sync_credential_record.dart';
import 'device_sync_credential_store.dart';
import 'device_sync_exceptions.dart';
import 'device_sync_exchange_port.dart';

typedef DeviceIdResolver = Future<String> Function();

/// Coordinator managing device-sync renewal credentials and short-lived device access JWTs.
///
/// Key Guarantees:
/// - Memory-first short-lived access JWT caching (never durably persisted).
/// - Safe base64url JWT exp parsing with clock-skew tolerance.
/// - Single-flight concurrent renewal: multiple callers share a single in-flight renewal request.
/// - Independent from CloudCredentialCoordinator: human login/logout and cashier switches
///   never clear, read, or mutate device-sync credentials.
/// - Revocation safety: AUTH_BLOCKED / DEVICE_REVOKED errors enter a typed blocked state
///   without deleting local outbox or database data.
/// - Two-phase-safe provisioning: writes and verifies new credentials before exposing them,
///   strictly rejecting stale versions (N cannot overwrite N+1).
class DeviceSyncCredentialCoordinator {
  DeviceSyncCredentialCoordinator({
    required DeviceSyncCredentialStore store,
    required DeviceSyncExchangePort exchangePort,
    required DeviceIdResolver resolveDeviceId,
    DateTime Function()? nowUtc,
    Duration clockSkew = const Duration(seconds: 30),
  })  : _store = store,
        _exchangePort = exchangePort,
        _resolveDeviceId = resolveDeviceId,
        _nowUtc = nowUtc ?? (() => DateTime.now().toUtc()),
        _clockSkew = clockSkew;

  final DeviceSyncCredentialStore _store;
  final DeviceSyncExchangePort _exchangePort;
  final DeviceIdResolver _resolveDeviceId;
  final DateTime Function() _nowUtc;
  final Duration _clockSkew;

  String? _cachedAccessToken;
  DateTime? _cachedTokenExpiresAt;

  bool _isRevoked = false;
  String? _revocationReason;

  Future<String>? _ongoingRenewal;

  bool get isRevoked => _isRevoked;
  String? get revocationReason => _revocationReason;

  /// Invalidates the memory-only cached device access token.
  /// Does not touch durable renewal credentials. Next call to [getAccessToken] will renew.
  void invalidateAccessToken() {
    _cachedAccessToken = null;
    _cachedTokenExpiresAt = null;
  }

  /// Returns a valid device sync access JWT, renewing it if expired or absent.
  ///
  /// Safe for concurrent calls (single-flight execution).
  Future<String> getAccessToken() async {
    if (_isRevoked) {
      throw DeviceSyncRevokedException(
        reason: _revocationReason ?? 'BLOCKED',
      );
    }

    if (_cachedAccessToken != null && !_isTokenExpired()) {
      return _cachedAccessToken!;
    }

    if (_ongoingRenewal != null) {
      return await _ongoingRenewal!;
    }

    final future = _performRenewal();
    _ongoingRenewal = future;

    try {
      return await future;
    } finally {
      _ongoingRenewal = null;
    }
  }

  /// Provisions a new device sync renewal credential using two-phase verification.
  ///
  /// Enforces:
  /// 1. Canonical device identity match.
  /// 2. Monotonic credential versioning (rejects version <= current).
  /// 3. Readback verification before promotion.
  /// 4. Resets revocation state and invalidates cached token upon success.
  Future<DeviceSyncCredentialRecord> provision(
    DeviceSyncCredentialRecord record,
  ) async {
    final canonicalDeviceId = await _resolveDeviceId();
    if (record.deviceId.trim() != canonicalDeviceId.trim()) {
      throw ArgumentError(
        'Provisioned deviceId (${record.deviceId}) must match canonical device identity ($canonicalDeviceId)',
      );
    }

    final current = await _store.readCredential();
    if (current != null && record.credentialVersion <= current.credentialVersion) {
      throw StaleCredentialVersionException(
        currentVersion: current.credentialVersion,
        proposedVersion: record.credentialVersion,
      );
    }

    try {
      // Phase 1: Stage candidate in durable store without touching active credential
      await _store.stageCandidate(record);

      // Phase 1 verification: read back candidate from store and verify integrity
      final verified = await _store.readCandidate();
      if (verified == null ||
          verified.credentialId != record.credentialId ||
          verified.credentialVersion != record.credentialVersion ||
          verified.renewalSecret != record.renewalSecret ||
          verified.deviceId != record.deviceId) {
        throw const DeviceSyncPersistenceVerificationException(
          'Device sync credential candidate readback verification failed after staging',
        );
      }

      // Guard against concurrent write before commit
      final activeCurrent = await _store.readCredential();
      if (activeCurrent != null && record.credentialVersion <= activeCurrent.credentialVersion) {
        throw StaleCredentialVersionException(
          currentVersion: activeCurrent.credentialVersion,
          proposedVersion: record.credentialVersion,
        );
      }

      // Phase 2: Commit candidate to active state
      await _store.commitCandidate();

      final activeVerified = await _store.readCredential();
      if (activeVerified == null ||
          activeVerified.credentialId != record.credentialId) {
        throw const DeviceSyncPersistenceVerificationException(
          'Device sync credential active readback verification failed after commit',
        );
      }

      // Phase 3: Promote in-memory state
      _isRevoked = false;
      _revocationReason = null;
      invalidateAccessToken();

      return activeVerified;
    } catch (e) {
      try {
        await _store.rollbackCandidate();
      } catch (_) {}
      rethrow;
    }
  }

  /// Clears stored renewal credentials and in-memory tokens.
  /// Used solely for explicit de-provisioning, NEVER by human logout or cashier switch.
  Future<void> clearCredential() async {
    invalidateAccessToken();
    _isRevoked = false;
    _revocationReason = null;
    await _store.clearCredential();
  }

  Future<String> _performRenewal() async {
    final canonicalDeviceId = await _resolveDeviceId();
    final credential = await _store.readCredential();

    if (credential == null) {
      throw const DeviceSyncUnavailableException(
        'No device sync credential provisioned',
      );
    }

    if (credential.isRenewalExpired(_nowUtc())) {
      throw const DeviceSyncUnavailableException(
        'Device sync renewal credential has expired',
      );
    }

    if (credential.deviceId.trim() != canonicalDeviceId.trim()) {
      throw const DeviceSyncUnavailableException(
        'Stored device ID does not match canonical device identity',
      );
    }

    try {
      final response = await _exchangePort.renewToken(
        credentialId: credential.credentialId,
        deviceId: canonicalDeviceId,
        renewalSecret: credential.renewalSecret,
        tenantId: credential.tenantId,
        expectedCredentialVersion: credential.credentialVersion,
      );

      _verifyTokenResponse(response);

      _cachedAccessToken = response.accessToken;
      _cachedTokenExpiresAt = _extractTokenExpiry(
        response.accessToken,
        response.expiresIn,
        response.expiresAt,
      );

      return response.accessToken;
    } on DeviceSyncRevokedException catch (e) {
      _isRevoked = true;
      _revocationReason = e.reason;
      _cachedAccessToken = null;
      _cachedTokenExpiresAt = null;
      rethrow;
    } on DeviceSyncException {
      rethrow;
    } catch (e) {
      throw DeviceSyncUnavailableException('Device sync renewal exchange failed: $e');
    }
  }

  void _verifyTokenResponse(DeviceSyncTokenResponse response) {
    if (response.accessToken.trim().isEmpty) {
      throw const DeviceSyncMalformedResponseException(
        'Device sync access token must not be blank',
      );
    }

    if (response.tokenType.trim().toLowerCase() != 'bearer') {
      throw DeviceSyncMalformedResponseException(
        'Invalid token type "${response.tokenType}": expected "Bearer"',
      );
    }

    if (response.expiresIn <= 0) {
      throw DeviceSyncMalformedResponseException(
        'Device sync token expiresIn must be positive (> 0), received: ${response.expiresIn}',
      );
    }

    final now = _nowUtc();
    if (response.expiresAt != null && !response.expiresAt!.toUtc().isAfter(now)) {
      throw const DeviceSyncMalformedResponseException(
        'Device sync token explicit expiresAt must be in the future',
      );
    }

    final jwtExp = _parseJwtExpiry(response.accessToken);
    if (jwtExp != null && !jwtExp.isAfter(now)) {
      throw const DeviceSyncMalformedResponseException(
        'Device sync access token JWT exp claim must be in the future',
      );
    }
  }

  bool _isTokenExpired() {
    if (_cachedAccessToken == null || _cachedTokenExpiresAt == null) {
      return true;
    }
    final now = _nowUtc();
    final expirationThreshold = _cachedTokenExpiresAt!.subtract(_clockSkew);
    return now.isAfter(expirationThreshold);
  }

  DateTime _extractTokenExpiry(
    String jwt,
    int expiresInSeconds,
    DateTime? explicitExpiresAt,
  ) {
    if (explicitExpiresAt != null) {
      return explicitExpiresAt.toUtc();
    }

    final parsedFromJwt = _parseJwtExpiry(jwt);
    if (parsedFromJwt != null) {
      return parsedFromJwt;
    }

    if (expiresInSeconds > 0) {
      return _nowUtc().add(Duration(seconds: expiresInSeconds));
    }

    // Default fallback if no exp info present (15 minutes standard sync window)
    return _nowUtc().add(const Duration(minutes: 15));
  }

  DateTime? _parseJwtExpiry(String jwt) {
    try {
      final parts = jwt.split('.');
      if (parts.length != 3) return null;

      final normalizedPayload = base64Url.normalize(parts[1]);
      final payloadJson = utf8.decode(base64Url.decode(normalizedPayload));
      final decoded = jsonDecode(payloadJson);

      if (decoded is Map<String, dynamic> && decoded.containsKey('exp')) {
        final exp = decoded['exp'];
        if (exp is int) {
          return DateTime.fromMillisecondsSinceEpoch(exp * 1000, isUtc: true);
        } else if (exp is num) {
          return DateTime.fromMillisecondsSinceEpoch((exp * 1000).toInt(), isUtc: true);
        }
      }
    } catch (_) {
      // Safe fallback on token decode error
    }
    return null;
  }
}
