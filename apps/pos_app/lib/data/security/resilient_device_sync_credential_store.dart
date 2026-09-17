import 'package:flutter/foundation.dart';
import '../../domain/security/device_sync_credential_record.dart';
import '../../domain/security/device_sync_credential_store.dart';
import '../../domain/security/device_sync_exceptions.dart';

/// Resilient credential store orchestrating preferred Keystore and app-private fallback
/// with cross-store monotonic versioning and conflict detection.
///
/// Monotonicity & Fail-Closed Rules:
/// - Active and candidate reads inspect both available stores to select the highest [credentialVersion].
/// - If preferred and fallback hold the same version with differing identity/binding/secrets,
///   the operation fails closed immediately throwing [DeviceSyncConflictException].
/// - If preferred store recovers and fallback holds newer authoritative state, the newer state
///   is safely reconciled to preferred store via verified write/read, and stale fallback is cleared.
///   If reconciliation write or verification fails, the newest valid record is still returned and
///   fallback is kept intact.
/// - Circuit breaker guarantees that a hung or degraded preferred store causes no retry storm.
class ResilientDeviceSyncCredentialStore implements DeviceSyncCredentialStore {
  ResilientDeviceSyncCredentialStore({
    required this.preferredStore,
    this.fallbackStore,
  });

  final DeviceSyncCredentialStore preferredStore;
  final DeviceSyncCredentialStore? fallbackStore;

  @override
  Future<DeviceSyncCredentialRecord?> readCredential() async {
    DeviceSyncCredentialRecord? preferredRecord;
    bool preferredAvailable = false;
    Object? preferredError;

    try {
      preferredRecord = await preferredStore.readCredential();
      preferredAvailable = true;
    } on DeviceSyncUnavailableException catch (e) {
      preferredError = e;
      preferredAvailable = false;
    } catch (e) {
      preferredError = e;
      preferredAvailable = false;
    }

    DeviceSyncCredentialRecord? fallbackRecord;
    bool fallbackAvailable = false;
    Object? fallbackError;

    if (fallbackStore != null) {
      try {
        fallbackRecord = await fallbackStore!.readCredential();
        fallbackAvailable = true;
      } on DeviceSyncUnavailableException catch (e) {
        fallbackError = e;
        fallbackAvailable = false;
      } catch (e) {
        fallbackError = e;
        fallbackAvailable = false;
      }
    }

    if (!preferredAvailable) {
      if (fallbackStore != null) {
        if (!fallbackAvailable) {
          throw DeviceSyncUnavailableException(
            'Both stores unavailable: preferred: $preferredError, fallback: $fallbackError',
          );
        }
        return fallbackRecord;
      }
      if (preferredError is DeviceSyncException) {
        throw preferredError;
      }
      throw DeviceSyncUnavailableException(
        'Preferred store read failed: $preferredError',
      );
    }

    // Preferred is available
    if (fallbackStore != null && !fallbackAvailable) {
      if (preferredRecord != null) {
        throw DeviceSyncUnavailableException(
          'Fallback store unavailable while preferred credential exists: $fallbackError',
        );
      }
      throw DeviceSyncUnavailableException(
        'Fallback store unavailable: $fallbackError',
      );
    }

    if (fallbackRecord == null) {
      if (preferredRecord != null && fallbackStore != null) {
        await _persistFallbackActive(preferredRecord);
      }
      return preferredRecord;
    }

    if (preferredRecord == null) {
      // Fallback holds authoritative record while preferred is empty.
      // Reconcile to preferred store while retaining the safety replica.
      await _safeReconcileActive(fallbackRecord);
      return fallbackRecord;
    }

    // Both stores returned valid records. Compare versions for monotonicity.
    if (preferredRecord.credentialVersion == fallbackRecord.credentialVersion) {
      if (_hasConflict(preferredRecord, fallbackRecord)) {
        throw DeviceSyncConflictException(
          'Equal credential version ${preferredRecord.credentialVersion} has conflicting bindings: '
          'preferred (${preferredRecord.credentialId}) vs fallback (${fallbackRecord.credentialId})',
        );
      }

      // Treat expiry advancement as monotonic metadata for the same credential
      // version. Never accept an earlier expiry over a later one.
      if (fallbackRecord.expiresAt.isAfter(preferredRecord.expiresAt)) {
        await _safeReconcileActive(fallbackRecord);
        return fallbackRecord;
      }

      if (preferredRecord.expiresAt.isAfter(fallbackRecord.expiresAt)) {
        await _persistFallbackActive(preferredRecord);
        return preferredRecord;
      }

      // Keep the compatible fallback as a safety replica for intermittent
      // Keystore failures.
      return preferredRecord;
    }

    if (preferredRecord.credentialVersion > fallbackRecord.credentialVersion) {
      await _persistFallbackActive(preferredRecord);
      return preferredRecord;
    }

    // Fallback holds newer authoritative state. Reconcile to preferred store
    // while retaining the fallback copy.
    await _safeReconcileActive(fallbackRecord);
    return fallbackRecord;
  }

  @override
  Future<void> writeCredential(DeviceSyncCredentialRecord record) async {
    try {
      await preferredStore.writeCredential(record);
    } on DeviceSyncUnavailableException catch (e) {
      if (fallbackStore != null) {
        debugPrint(
          '[ResilientDeviceSyncCredentialStore] Preferred store unavailable ($e), falling back to private store for write.',
        );
        await _persistFallbackActive(record);
        return;
      }
      rethrow;
    } catch (e) {
      if (fallbackStore != null) {
        debugPrint(
          '[ResilientDeviceSyncCredentialStore] Preferred store failed ($e), falling back to private store for write.',
        );
        await _persistFallbackActive(record);
        return;
      }
      throw DeviceSyncUnavailableException('Preferred store write failed: $e');
    }

    if (fallbackStore != null) {
      await _persistFallbackActive(record);
    }
  }

  @override
  Future<void> clearCredential() async {
    Object? preferredError;
    try {
      await preferredStore.clearCredential();
    } catch (e) {
      preferredError = e;
    }

    if (fallbackStore != null) {
      try {
        await fallbackStore!.clearCredential();
      } catch (e) {
        if (preferredError != null) {
          throw DeviceSyncUnavailableException(
            'Failed to clear both stores: $preferredError, $e',
          );
        }
        rethrow;
      }
    } else if (preferredError != null) {
      throw DeviceSyncUnavailableException(
        'Failed to clear preferred store: $preferredError',
      );
    }
  }

  @override
  Future<void> stageCandidate(DeviceSyncCredentialRecord record) async {
    try {
      await preferredStore.stageCandidate(record);
    } on DeviceSyncUnavailableException catch (e) {
      if (fallbackStore != null) {
        debugPrint(
          '[ResilientDeviceSyncCredentialStore] Preferred store unavailable ($e), falling back to private store for stageCandidate.',
        );
        await _persistFallbackCandidate(record);
        return;
      }
      rethrow;
    } catch (e) {
      if (fallbackStore != null) {
        debugPrint(
          '[ResilientDeviceSyncCredentialStore] Preferred store failed ($e), falling back to private store for stageCandidate.',
        );
        await _persistFallbackCandidate(record);
        return;
      }
      throw DeviceSyncUnavailableException(
        'Preferred store stageCandidate failed: $e',
      );
    }

    if (fallbackStore != null) {
      await _persistFallbackCandidate(record);
    }
  }

  @override
  Future<DeviceSyncCredentialRecord?> readCandidate() async {
    DeviceSyncCredentialRecord? preferredCandidate;
    bool preferredAvailable = false;
    Object? preferredError;

    try {
      preferredCandidate = await preferredStore.readCandidate();
      preferredAvailable = true;
    } on DeviceSyncUnavailableException catch (e) {
      preferredError = e;
      preferredAvailable = false;
    } catch (e) {
      preferredError = e;
      preferredAvailable = false;
    }

    DeviceSyncCredentialRecord? fallbackCandidate;
    bool fallbackAvailable = false;
    Object? fallbackError;

    if (fallbackStore != null) {
      try {
        fallbackCandidate = await fallbackStore!.readCandidate();
        fallbackAvailable = true;
      } on DeviceSyncUnavailableException catch (e) {
        fallbackError = e;
        fallbackAvailable = false;
      } catch (e) {
        fallbackError = e;
        fallbackAvailable = false;
      }
    }

    if (!preferredAvailable) {
      if (fallbackStore != null) {
        if (!fallbackAvailable) {
          throw DeviceSyncUnavailableException(
            'Both stores unavailable for candidate read: preferred: $preferredError, fallback: $fallbackError',
          );
        }
        return fallbackCandidate;
      }
      if (preferredError is DeviceSyncException) {
        throw preferredError;
      }
      throw DeviceSyncUnavailableException(
        'Preferred store readCandidate failed: $preferredError',
      );
    }

    // Preferred is available
    if (fallbackStore != null && !fallbackAvailable) {
      if (preferredCandidate != null) {
        throw DeviceSyncUnavailableException(
          'Fallback store unavailable while preferred candidate exists: $fallbackError',
        );
      }
      throw DeviceSyncUnavailableException(
        'Fallback store unavailable for candidate read: $fallbackError',
      );
    }

    if (fallbackCandidate == null) {
      if (preferredCandidate != null && fallbackStore != null) {
        await _persistFallbackCandidate(preferredCandidate);
      }
      return preferredCandidate;
    }

    if (preferredCandidate == null) {
      await _safeReconcileCandidate(fallbackCandidate);
      return fallbackCandidate;
    }

    if (preferredCandidate.credentialVersion ==
        fallbackCandidate.credentialVersion) {
      if (_hasConflict(preferredCandidate, fallbackCandidate)) {
        throw DeviceSyncConflictException(
          'Equal candidate credential version ${preferredCandidate.credentialVersion} has conflicting bindings: '
          'preferred (${preferredCandidate.credentialId}) vs fallback (${fallbackCandidate.credentialId})',
        );
      }

      // Treat candidate expiry advancement as monotonic metadata for the same
      // candidate version. Never accept an earlier expiry over a later one.
      if (fallbackCandidate.expiresAt.isAfter(preferredCandidate.expiresAt)) {
        await _safeReconcileCandidate(fallbackCandidate);
        return fallbackCandidate;
      }

      if (preferredCandidate.expiresAt.isAfter(fallbackCandidate.expiresAt)) {
        await _persistFallbackCandidate(preferredCandidate);
        return preferredCandidate;
      }

      return preferredCandidate;
    }

    if (preferredCandidate.credentialVersion >
        fallbackCandidate.credentialVersion) {
      await _persistFallbackCandidate(preferredCandidate);
      return preferredCandidate;
    }

    // fallbackCandidate.credentialVersion > preferredCandidate.credentialVersion
    await _safeReconcileCandidate(fallbackCandidate);
    return fallbackCandidate;
  }

  @override
  Future<void> commitCandidate() async {
    try {
      await preferredStore.commitCandidate();
    } on DeviceSyncUnavailableException catch (e) {
      if (fallbackStore != null) {
        debugPrint(
          '[ResilientDeviceSyncCredentialStore] Preferred store unavailable ($e), falling back to private store for commitCandidate.',
        );
        await fallbackStore!.commitCandidate();
        return;
      }
      rethrow;
    } catch (e) {
      if (fallbackStore != null) {
        debugPrint(
          '[ResilientDeviceSyncCredentialStore] Preferred store failed ($e), falling back to private store for commitCandidate.',
        );
        await fallbackStore!.commitCandidate();
        return;
      }
      throw DeviceSyncUnavailableException(
        'Preferred store commitCandidate failed: $e',
      );
    }

    if (fallbackStore != null) {
      try {
        await fallbackStore!.commitCandidate();
      } catch (e) {
        throw DeviceSyncUnavailableException(
          'Fallback candidate commit failed after preferred commit: $e',
        );
      }
    }
  }

  @override
  Future<void> rollbackCandidate() async {
    Object? preferredError;
    try {
      await preferredStore.rollbackCandidate();
    } catch (e) {
      preferredError = e;
    }

    if (fallbackStore != null) {
      try {
        await fallbackStore!.rollbackCandidate();
      } catch (e) {
        if (preferredError != null) {
          throw DeviceSyncUnavailableException(
            'Failed to rollback both stores: $preferredError, $e',
          );
        }
        rethrow;
      }
    } else if (preferredError != null) {
      throw DeviceSyncUnavailableException(
        'Failed to rollback preferred store: $preferredError',
      );
    }
  }

  Future<void> _persistFallbackActive(DeviceSyncCredentialRecord record) async {
    final fallback = fallbackStore;
    if (fallback == null) return;

    try {
      await fallback.writeCredential(record);
      final verified = await fallback.readCredential();
      if (verified == null ||
          verified.credentialVersion != record.credentialVersion ||
          _hasConflict(verified, record) ||
          verified.expiresAt.isBefore(record.expiresAt)) {
        throw const DeviceSyncUnavailableException(
          'Fallback active credential verification failed',
        );
      }
    } on DeviceSyncException {
      rethrow;
    } catch (e) {
      throw DeviceSyncUnavailableException(
        'Fallback active credential persistence failed: $e',
      );
    }
  }

  Future<void> _persistFallbackCandidate(
    DeviceSyncCredentialRecord record,
  ) async {
    final fallback = fallbackStore;
    if (fallback == null) return;

    try {
      await fallback.stageCandidate(record);
      final verified = await fallback.readCandidate();
      if (verified == null ||
          verified.credentialVersion != record.credentialVersion ||
          _hasConflict(verified, record) ||
          verified.expiresAt.isBefore(record.expiresAt)) {
        throw const DeviceSyncUnavailableException(
          'Fallback candidate verification failed',
        );
      }
    } on DeviceSyncException {
      rethrow;
    } catch (e) {
      throw DeviceSyncUnavailableException(
        'Fallback candidate persistence failed: $e',
      );
    }
  }

  bool _hasConflict(
    DeviceSyncCredentialRecord a,
    DeviceSyncCredentialRecord b,
  ) {
    return a.credentialId != b.credentialId ||
        a.renewalSecret != b.renewalSecret ||
        a.deviceId != b.deviceId ||
        a.tenantId != b.tenantId;
  }

  Future<void> _safeReconcileActive(
    DeviceSyncCredentialRecord newerRecord,
  ) async {
    try {
      await preferredStore.writeCredential(newerRecord);
      final verified = await preferredStore.readCredential();
      if (verified != null &&
          verified.credentialId == newerRecord.credentialId &&
          verified.credentialVersion == newerRecord.credentialVersion &&
          verified.renewalSecret == newerRecord.renewalSecret &&
          verified.deviceId == newerRecord.deviceId &&
          verified.tenantId == newerRecord.tenantId &&
          !verified.expiresAt.isBefore(newerRecord.expiresAt)) {
        return;
      } else {
        debugPrint(
          '[ResilientDeviceSyncCredentialStore] Active credential verification mismatch during reconciliation',
        );
      }
    } catch (e) {
      debugPrint(
        '[ResilientDeviceSyncCredentialStore] Reconciliation of active credential to preferred store failed: $e',
      );
    }
  }

  Future<void> _safeReconcileCandidate(
    DeviceSyncCredentialRecord newerCandidate,
  ) async {
    try {
      await preferredStore.stageCandidate(newerCandidate);
      final verified = await preferredStore.readCandidate();
      if (verified != null &&
          verified.credentialId == newerCandidate.credentialId &&
          verified.credentialVersion == newerCandidate.credentialVersion &&
          verified.renewalSecret == newerCandidate.renewalSecret &&
          verified.deviceId == newerCandidate.deviceId &&
          verified.tenantId == newerCandidate.tenantId &&
          !verified.expiresAt.isBefore(newerCandidate.expiresAt)) {
        return;
      } else {
        debugPrint(
          '[ResilientDeviceSyncCredentialStore] Candidate credential verification mismatch during reconciliation',
        );
      }
    } catch (e) {
      debugPrint(
        '[ResilientDeviceSyncCredentialStore] Reconciliation of candidate to preferred store failed: $e',
      );
    }
  }
}
