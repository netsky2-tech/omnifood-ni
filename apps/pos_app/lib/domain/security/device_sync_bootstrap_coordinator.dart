import 'dart:async';
import '../models/user.dart';
import '../../data/ports/activation_sync_port.dart';
import 'device_sync_credential_coordinator.dart';
import 'device_sync_credential_record.dart';
import 'device_sync_credential_store.dart';
import 'device_sync_exceptions.dart';

enum DeviceSyncBootstrapStatus {
  skippedNonOwner,
  noOpAlreadyActive,
  confirmedStagedCandidate,
  provisionedAndConfirmed,
}

class DeviceSyncBootstrapResult {
  final DeviceSyncBootstrapStatus status;
  final DeviceSyncCredentialRecord? record;
  final String? message;

  const DeviceSyncBootstrapResult({
    required this.status,
    this.record,
    this.message,
  });

  bool get isSuccessful =>
      status == DeviceSyncBootstrapStatus.noOpAlreadyActive ||
      status == DeviceSyncBootstrapStatus.confirmedStagedCandidate ||
      status == DeviceSyncBootstrapStatus.provisionedAndConfirmed;
}

class DeviceSyncBootstrapCoordinator {
  DeviceSyncBootstrapCoordinator({
    required DeviceSyncCredentialStore store,
    required ActivationSyncPort activationSyncPort,
    required Future<String> Function() resolveDeviceId,
    Future<String?> Function()? resolveAttemptId,
    DeviceSyncCredentialCoordinator? credentialCoordinator,
    DateTime Function()? nowUtc,
  }) : _store = store,
       _activationSyncPort = activationSyncPort,
       _resolveDeviceId = resolveDeviceId,
       _resolveAttemptId = resolveAttemptId,
       _credentialCoordinator = credentialCoordinator,
       _nowUtc = nowUtc ?? (() => DateTime.now().toUtc());

  final DeviceSyncCredentialStore _store;
  final ActivationSyncPort _activationSyncPort;
  final Future<String> Function() _resolveDeviceId;
  final Future<String?> Function()? _resolveAttemptId;
  final DeviceSyncCredentialCoordinator? _credentialCoordinator;
  final DateTime Function() _nowUtc;

  DeviceSyncBootstrapResult? _lastResult;
  String? _lastError;

  DeviceSyncBootstrapResult? get lastResult => _lastResult;
  String? get lastError => _lastError;

  /// Bootstrap device sync credentials after OWNER cloud login.
  /// Strictly skips execution if [user.role] is not [UserRole.owner].
  Future<DeviceSyncBootstrapResult> bootstrap({
    required User user,
    String? attemptId,
  }) async {
    // 1. Role enforcement: OWNER ONLY
    if (user.role != UserRole.owner) {
      final result = const DeviceSyncBootstrapResult(
        status: DeviceSyncBootstrapStatus.skippedNonOwner,
        message: 'Device sync bootstrap skipped: user is not OWNER',
      );
      _lastResult = result;
      _lastError = null;
      return result;
    }

    final canonicalDeviceId = await _resolveDeviceId();

    // 2. Check local staged candidate (PENDING / confirm uncertainty)
    final candidate = await _store.readCandidate();
    if (candidate != null) {
      final targetAttemptId = attemptId ?? (await _resolveAttemptId?.call());

      try {
        final DeviceSyncCredentialRecord confirmed;
        if (targetAttemptId != null && targetAttemptId.trim().isNotEmpty) {
          confirmed = await _activationSyncPort.confirmDeviceSyncCredential(
            attemptId: targetAttemptId,
            credentialId: candidate.credentialId,
            deviceId: candidate.deviceId,
            credentialVersion: candidate.credentialVersion,
            renewalSecret: candidate.renewalSecret,
          );
        } else {
          confirmed = await _activationSyncPort
              .confirmBootstrapDeviceSyncCredential(
                credentialId: candidate.credentialId,
                deviceId: candidate.deviceId,
                credentialVersion: candidate.credentialVersion,
                renewalSecret: candidate.renewalSecret,
              );
        }

        final recordToCommit = _resolveRecordToCommit(
          confirmed: confirmed,
          candidate: candidate,
          canonicalDeviceId: canonicalDeviceId,
        );

        // Re-stage confirmed record and commit to active locally
        await _store.stageCandidate(recordToCommit);
        await _store.commitCandidate();
        _credentialCoordinator?.invalidateAccessToken();

        final result = DeviceSyncBootstrapResult(
          status: DeviceSyncBootstrapStatus.confirmedStagedCandidate,
          record: recordToCommit,
        );
        _lastResult = result;
        _lastError = null;
        return result;
      } on DeviceSyncRecoveryRequiredException {
        // Server indicates credential is in terminal state / retired / superseded
        await _store.rollbackCandidate();
        _lastError = 'DeviceSyncRecoveryRequiredException';
        rethrow;
      } on DeviceSyncRevokedException {
        await _store.rollbackCandidate();
        _lastError = 'DeviceSyncRevokedException';
        rethrow;
      } catch (e) {
        _lastError = e.runtimeType.toString();
        // Network or retryable error: keep candidate staged for next retry, rethrow
        rethrow;
      }
    }

    // 3. Check active credential in store
    final active = await _store.readCredential();
    if (active != null) {
      if (_credentialCoordinator != null && _credentialCoordinator!.isRevoked) {
        _lastError = 'DeviceSyncRecoveryRequiredException';
        throw const DeviceSyncRecoveryRequiredException(
          'Device sync is revoked; explicit recovery required',
        );
      }

      if (active.isRenewalExpired(_nowUtc())) {
        _lastError = 'DeviceSyncRecoveryRequiredException';
        throw const DeviceSyncRecoveryRequiredException(
          'Device renewal credential is expired; explicit recovery required',
        );
      }

      if (active.deviceId.trim() != canonicalDeviceId.trim()) {
        _lastError = 'StateError';
        throw StateError(
          'Active credential device ID (${active.deviceId}) does not match canonical terminal ($canonicalDeviceId)',
        );
      }

      // ACTIVE local valid => no-op!
      final result = DeviceSyncBootstrapResult(
        status: DeviceSyncBootstrapStatus.noOpAlreadyActive,
        record: active,
      );
      _lastResult = result;
      _lastError = null;
      return result;
    }

    // 4. MISSING local material: provision -> stage/verify -> confirm -> commit
    final targetAttemptId = attemptId ?? (await _resolveAttemptId?.call());
    final DeviceSyncCredentialRecord pendingRecord;
    try {
      if (targetAttemptId != null && targetAttemptId.trim().isNotEmpty) {
        pendingRecord = await _activationSyncPort.provisionDeviceSyncCredential(
          attemptId: targetAttemptId,
          expectedDeviceId: canonicalDeviceId,
        );
      } else {
        pendingRecord = await _activationSyncPort
            .provisionBootstrapDeviceSyncCredential(
              deviceId: canonicalDeviceId,
            );
      }
    } catch (e) {
      _lastError = e.runtimeType.toString();
      rethrow;
    }

    // If server returned active record with no secret (no-op on server), but local has missing secret:
    if (pendingRecord.renewalSecret.trim().isEmpty) {
      _lastError = 'DeviceSyncRecoveryRequiredException';
      throw const DeviceSyncRecoveryRequiredException(
        'Server credential is ACTIVE but local material is missing; manual recovery required',
      );
    }

    if (pendingRecord.deviceId.trim() != canonicalDeviceId.trim()) {
      _lastError = 'DeviceSyncPersistenceVerificationException';
      throw const DeviceSyncPersistenceVerificationException(
        'Server returned credential with mismatched canonical device ID',
      );
    }

    // Phase 1: Stage candidate locally
    await _store.stageCandidate(pendingRecord);

    // Phase 1 Verification: Read back candidate to ensure persistence integrity
    final verified = await _store.readCandidate();
    if (verified == null ||
        verified.credentialId != pendingRecord.credentialId ||
        verified.renewalSecret != pendingRecord.renewalSecret ||
        verified.credentialVersion != pendingRecord.credentialVersion ||
        verified.deviceId != canonicalDeviceId) {
      try {
        await _store.rollbackCandidate();
      } catch (_) {}
      _lastError = 'DeviceSyncPersistenceVerificationException';
      throw const DeviceSyncPersistenceVerificationException(
        'Device sync credential candidate persistence verification failed; confirmation aborted',
      );
    }

    // Phase 2: Confirm with server
    DeviceSyncCredentialRecord confirmedRecord;
    try {
      if (targetAttemptId != null && targetAttemptId.trim().isNotEmpty) {
        confirmedRecord = await _activationSyncPort.confirmDeviceSyncCredential(
          attemptId: targetAttemptId,
          credentialId: verified.credentialId,
          deviceId: canonicalDeviceId,
          credentialVersion: verified.credentialVersion,
          renewalSecret: verified.renewalSecret,
        );
      } else {
        confirmedRecord = await _activationSyncPort
            .confirmBootstrapDeviceSyncCredential(
              credentialId: verified.credentialId,
              deviceId: canonicalDeviceId,
              credentialVersion: verified.credentialVersion,
              renewalSecret: verified.renewalSecret,
            );
      }
    } catch (e) {
      _lastError = e.runtimeType.toString();
      // Confirm failed: candidate remains staged in store for retry!
      rethrow;
    }

    // Phase 3: Validate confirmed response and re-stage before active commit
    final DeviceSyncCredentialRecord recordToCommit;
    try {
      recordToCommit = _resolveRecordToCommit(
        confirmed: confirmedRecord,
        candidate: verified,
        canonicalDeviceId: canonicalDeviceId,
      );
    } catch (e) {
      _lastError = e.runtimeType.toString();
      rethrow;
    }

    // Re-stage confirmed record and mark local lifecycle active by committing candidate
    await _store.stageCandidate(recordToCommit);
    await _store.commitCandidate();
    _credentialCoordinator?.invalidateAccessToken();

    final result = DeviceSyncBootstrapResult(
      status: DeviceSyncBootstrapStatus.provisionedAndConfirmed,
      record: recordToCommit,
    );
    _lastResult = result;
    _lastError = null;
    return result;
  }

  DeviceSyncCredentialRecord _resolveRecordToCommit({
    required DeviceSyncCredentialRecord confirmed,
    required DeviceSyncCredentialRecord candidate,
    required String canonicalDeviceId,
  }) {
    if (confirmed.credentialId != candidate.credentialId ||
        confirmed.credentialVersion != candidate.credentialVersion ||
        confirmed.deviceId.trim() != canonicalDeviceId.trim() ||
        confirmed.deviceId.trim() != candidate.deviceId.trim()) {
      throw const DeviceSyncPersistenceVerificationException(
        'Server confirmed credential response failed identity or device binding verification',
      );
    }

    if (confirmed.renewalSecret.trim().isNotEmpty &&
        confirmed.renewalSecret != candidate.renewalSecret) {
      throw const DeviceSyncPersistenceVerificationException(
        'Server confirmed credential response failed secret verification',
      );
    }

    return confirmed.renewalSecret.trim().isEmpty
        ? confirmed.copyWith(renewalSecret: candidate.renewalSecret)
        : confirmed;
  }
}
