import 'dart:convert';
import 'package:uuid/uuid.dart';
import '../database/app_database.dart';
import '../models/activation/activation_attempt_local_entity.dart';
import '../models/activation/activation_check_result_local_entity.dart';
import '../models/activation/activation_outbox_envelope_entity.dart';
import '../ports/activation_sync_port.dart';

class ActivationReconnectSyncParams {
  final String tenantId;
  final String attemptId;

  const ActivationReconnectSyncParams({
    required this.tenantId,
    required this.attemptId,
  });
}

class ActivationReconnectSyncResult {
  final bool isSuccess;
  final String attemptStatus;
  final int syncedEnvelopesCount;
  final int pendingEnvelopesCount;
  final FinalizeActivationResult? backendFinalizeResult;
  final List<String> errors;

  const ActivationReconnectSyncResult({
    required this.isSuccess,
    required this.attemptStatus,
    this.syncedEnvelopesCount = 0,
    this.pendingEnvelopesCount = 0,
    this.backendFinalizeResult,
    this.errors = const [],
  });
}

class ActivationReconnectSyncRunner {
  final AppDatabase _database;
  final ActivationSyncPort _syncPort;

  ActivationReconnectSyncRunner({
    required AppDatabase database,
    required ActivationSyncPort syncPort,
  })  : _database = database,
        _syncPort = syncPort;

  Future<ActivationReconnectSyncResult> syncActivationEvidence(
    ActivationReconnectSyncParams params,
  ) async {
    final trimmedTenantId = params.tenantId.trim();
    final trimmedAttemptId = params.attemptId.trim();
    final errors = <String>[];

    // 1. Fetch Attempt & Assert Pre-Conditions
    var attempt = await _database.activationAttemptLocalDao.getAttemptById(trimmedAttemptId);
    if (attempt == null) {
      return ActivationReconnectSyncResult(
        isSuccess: false,
        attemptStatus: 'NOT_FOUND',
        errors: ["ActivationAttemptLocal '$trimmedAttemptId' not found in SQLite"],
      );
    }

    if (attempt.tenantId.trim() != trimmedTenantId) {
      return ActivationReconnectSyncResult(
        isSuccess: false,
        attemptStatus: attempt.localStatus,
        errors: [
          "TENANT_MISMATCH: Attempt tenant '${attempt.tenantId}' does not match requested '$trimmedTenantId'",
        ],
      );
    }

    // Attempt must have completed local checks before reconnecting
    if (attempt.localStatus != 'LOCAL_ACTIVATION_EVIDENCE_COMPLETE' &&
        attempt.localStatus != 'SYNC_VERIFICATION_PENDING' &&
        attempt.localStatus != 'EVIDENCE_ACKED') {
      return ActivationReconnectSyncResult(
        isSuccess: false,
        attemptStatus: attempt.localStatus,
        errors: [
          "ATTEMPT_NOT_READY_FOR_SYNC: Attempt is in status '${attempt.localStatus}', must be in 'LOCAL_ACTIVATION_EVIDENCE_COMPLETE' or 'SYNC_VERIFICATION_PENDING'",
        ],
      );
    }

    // 2. Transition from LOCAL_ACTIVATION_EVIDENCE_COMPLETE -> SYNC_VERIFICATION_PENDING
    final nowIso = DateTime.now().toUtc().toIso8601String();
    if (attempt.localStatus == 'LOCAL_ACTIVATION_EVIDENCE_COMPLETE') {
      attempt = attempt.copyWith(
        localStatus: 'SYNC_VERIFICATION_PENDING',
        updatedAt: nowIso,
      );
      await _database.activationAttemptLocalDao.updateAttempt(attempt);
    }

    // 3. Flush Outbox Envelopes for this attempt to cloud
    final pendingEnvelopes = await _database.activationOutboxDao.getPendingEnvelopes(trimmedTenantId);
    final attemptEnvelopes = pendingEnvelopes
        .where((e) => e.activationAttemptId == trimmedAttemptId)
        .toList();

    int syncedCount = 0;
    bool syncFailed = false;

    for (final env in attemptEnvelopes) {
      bool delivered = false;
      try {
        final Map<String, dynamic> payload = jsonDecode(env.payloadJson) as Map<String, dynamic>;

        switch (env.eventType) {
          case 'ACTIVATION_CHECK':
            delivered = await _syncPort.sendCheck(
              attemptId: trimmedAttemptId,
              checkCode: (payload['checkCode'] as String?) ?? '',
              status: (payload['status'] as String?) ?? 'PASS',
              evidenceType: payload['evidenceType'] as String?,
              evidenceRef: payload['evidenceRef'] as String?,
              occurredAt: payload['occurredAt'] as String?,
              details: payload['details'] as Map<String, dynamic>?,
              tenantId: trimmedTenantId,
              terminalId: attempt.candidateTerminalId,
            );
            break;

          case 'FIRST_SUCCESSFUL_SALE_OBSERVED':
            delivered = await _syncPort.sendFirstSaleClaim(
              attemptId: trimmedAttemptId,
              claimPayload: payload,
            );
            break;

          case 'VERIFICATION_SALE':
            delivered = await _syncPort.sendVerificationSale(
              attemptId: trimmedAttemptId,
              salePayload: payload,
            );
            break;

          default:
            delivered = true;
            break;
        }
      } catch (e) {
        delivered = false;
        errors.add("Error delivering envelope '${env.id}': $e");
      }

      if (delivered) {
        final updatedEnv = ActivationOutboxEnvelopeEntity(
          id: env.id,
          tenantId: env.tenantId,
          activationAttemptId: env.activationAttemptId,
          eventType: env.eventType,
          idempotencyKey: env.idempotencyKey,
          payloadJson: env.payloadJson,
          payloadHash: env.payloadHash,
          syncStatus: 'SYNCED',
          createdAt: env.createdAt,
        );
        await _database.activationOutboxDao.updateEnvelope(updatedEnv);
        syncedCount++;
      } else {
        syncFailed = true;
        errors.add("Delivery unacknowledged for envelope '${env.id}' (${env.eventType})");
      }
    }

    // 4. Verify whether all envelopes for this attempt have been ACKed
    final remainingPending = await _database.activationOutboxDao.getPendingEnvelopes(trimmedTenantId);
    final remainingForAttempt = remainingPending
        .where((e) => e.activationAttemptId == trimmedAttemptId)
        .toList();

    if (remainingForAttempt.isNotEmpty || syncFailed) {
      // WAN dropped or cloud error occurred: stay in SYNC_VERIFICATION_PENDING, NEVER claim ACTIVATED
      return ActivationReconnectSyncResult(
        isSuccess: false,
        attemptStatus: attempt.localStatus,
        syncedEnvelopesCount: syncedCount,
        pendingEnvelopesCount: remainingForAttempt.length,
        errors: errors,
      );
    }

    // 5. Transition to EVIDENCE_ACKED
    final ackedIso = DateTime.now().toUtc().toIso8601String();
    attempt = attempt.copyWith(
      localStatus: 'EVIDENCE_ACKED',
      updatedAt: ackedIso,
    );
    await _database.activationAttemptLocalDao.updateAttempt(attempt);

    // 6. Record the successful reconnect as required evidence before finalization.
    // It is sent directly because all durable outbox envelopes have already been ACKed.
    final reconnectOccurredAt = DateTime.now().toUtc().toIso8601String();
    final reconnectDelivered = await _syncPort.sendCheck(
      attemptId: trimmedAttemptId,
      checkCode: 'POST_RECONNECT_SYNC',
      status: 'PASS',
      evidenceType: 'ACTIVATION_OUTBOX_ACK',
      evidenceRef: 'ALL_ACTIVATION_ENVELOPES_ACKED',
      occurredAt: reconnectOccurredAt,
      details: {'syncedEnvelopesCount': syncedCount},
      tenantId: trimmedTenantId,
      terminalId: attempt.candidateTerminalId,
    );
    if (!reconnectDelivered) {
      errors.add('POST_RECONNECT_SYNC delivery unacknowledged');
      return ActivationReconnectSyncResult(
        isSuccess: false,
        attemptStatus: attempt.localStatus,
        syncedEnvelopesCount: syncedCount,
        pendingEnvelopesCount: 0,
        errors: errors,
      );
    }
    await _database.activationCheckResultLocalDao.insertOrReplace(
      ActivationCheckResultLocalEntity(
        id: const Uuid().v4(),
        tenantId: trimmedTenantId,
        activationAttemptId: trimmedAttemptId,
        checkCode: 'POST_RECONNECT_SYNC',
        status: 'PASS',
        evidenceType: 'ACTIVATION_OUTBOX_ACK',
        evidenceRef: 'ALL_ACTIVATION_ENVELOPES_ACKED',
        occurredAt: reconnectOccurredAt,
        recordedAt: reconnectOccurredAt,
        detailsSanitizedJson: jsonEncode({'syncedEnvelopesCount': syncedCount}),
      ),
    );

    // 7. Request Authoritative Finalizer Verdict from Cloud
    final finalizeResult = await _syncPort.finalizeActivation(
      tenantId: trimmedTenantId,
      attemptId: trimmedAttemptId,
    );

    if (!finalizeResult.isSuccess) {
      // Cloud finalizer was unreachable or returned network error:
      // POS MUST REMAIN in EVIDENCE_ACKED; NEVER unilaterally show ACTIVATED
      errors.add(
        "Finalizer communication error: ${finalizeResult.failureCode ?? 'UNKNOWN_FINALIZER_ERROR'}",
      );
      return ActivationReconnectSyncResult(
        isSuccess: false,
        attemptStatus: attempt.localStatus,
        syncedEnvelopesCount: syncedCount,
        pendingEnvelopesCount: 0,
        backendFinalizeResult: finalizeResult,
        errors: errors,
      );
    }

    // 7. Authoritatively update POS state based on backend classification
    String targetStatus;
    if (finalizeResult.status == 'PASS') {
      targetStatus = 'ACTIVATED';
    } else if (finalizeResult.status == 'PASS_WITH_WARNING') {
      targetStatus = 'ACTIVATED_WITH_WARNING';
    } else {
      targetStatus = 'FAILED';
    }

    attempt = attempt.copyWith(
      localStatus: targetStatus,
      updatedAt: DateTime.now().toUtc().toIso8601String(),
    );
    await _database.activationAttemptLocalDao.updateAttempt(attempt);

    return ActivationReconnectSyncResult(
      isSuccess: targetStatus != 'FAILED',
      attemptStatus: targetStatus,
      syncedEnvelopesCount: syncedCount,
      pendingEnvelopesCount: 0,
      backendFinalizeResult: finalizeResult,
      errors: errors,
    );
  }
}
