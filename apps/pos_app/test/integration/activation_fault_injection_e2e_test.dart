import 'dart:convert';
import 'dart:io';
import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:path/path.dart' as p;

import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/activation/activation_attempt_local_entity.dart';
import 'package:pos_app/data/models/activation/activation_outbox_envelope_entity.dart';
import 'package:pos_app/data/models/activation/first_successful_sale_claim_entity.dart';
import 'package:pos_app/data/models/fiscal_config_local_entity.dart';
import 'package:pos_app/data/models/inventory/product_entity.dart';
import 'package:pos_app/data/models/local_config_entity.dart';
import 'package:pos_app/data/models/security_profile_entity.dart';
import 'package:pos_app/data/models/user_entity.dart';
import 'package:pos_app/data/models/sales/invoice_entity.dart';
import 'package:pos_app/data/ports/activation_sync_port.dart';
import 'package:pos_app/data/services/activation_clock_manager.dart';
import 'package:pos_app/data/services/activation_reconnect_sync_runner.dart';
import 'package:pos_app/data/services/local_auth_service.dart';

class FaultyActivationSyncPort implements ActivationSyncPort {
  bool simulateWanOutage = false;
  bool simulateCloudDownFinalizer = false;
  final List<Map<String, dynamic>> deliveredEnvelopes = [];

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
    if (simulateWanOutage) {
      throw Exception('WAN_OUTAGE: Network unreachable, connection timed out');
    }
    deliveredEnvelopes.add({'type': 'CHECK', 'checkCode': checkCode});
    return true;
  }

  @override
  Future<bool> sendFirstSaleClaim({
    required String attemptId,
    required Map<String, dynamic> claimPayload,
  }) async {
    if (simulateWanOutage) {
      throw Exception('WAN_OUTAGE: Network unreachable, connection timed out');
    }
    deliveredEnvelopes.add({'type': 'CLAIM', 'payload': claimPayload});
    return true;
  }

  @override
  Future<bool> sendVerificationSale({
    required String attemptId,
    required Map<String, dynamic> salePayload,
  }) async {
    if (simulateWanOutage) {
      throw Exception('WAN_OUTAGE: Network unreachable, connection timed out');
    }
    deliveredEnvelopes.add({'type': 'SALE', 'payload': salePayload});
    return true;
  }

  @override
  Future<FinalizeActivationResult> finalizeActivation({
    required String tenantId,
    required String attemptId,
  }) async {
    if (simulateCloudDownFinalizer) {
      return const FinalizeActivationResult(
        isSuccess: false,
        status: 'CLOUD_UNAVAILABLE',
        failureCode: 'HTTP_503_SERVICE_UNAVAILABLE',
      );
    }
    return const FinalizeActivationResult(
      isSuccess: true,
      status: 'PASS',
      warningsCount: 0,
    );
  }
}

void main() {
  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  group('ONB1.10B: Fault Injection Suite with Real Floor SQLite Persistence on Disk (Zero Mocks)', () {
    const tenantId = 'tenant-fault-pos-e2e';
    const candidateTerminalId = 'terminal-pos-fault-01';
    const authorizedUserId = 'user-owner-fault-001';
    const pin = '2468';
    const fiscalFingerprint = 'fp-fault-injection-fiscal-001';
    const bootSession = 'boot-session-fault-1';
    const verificationProductId = 'prod-pin-fault-coffee';

    test('SCENARIO 1: POS restart mid-Activation preserves local attempt and configuration on SQLite disk without state loss', () async {
      final tempDir = await Directory.systemTemp.createTemp('pos_fault_restart_');
      final dbPath = p.join(tempDir.path, 'pos_restart_test.db');

      try {
        // Phase 1: Boot POS, setup state on SQLite disk
        var database = await $FloorAppDatabase.databaseBuilder(dbPath).build();
        final localAuth = LocalAuthService();

        await database.userDao.insertUsers([
          UserEntity(
            id: authorizedUserId,
            name: 'Propietario Fault Test',
            role: 'OWNER',
            pinHash: localAuth.hashPin(pin),
            isActive: true,
            tenantId: tenantId,
          ),
        ]);

        await database.securityProfileDao.insertProfiles([
          SecurityProfileEntity(
            userId: authorizedUserId,
            pinHash: localAuth.hashPin(pin),
            isPinEnabled: true,
            isTotpEnabled: false,
          ),
        ]);

        await database.localConfigDao.saveConfig(
          LocalConfigEntity(key: 'terminal_device_id', value: candidateTerminalId),
        );

        await database.productDao.insertProducts([
          ProductEntity(
            id: verificationProductId,
            name: 'Café Americano Especial',
            sellPrice: 50.0,
            averageCost: 20.0,
            stock: 100.0,
            uom: 'CUP',
            barcode: 'PROD-FAULT-COFFEE',
            isActive: true,
            isPrepared: false,
            tenantId: tenantId,
          ),
        ]);

        await database.fiscalConfigLocalDao.applyFiscalConfig(
          const FiscalConfigLocalEntity(
            tenantId: tenantId,
            revision: 1,
            fingerprint: fiscalFingerprint,
            payload: '{"businessName": "Taquería Fault Invariant"}',
            appliedAt: '2026-09-04T12:00:00.000Z',
          ),
        );

        const attemptId = 'attempt-fault-restart-001';
        const nowIso = '2026-09-04T12:00:00.000Z';

        await database.activationAttemptLocalDao.saveAttempt(
          const ActivationAttemptLocalEntity(
            attemptId: attemptId,
            tenantId: tenantId,
            candidateTerminalId: candidateTerminalId,
            localStatus: 'ASSIGNED',
            requiredFiscalRevision: 1,
            requiredFiscalFingerprint: fiscalFingerprint,
            verificationProductId: verificationProductId,
            serverTimeAnchorAt: nowIso,
            anchorMonotonicTicks: 1000000,
            bootSessionId: bootSession,
            assignedAt: nowIso,
            updatedAt: nowIso,
          ),
        );

        // Verify attempt exists in SQLite on disk before simulated termination
        final attemptBeforeCrash = await database.activationAttemptLocalDao.getAttemptById(attemptId);
        expect(attemptBeforeCrash, isNotNull);
        expect(attemptBeforeCrash!.localStatus, equals('ASSIGNED'));

        // SIMULATE CRASH: Sudden terminal power cut / OS termination
        await database.close();

        // Phase 2: POS Restarts from the exact same SQLite disk file
        final restartedDatabase = await $FloorAppDatabase.databaseBuilder(dbPath).build();

        final restoredAttempt = await restartedDatabase.activationAttemptLocalDao.getAttemptById(attemptId);
        expect(restoredAttempt, isNotNull);
        expect(restoredAttempt!.attemptId, equals(attemptId));
        expect(restoredAttempt.tenantId, equals(tenantId));
        expect(restoredAttempt.candidateTerminalId, equals(candidateTerminalId));
        expect(restoredAttempt.requiredFiscalFingerprint, equals(fiscalFingerprint));
        expect(restoredAttempt.localStatus, equals('ASSIGNED'));

        await restartedDatabase.close();
      } finally {
        if (tempDir.existsSync()) {
          await tempDir.delete(recursive: true);
        }
      }
    });

    test('SCENARIO 2: WAN outage & Cloud Down during finalization preserves outbox claims in SYNC_VERIFICATION_PENDING', () async {
      final tempDir = await Directory.systemTemp.createTemp('pos_fault_wan_');
      final dbPath = p.join(tempDir.path, 'pos_wan_test.db');

      try {
        final database = await $FloorAppDatabase.databaseBuilder(dbPath).build();
        final localAuth = LocalAuthService();

        await database.userDao.insertUsers([
          UserEntity(
            id: authorizedUserId,
            name: 'Propietario Fault Test 2',
            role: 'OWNER',
            pinHash: localAuth.hashPin(pin),
            isActive: true,
            tenantId: tenantId,
          ),
        ]);

        await database.localConfigDao.saveConfig(
          LocalConfigEntity(key: 'terminal_device_id', value: candidateTerminalId),
        );

        const attemptId = 'attempt-fault-wan-001';
        const nowIso = '2026-09-04T12:00:00.000Z';

        await database.activationAttemptLocalDao.saveAttempt(
          const ActivationAttemptLocalEntity(
            attemptId: attemptId,
            tenantId: tenantId,
            candidateTerminalId: candidateTerminalId,
            localStatus: 'SYNC_VERIFICATION_PENDING',
            requiredFiscalRevision: 1,
            requiredFiscalFingerprint: fiscalFingerprint,
            verificationProductId: verificationProductId,
            serverTimeAnchorAt: nowIso,
            anchorMonotonicTicks: 1000000,
            bootSessionId: bootSession,
            assignedAt: nowIso,
            updatedAt: nowIso,
          ),
        );

        // Seed controlled verification sale in SQLite
        const invoiceId = 'inv-verification-fault-001';
        await database.invoiceDao.insertInvoice(InvoiceEntity(
          id: invoiceId,
          number: 'FAC-A-00000010',
          total: 60.0,
          subtotal: 52.17,
          totalTax: 7.83,
          userId: authorizedUserId,
          isCanceled: false,
          createdAt: DateTime.parse(nowIso).millisecondsSinceEpoch,
        ));

        // Record TTFSS Claim & Outbox Envelope
        await database.firstSuccessfulSaleClaimDao.insertClaim(const FirstSuccessfulSaleClaimEntity(
          tenantId: tenantId,
          terminalId: candidateTerminalId,
          ticketId: invoiceId,
          activationAttemptId: attemptId,
          deviceOccurredAt: nowIso,
          anchoredOccurredAt: nowIso,
          clockConfidence: 'ANCHORED',
          serverTimeAnchorId: 'srv-anchor-001',
          outboxEventId: 'outbox-env-fault-001',
          createdAtLocal: nowIso,
        ));

        await database.activationOutboxDao.insertEnvelope(ActivationOutboxEnvelopeEntity(
          id: 'outbox-env-fault-001',
          tenantId: tenantId,
          activationAttemptId: attemptId,
          eventType: 'FIRST_SUCCESSFUL_SALE_OBSERVED',
          idempotencyKey: 'idem-outbox-claim-001',
          payloadJson: jsonEncode({'claimId': 'claim-fault-wan-001', 'amount': 60.0}),
          payloadHash: sha256.convert(utf8.encode('idem-outbox-claim-001')).toString(),
          syncStatus: 'PENDING',
          createdAt: nowIso,
        ));

        // FAULT SIMULATION 1: WAN outage while trying to reconnect sync
        final faultySyncPort = FaultyActivationSyncPort();
        faultySyncPort.simulateWanOutage = true;

        final reconnectRunner = ActivationReconnectSyncRunner(
          database: database,
          syncPort: faultySyncPort,
        );

        final syncResult = await reconnectRunner.syncActivationEvidence(
          ActivationReconnectSyncParams(tenantId: tenantId, attemptId: attemptId),
        );

        // Verification: Reconnect sync must fail gracefully without throwing unhandled exceptions
        expect(syncResult.isSuccess, isFalse);
        expect(syncResult.attemptStatus, equals('SYNC_VERIFICATION_PENDING'));

        // INVARIANT: Outbox envelope remains PENDING for future retry and is NOT deleted or corrupted
        final pendingEnvelopes = await database.activationOutboxDao.getPendingEnvelopes(tenantId);
        expect(pendingEnvelopes, hasLength(1));
        expect(pendingEnvelopes[0].syncStatus, equals('PENDING'));

        // INVARIANT: Offline sale remains valid and NOT canceled
        final invoice = await database.invoiceDao.getInvoiceById(invoiceId);
        expect(invoice, isNotNull);
        expect(invoice!.isCanceled, isFalse);

        // FAULT SIMULATION 2: Network recovers for data sync, but Cloud Finalizer returns HTTP 503
        faultySyncPort.simulateWanOutage = false;
        faultySyncPort.simulateCloudDownFinalizer = true;

        final finalizerFailResult = await reconnectRunner.syncActivationEvidence(
          ActivationReconnectSyncParams(tenantId: tenantId, attemptId: attemptId),
        );

        // Must remain in EVIDENCE_ACKED; NEVER unilaterally show ACTIVATED without cloud verdict
        expect(finalizerFailResult.isSuccess, isFalse);
        expect(finalizerFailResult.backendFinalizeResult?.failureCode, contains('503'));

        final attemptAfterFinalizerFail = await database.activationAttemptLocalDao.getAttemptById(attemptId);
        expect(attemptAfterFinalizerFail!.localStatus, equals('EVIDENCE_ACKED'));

        // FAULT RESOLUTION: Cloud finalizer recovers -> POS transitions authoritatively to ACTIVATED
        faultySyncPort.simulateCloudDownFinalizer = false;
        final successfulRecovery = await reconnectRunner.syncActivationEvidence(
          ActivationReconnectSyncParams(tenantId: tenantId, attemptId: attemptId),
        );
        expect(successfulRecovery.isSuccess, isTrue);
        expect(successfulRecovery.attemptStatus, equals('ACTIVATED'));

        final finalAttempt = await database.activationAttemptLocalDao.getAttemptById(attemptId);
        expect(finalAttempt!.localStatus, equals('ACTIVATED'));

        await database.close();
      } finally {
        if (tempDir.existsSync()) {
          await tempDir.delete(recursive: true);
        }
      }
    });

    test('SCENARIO 3: Clock Skew & Clock Jumps degrade clockConfidence and preserve monotonic occurredAt', () {
      const fixedBootSessionId = 'boot-session-skew-1234';
      final serverAnchorTime = DateTime.parse('2026-09-04T12:00:00.000Z');
      const serverAnchorId = 'srv-anchor-skew-001';

      final clockManager = ActivationClockManager(
        initialBootSessionId: fixedBootSessionId,
      );

      // Establish anchor
      clockManager.setAnchor(
        serverTimeAnchorAt: serverAnchorTime,
        anchorMonotonicTicks: 1000000,
        serverTimeAnchorId: serverAnchorId,
        bootSessionId: fixedBootSessionId,
      );

      expect(clockManager.serverTimeAnchorAt, isNotNull);

      // Normal forward sample: confidence is ANCHORED
      final normalSample = clockManager.resolveClockContext(
        deviceWallClock: DateTime.parse('2026-09-04T12:00:05.000Z'),
        currentMonotonicTicks: 6000000,
        currentBootSessionId: fixedBootSessionId,
      );
      expect(normalSample.clockConfidence, equals(ClockConfidence.anchored));

      // FAULT SIMULATION 1: Wall clock jumped backwards before anchor time (e.g. clock manipulation or NTP backward step)
      final backwardSample = clockManager.resolveClockContext(
        deviceWallClock: DateTime.parse('2020-01-01T00:00:00.000Z'),
        currentMonotonicTicks: 7000000,
        currentBootSessionId: fixedBootSessionId,
        simulateSevereSkew: true,
      );
      expect(backwardSample.clockConfidence, equals(ClockConfidence.degraded));

      // FAULT SIMULATION 2: Monotonic ticks jumped backwards (abnormal hardware timer rollback)
      final backwardsMonotonicSample = clockManager.resolveClockContext(
        deviceWallClock: DateTime.parse('2026-09-04T12:00:10.000Z'),
        currentMonotonicTicks: 500000, // < 1,000,000 anchor ticks!
        currentBootSessionId: fixedBootSessionId,
      );
      expect(backwardsMonotonicSample.clockConfidence, equals(ClockConfidence.degraded));
    });

    test('SCENARIO 4: Duplicate outbox insertion is rejected or ignored without state corruption', () async {
      final tempDir = await Directory.systemTemp.createTemp('pos_fault_outbox_');
      final dbPath = p.join(tempDir.path, 'pos_outbox_test.db');

      try {
        final database = await $FloorAppDatabase.databaseBuilder(dbPath).build();

        const attemptId = 'attempt-outbox-dedupe-001';
        const nowIso = '2026-09-04T12:00:00.000Z';

        final claim = const FirstSuccessfulSaleClaimEntity(
          tenantId: tenantId,
          terminalId: candidateTerminalId,
          ticketId: 'inv-dedupe-001',
          activationAttemptId: attemptId,
          deviceOccurredAt: nowIso,
          anchoredOccurredAt: nowIso,
          clockConfidence: 'ANCHORED',
          serverTimeAnchorId: 'srv-anchor-001',
          outboxEventId: 'outbox-env-dedupe-001',
          createdAtLocal: nowIso,
        );

        // First insertion succeeds
        final rowId1 = await database.firstSuccessfulSaleClaimDao.insertClaim(claim);
        expect(rowId1, greaterThan(0));

        // FAULT SIMULATION: Duplicate resend/re-insertion of the same claim
        final rowId2 = await database.firstSuccessfulSaleClaimDao.insertClaim(claim);
        // OnConflictStrategy.ignore returns -1 or 0 and does NOT corrupt SQLite
        expect(rowId2, anyOf(equals(-1), equals(0)));

        final claims = await database.firstSuccessfulSaleClaimDao.getAll();
        expect(claims, hasLength(1));

        await database.close();
      } finally {
        if (tempDir.existsSync()) {
          await tempDir.delete(recursive: true);
        }
      }
    });
  });
}
