import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:path/path.dart' as p;

import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/activation/activation_attempt_local_entity.dart';
import 'package:pos_app/data/models/activation/activation_check_result_local_entity.dart';
import 'package:pos_app/data/models/activation/activation_outbox_envelope_entity.dart';
import 'package:pos_app/data/models/activation/first_successful_sale_claim_entity.dart';
import 'package:pos_app/data/ports/activation_sync_port.dart';
import 'package:pos_app/data/services/activation_reconnect_sync_runner.dart';

class FakeActivationSyncPort extends ActivationSyncPort {
  bool simulateNetworkFailure = false;
  bool simulateFinalizeFailure = false;
  String finalizeVerdict = 'PASS';
  String? finalizeFailureCode;
  int finalizeWarningsCount = 0;

  /// Check codes whose sendCheck must report a failed (unacknowledged) delivery.
  /// Unlike [simulateNetworkFailure] this leaves other deliveries intact so a
  /// single bad replay can be isolated.
  final Set<String> failCheckCodes = {};

  /// Chronological log of every port call, for ordering assertions.
  final List<String> callLog = [];

  final List<Map<String, dynamic>> sentChecks = [];
  final List<Map<String, dynamic>> sentClaims = [];
  final List<Map<String, dynamic>> sentSales = [];
  final List<String> finalizeCalls = [];

  @override
  Future<bool> sendCheck({
    required String attemptId,
    required String checkCode,
    required String status,
    String? evidenceType,
    String? evidenceRef,
    String? occurredAt,
    Map<String, dynamic>? details,
    String? tenantId,
    String? terminalId,
  }) async {
    if (simulateNetworkFailure) return false;
    if (failCheckCodes.contains(checkCode)) return false;
    callLog.add('sendCheck:$checkCode');
    sentChecks.add({
      'attemptId': attemptId,
      'checkCode': checkCode,
      'status': status,
      'evidenceType': evidenceType,
      'evidenceRef': evidenceRef,
      'occurredAt': occurredAt,
      'details': details,
      'tenantId': tenantId,
      'terminalId': terminalId,
    });
    return true;
  }

  @override
  Future<bool> sendFirstSaleClaim({
    required String attemptId,
    required Map<String, dynamic> claimPayload,
  }) async {
    if (simulateNetworkFailure) return false;
    callLog.add('sendFirstSaleClaim');
    sentClaims.add({
      'attemptId': attemptId,
      'payload': claimPayload,
    });
    return true;
  }

  @override
  Future<bool> sendVerificationSale({
    required String attemptId,
    required Map<String, dynamic> salePayload,
  }) async {
    if (simulateNetworkFailure) return false;
    callLog.add('sendVerificationSale');
    sentSales.add({
      'attemptId': attemptId,
      'payload': salePayload,
    });
    return true;
  }

  @override
  Future<FinalizeActivationResult> finalizeActivation({
    required String tenantId,
    required String attemptId,
  }) async {
    callLog.add('finalizeActivation');
    if (simulateFinalizeFailure) {
      return const FinalizeActivationResult(
        isSuccess: false,
        status: 'NETWORK_ERROR',
        failureCode: 'WAN_TIMEOUT',
      );
    }
    finalizeCalls.add('$tenantId:$attemptId');
    return FinalizeActivationResult(
      isSuccess: true,
      status: finalizeVerdict,
      failureCode: finalizeFailureCode,
      warningsCount: finalizeWarningsCount,
    );
  }
}

void main() {
  late AppDatabase database;
  late FakeActivationSyncPort syncPort;
  late ActivationReconnectSyncRunner syncRunner;

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  setUp(() async {
    database = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();
    syncPort = FakeActivationSyncPort();
    syncRunner = ActivationReconnectSyncRunner(
      database: database,
      syncPort: syncPort,
    );
  });

  tearDown(() async {
    await database.close();
  });

  group('ONB1.8G — Reconnect & Evidence Sync Runner', () {
    const tenantId = 'tenant-founder-01';
    const attemptId = 'attempt-pr21-uuid-sync';
    const terminalId = 'pos-terminal-founder-01';

    Future<void> seedEvidenceComplete({String localStatus = 'LOCAL_ACTIVATION_EVIDENCE_COMPLETE'}) async {
      await database.activationAttemptLocalDao.saveAttempt(
        ActivationAttemptLocalEntity(
          attemptId: attemptId,
          tenantId: tenantId,
          candidateTerminalId: terminalId,
          localStatus: localStatus,
          requiredFiscalRevision: 1,
          requiredFiscalFingerprint: 'fiscal-fp-123',
          verificationProductId: 'prod-001',
          verificationTicketId: 'ticket-paid-001',
          assignedAt: '2026-09-04T12:00:00.000Z',
          updatedAt: '2026-09-04T12:00:00.000Z',
        ),
      );

      // Seed outbox envelopes
      final env1 = ActivationOutboxEnvelopeEntity(
        id: 'env-check-1',
        tenantId: tenantId,
        activationAttemptId: attemptId,
        eventType: 'ACTIVATION_CHECK',
        idempotencyKey: 'activation:check:$tenantId:$attemptId:OFFLINE_SALE_PAID',
        payloadJson: jsonEncode({
          'checkCode': 'OFFLINE_SALE_PAID',
          'status': 'PASS',
          'evidenceRef': 'ticket-paid-001',
          'occurredAt': '2026-09-04T12:00:05.000Z',
        }),
        payloadHash: 'hash-check-1',
        syncStatus: 'PENDING',
        createdAt: '2026-09-04T12:00:05.000Z',
      );

      final env2 = ActivationOutboxEnvelopeEntity(
        id: 'env-claim-1',
        tenantId: tenantId,
        activationAttemptId: attemptId,
        eventType: 'FIRST_SUCCESSFUL_SALE_OBSERVED',
        idempotencyKey: 'onboarding:first-sale:$tenantId',
        payloadJson: jsonEncode({
          'ticketId': 'ticket-paid-001',
          'tenantId': tenantId,
          'terminalId': terminalId,
          'clockConfidence': 'ANCHORED',
          'anchoredOccurredAt': '2026-09-04T12:00:05.000Z',
        }),
        payloadHash: 'hash-claim-1',
        syncStatus: 'PENDING',
        createdAt: '2026-09-04T12:00:05.000Z',
      );

      final env3 = ActivationOutboxEnvelopeEntity(
        id: 'env-sale-1',
        tenantId: tenantId,
        activationAttemptId: attemptId,
        eventType: 'VERIFICATION_SALE',
        idempotencyKey: 'activation:sale:$tenantId:$attemptId:ticket-paid-001',
        payloadJson: jsonEncode({
          'invoiceId': 'ticket-paid-001',
          'total': 50.0,
          'paymentStatus': 'paid',
        }),
        payloadHash: 'hash-sale-1',
        syncStatus: 'PENDING',
        createdAt: '2026-09-04T12:00:05.000Z',
      );

      await database.activationOutboxDao.insertEnvelopes([env1, env2, env3]);
    }

    test('fails if attempt is not in LOCAL_ACTIVATION_EVIDENCE_COMPLETE or SYNC_VERIFICATION_PENDING', () async {
      await seedEvidenceComplete(localStatus: 'RUNNING');

      final result = await syncRunner.syncActivationEvidence(
        const ActivationReconnectSyncParams(tenantId: tenantId, attemptId: attemptId),
      );

      expect(result.isSuccess, isFalse);
      expect(result.attemptStatus, equals('RUNNING'));
      expect(result.errors.first, contains('ATTEMPT_NOT_READY_FOR_SYNC'));
    });

    test('transitions through SYNC_VERIFICATION_PENDING and flushes all outbox envelopes to cloud', () async {
      await seedEvidenceComplete();

      final result = await syncRunner.syncActivationEvidence(
        const ActivationReconnectSyncParams(tenantId: tenantId, attemptId: attemptId),
      );

      expect(result.isSuccess, isTrue);
      expect(result.syncedEnvelopesCount, equals(3));
      expect(result.pendingEnvelopesCount, equals(0));

      // Verifies endpoints hit in FakeActivationSyncPort
      expect(syncPort.sentChecks.length, equals(2));
      expect(
        syncPort.sentChecks.map((check) => check['checkCode']),
        contains('POST_RECONNECT_SYNC'),
      );
      final reconnectCheck = await database.activationCheckResultLocalDao.getCheck(
        tenantId,
        attemptId,
        'POST_RECONNECT_SYNC',
      );
      expect(reconnectCheck?.status, equals('PASS'));
      expect(syncPort.sentClaims.length, equals(1));
      expect(syncPort.sentSales.length, equals(1));

      // In SQLite, envelopes syncStatus must now be SYNCED
      final pendingAfter = await database.activationOutboxDao.getPendingEnvelopes(tenantId);
      expect(pendingAfter, isEmpty);
    });

    test('when WAN drops during sync, leaves un-synced envelopes as PENDING and attempt in SYNC_VERIFICATION_PENDING (NEVER ACTIVATED)', () async {
      await seedEvidenceComplete();
      syncPort.simulateNetworkFailure = true;

      final result = await syncRunner.syncActivationEvidence(
        const ActivationReconnectSyncParams(tenantId: tenantId, attemptId: attemptId),
      );

      expect(result.isSuccess, isFalse);
      expect(result.attemptStatus, equals('SYNC_VERIFICATION_PENDING'));

      // POS must remain in SYNC_VERIFICATION_PENDING in SQLite
      final attemptInDb = await database.activationAttemptLocalDao.getAttemptById(attemptId);
      expect(attemptInDb!.localStatus, equals('SYNC_VERIFICATION_PENDING'));
      expect(attemptInDb.localStatus, isNot('ACTIVATED'));

      // Envelopes must still be PENDING in SQLite
      final pendingAfter = await database.activationOutboxDao.getPendingEnvelopes(tenantId);
      expect(pendingAfter.length, equals(3));
    });

    test('POS waits for cloud authoritative finalizer verdict: adopts PASS -> ACTIVATED', () async {
      await seedEvidenceComplete();
      syncPort.finalizeVerdict = 'PASS';

      final result = await syncRunner.syncActivationEvidence(
        const ActivationReconnectSyncParams(tenantId: tenantId, attemptId: attemptId),
      );

      expect(result.isSuccess, isTrue);
      expect(result.attemptStatus, equals('ACTIVATED'));

      final attemptInDb = await database.activationAttemptLocalDao.getAttemptById(attemptId);
      expect(attemptInDb!.localStatus, equals('ACTIVATED'));
    });

    test('POS waits for cloud authoritative finalizer verdict: adopts PASS_WITH_WARNING -> ACTIVATED_WITH_WARNING', () async {
      await seedEvidenceComplete();
      syncPort.finalizeVerdict = 'PASS_WITH_WARNING';
      syncPort.finalizeWarningsCount = 1;

      final result = await syncRunner.syncActivationEvidence(
        const ActivationReconnectSyncParams(tenantId: tenantId, attemptId: attemptId),
      );

      expect(result.isSuccess, isTrue);
      expect(result.attemptStatus, equals('ACTIVATED_WITH_WARNING'));

      final attemptInDb = await database.activationAttemptLocalDao.getAttemptById(attemptId);
      expect(attemptInDb!.localStatus, equals('ACTIVATED_WITH_WARNING'));
    });

    test('cloud unavailable during finalize leaves attempt in EVIDENCE_ACKED, POS NEVER assumes ACTIVATED unilaterally', () async {
      await seedEvidenceComplete();
      syncPort.simulateFinalizeFailure = true;

      final result = await syncRunner.syncActivationEvidence(
        const ActivationReconnectSyncParams(tenantId: tenantId, attemptId: attemptId),
      );

      expect(result.isSuccess, isFalse);
      expect(result.attemptStatus, equals('EVIDENCE_ACKED'));

      // Attempt in SQLite must be EVIDENCE_ACKED, waiting for authoritative finalizer
      final attemptInDb = await database.activationAttemptLocalDao.getAttemptById(attemptId);
      expect(attemptInDb!.localStatus, equals('EVIDENCE_ACKED'));
      expect(attemptInDb.localStatus, isNot('ACTIVATED'));
    });

    test('reconnect sync state survives restart with real SQLite disk persistence', () async {
      final tempDir = await Directory.systemTemp.createTemp('pos_sync_disk_test_');
      final dbFile = File(p.join(tempDir.path, 'pos_sync_test.db'));

      try {
        var diskDb = await $FloorAppDatabase.databaseBuilder(dbFile.path).build();

        await diskDb.activationAttemptLocalDao.saveAttempt(
          const ActivationAttemptLocalEntity(
            attemptId: attemptId,
            tenantId: tenantId,
            candidateTerminalId: terminalId,
            localStatus: 'LOCAL_ACTIVATION_EVIDENCE_COMPLETE',
            requiredFiscalRevision: 1,
            requiredFiscalFingerprint: 'fiscal-fp-123',
            verificationProductId: 'prod-001',
            verificationTicketId: 'ticket-paid-001',
            assignedAt: '2026-09-04T12:00:00.000Z',
            updatedAt: '2026-09-04T12:00:00.000Z',
          ),
        );

        await diskDb.activationOutboxDao.insertEnvelope(
          ActivationOutboxEnvelopeEntity(
            id: 'env-check-disk-1',
            tenantId: tenantId,
            activationAttemptId: attemptId,
            eventType: 'ACTIVATION_CHECK',
            idempotencyKey: 'activation:check:$tenantId:$attemptId:DISK_CHECK',
            payloadJson: jsonEncode({'checkCode': 'OFFLINE_SALE_PAID', 'status': 'PASS'}),
            payloadHash: 'hash-1',
            syncStatus: 'PENDING',
            createdAt: '2026-09-04T12:00:05.000Z',
          ),
        );

        final runner = ActivationReconnectSyncRunner(
          database: diskDb,
          syncPort: syncPort,
        );

        final res = await runner.syncActivationEvidence(
          const ActivationReconnectSyncParams(tenantId: tenantId, attemptId: attemptId),
        );
        expect(res.isSuccess, isTrue);
        expect(res.attemptStatus, equals('ACTIVATED'));

        // Close database (simulate reboot)
        await diskDb.close();

        // Reopen database from disk
        diskDb = await $FloorAppDatabase.databaseBuilder(dbFile.path).build();
        final reloadedAttempt = await diskDb.activationAttemptLocalDao.getAttemptById(attemptId);
        expect(reloadedAttempt, isNotNull);
        expect(reloadedAttempt!.localStatus, equals('ACTIVATED'));

        final reloadedPending = await diskDb.activationOutboxDao.getPendingEnvelopes(tenantId);
        expect(reloadedPending, isEmpty);

        await diskDb.close();
      } finally {
        if (await tempDir.exists()) {
          await tempDir.delete(recursive: true);
        }
      }
    });
  });

  group('ONB1.8H — Persisted check replay before reconnect sync', () {
    const tenantId = 'tenant-founder-01';
    const attemptId = 'attempt-pr21-uuid-replay';
    const terminalId = 'pos-terminal-founder-01';

    Future<void> seedAttemptWithEvidence() async {
      await database.activationAttemptLocalDao.saveAttempt(
        ActivationAttemptLocalEntity(
          attemptId: attemptId,
          tenantId: tenantId,
          candidateTerminalId: terminalId,
          localStatus: 'LOCAL_ACTIVATION_EVIDENCE_COMPLETE',
          requiredFiscalRevision: 1,
          requiredFiscalFingerprint: 'fiscal-fp-123',
          verificationProductId: 'prod-001',
          verificationTicketId: 'ticket-paid-001',
          assignedAt: '2026-09-04T12:00:00.000Z',
          updatedAt: '2026-09-04T12:00:00.000Z',
        ),
      );

      // Pre-offline evidence: durable local rows, NOT outbox events.
      await database.activationCheckResultLocalDao.insertChecks([
        const ActivationCheckResultLocalEntity(
          id: 'check-1',
          tenantId: tenantId,
          activationAttemptId: attemptId,
          checkCode: 'TERMINAL_LINKED',
          status: 'PASS',
          evidenceType: 'DEVICE_LINK_ACK',
          evidenceRef: 'link-ref-001',
          occurredAt: '2026-09-04T11:55:00.000Z',
          recordedAt: '2026-09-04T11:55:00.000Z',
          detailsSanitizedJson: '{"bootSessionId":"bs-001"}',
        ),
        const ActivationCheckResultLocalEntity(
          id: 'check-2',
          tenantId: tenantId,
          activationAttemptId: attemptId,
          checkCode: 'SQLITE_DURABILITY',
          status: 'PASS',
          recordedAt: '2026-09-04T11:56:00.000Z',
        ),
      ]);

      // One outbox envelope from the controlled sale.
      await database.activationOutboxDao.insertEnvelopes([
        ActivationOutboxEnvelopeEntity(
          id: 'env-check-replay-1',
          tenantId: tenantId,
          activationAttemptId: attemptId,
          eventType: 'ACTIVATION_CHECK',
          idempotencyKey:
              'activation:check:$tenantId:$attemptId:OFFLINE_SALE_PAID',
          payloadJson: jsonEncode({
            'checkCode': 'OFFLINE_SALE_PAID',
            'status': 'PASS',
            'evidenceRef': 'ticket-paid-001',
            'occurredAt': '2026-09-04T12:00:05.000Z',
          }),
          payloadHash: 'hash-replay-1',
          syncStatus: 'PENDING',
          createdAt: '2026-09-04T12:00:05.000Z',
        ),
      ]);
    }

    test('replays every persisted check BEFORE draining the outbox and BEFORE finalize', () async {
      await seedAttemptWithEvidence();

      final result = await syncRunner.syncActivationEvidence(
        const ActivationReconnectSyncParams(tenantId: tenantId, attemptId: attemptId),
      );

      expect(result.isSuccess, isTrue, reason: result.errors.join('\n'));
      expect(result.attemptStatus, equals('ACTIVATED'));

      // Both persisted checks were replayed through the port.
      expect(
        syncPort.sentChecks.map((c) => c['checkCode']),
        containsAll(['TERMINAL_LINKED', 'SQLITE_DURABILITY']),
      );

      // Ordering: persisted-check replay first, then outbox drain, then
      // POST_RECONNECT_SYNC, then finalize last.
      final replayedTerminalLinked = syncPort.callLog.indexOf('sendCheck:TERMINAL_LINKED');
      final replayedSqlite = syncPort.callLog.indexOf('sendCheck:SQLITE_DURABILITY');
      final drainedEnvelope = syncPort.callLog.indexOf('sendCheck:OFFLINE_SALE_PAID');
      final reconnect = syncPort.callLog.indexOf('sendCheck:POST_RECONNECT_SYNC');
      final finalize = syncPort.callLog.indexOf('finalizeActivation');
      expect(replayedTerminalLinked, isNonNegative);
      expect(replayedSqlite, isNonNegative);
      expect(replayedTerminalLinked, lessThan(drainedEnvelope));
      expect(replayedSqlite, lessThan(drainedEnvelope));
      expect(drainedEnvelope, lessThan(reconnect));
      expect(reconnect, lessThan(finalize));
    });

    test('a replayed check carries the exact fields the reference harness sends', () async {
      await seedAttemptWithEvidence();

      final result = await syncRunner.syncActivationEvidence(
        const ActivationReconnectSyncParams(tenantId: tenantId, attemptId: attemptId),
      );

      expect(result.isSuccess, isTrue, reason: result.errors.join('\n'));

      final replayed = syncPort.sentChecks
          .where((c) => c['checkCode'] == 'TERMINAL_LINKED')
          .toList();
      expect(replayed, hasLength(1));
      expect(replayed.single, equals({
        'attemptId': attemptId,
        'checkCode': 'TERMINAL_LINKED',
        'status': 'PASS',
        'evidenceType': 'DEVICE_LINK_ACK',
        'evidenceRef': 'link-ref-001',
        'occurredAt': '2026-09-04T11:55:00.000Z',
        'details': {'bootSessionId': 'bs-001'},
        'tenantId': tenantId,
        'terminalId': terminalId, // attempt.candidateTerminalId, as the harness does
      }));

      // Absent detailsSanitizedJson must be sent as null, not an empty map.
      final replayedSqlite = syncPort.sentChecks
          .where((c) => c['checkCode'] == 'SQLITE_DURABILITY')
          .toList();
      expect(replayedSqlite, hasLength(1));
      expect(replayedSqlite.single['details'], isNull);
      expect(replayedSqlite.single['evidenceType'], isNull);
      expect(replayedSqlite.single['evidenceRef'], isNull);
      expect(replayedSqlite.single['occurredAt'], isNull);
    });

    test('a failing replay fails closed: no outbox drain, no finalize, resumable state', () async {
      await seedAttemptWithEvidence();
      syncPort.failCheckCodes.add('SQLITE_DURABILITY');

      final result = await syncRunner.syncActivationEvidence(
        const ActivationReconnectSyncParams(tenantId: tenantId, attemptId: attemptId),
      );

      expect(result.isSuccess, isFalse);
      expect(result.attemptStatus, equals('SYNC_VERIFICATION_PENDING'));
      expect(result.errors.join(' '), contains('SQLITE_DURABILITY'));

      // Never finalized and never drained.
      expect(syncPort.callLog, isNot(contains('finalizeActivation')));
      expect(syncPort.callLog, isNot(contains('sendCheck:OFFLINE_SALE_PAID')));
      expect(syncPort.callLog, isNot(contains('sendCheck:POST_RECONNECT_SYNC')));

      // Outbox envelope stays PENDING for a later retry.
      final pending = await database.activationOutboxDao.getPendingEnvelopes(tenantId);
      expect(pending, hasLength(1));

      // Attempt stays in a resumable status in SQLite.
      final attemptInDb = await database.activationAttemptLocalDao.getAttemptById(attemptId);
      expect(attemptInDb!.localStatus, equals('SYNC_VERIFICATION_PENDING'));

      // No POST_RECONNECT_SYNC evidence was persisted.
      final reconnectCheck = await database.activationCheckResultLocalDao.getCheck(
        tenantId,
        attemptId,
        'POST_RECONNECT_SYNC',
      );
      expect(reconnectCheck, isNull);
    });

    test('repeating the runner after a failed replay resumes cleanly without corrupting state', () async {
      await seedAttemptWithEvidence();
      syncPort.failCheckCodes.add('SQLITE_DURABILITY');

      final firstAttempt = await syncRunner.syncActivationEvidence(
        const ActivationReconnectSyncParams(tenantId: tenantId, attemptId: attemptId),
      );
      expect(firstAttempt.isSuccess, isFalse);

      // Retry once the port accepts the replay again.
      syncPort.failCheckCodes.clear();
      final secondAttempt = await syncRunner.syncActivationEvidence(
        const ActivationReconnectSyncParams(tenantId: tenantId, attemptId: attemptId),
      );

      expect(secondAttempt.isSuccess, isTrue, reason: secondAttempt.errors.join('\n'));
      expect(secondAttempt.attemptStatus, equals('ACTIVATED'));
      expect(secondAttempt.pendingEnvelopesCount, equals(0));

      // The persisted checks were replayed on BOTH runs (idempotent-safe).
      expect(
        syncPort.sentChecks.where((c) => c['checkCode'] == 'TERMINAL_LINKED'),
        hasLength(2),
      );

      // Local state is coherent: single POST_RECONNECT_SYNC row, attempt
      // ACTIVATED, no pending envelopes, persisted checks untouched.
      final attemptInDb = await database.activationAttemptLocalDao.getAttemptById(attemptId);
      expect(attemptInDb!.localStatus, equals('ACTIVATED'));
      final pending = await database.activationOutboxDao.getPendingEnvelopes(tenantId);
      expect(pending, isEmpty);
      final reconnectRows = (await database.activationCheckResultLocalDao.getChecksForAttempt(tenantId, attemptId))
          .where((c) => c.checkCode == 'POST_RECONNECT_SYNC')
          .toList();
      expect(reconnectRows, hasLength(1));
      final terminalLinked = await database.activationCheckResultLocalDao.getCheck(
        tenantId,
        attemptId,
        'TERMINAL_LINKED',
      );
      expect(terminalLinked!.status, equals('PASS'));
      expect(terminalLinked.evidenceRef, equals('link-ref-001'));
    });
  });
}
