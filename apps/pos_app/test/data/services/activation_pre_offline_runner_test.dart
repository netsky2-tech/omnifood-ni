import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:path/path.dart' as p;

import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/activation/activation_attempt_local_entity.dart';
import 'package:pos_app/data/models/activation/activation_check_result_local_entity.dart';
import 'package:pos_app/data/models/activation/first_successful_sale_claim_entity.dart';
import 'package:pos_app/data/models/fiscal_config_local_entity.dart';
import 'package:pos_app/data/models/inventory/product_entity.dart';
import 'package:pos_app/data/models/local_config_entity.dart';
import 'package:pos_app/data/models/security_profile_entity.dart';
import 'package:pos_app/data/models/user_entity.dart';
import 'package:pos_app/data/adapters/printer/mock_printer_adapter.dart';
import 'package:pos_app/domain/ports/printer_port.dart';
import 'package:pos_app/data/services/activation_pre_offline_runner.dart';
import 'package:pos_app/data/services/activation_required_config_adapter.dart';
import 'package:pos_app/data/services/local_auth_service.dart';
import 'package:pos_app/data/services/terminal_identity_service.dart';

void main() {
  late AppDatabase database;
  late ActivationRequiredConfigAdapter configAdapter;
  late TerminalIdentityService terminalIdentity;
  late MockPrinterAdapter printerAdapter;
  late ActivationPreOfflineRunner runner;

  final localAuth = LocalAuthService();

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  setUp(() async {
    database = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();
    configAdapter = ActivationRequiredConfigAdapter(
      database: database,
      localAuthService: localAuth,
    );
    terminalIdentity = TerminalIdentityService(database.localConfigDao);
    printerAdapter = MockPrinterAdapter();
    runner = ActivationPreOfflineRunner(
      database: database,
      configAdapter: configAdapter,
      terminalIdentityService: terminalIdentity,
      printerPort: printerAdapter,
    );
  });

  tearDown(() async {
    await database.close();
  });

  group('ONB1.8A — SQLite Activation Projection (Floor Real Persistence)', () {
    const tenantId = 'tenant-founder-01';
    const attemptId = 'attempt-local-uuid-1';

    test('persists and rehydrates ActivationAttemptLocalEntity in Floor SQLite', () async {
      const attempt = ActivationAttemptLocalEntity(
        attemptId: attemptId,
        tenantId: tenantId,
        candidateTerminalId: 'pos-term-01',
        localStatus: 'ASSIGNED',
        requiredFiscalRevision: 1,
        requiredFiscalFingerprint: 'fiscal-fp-sha256-abc',
        verificationProductId: 'prod-uuid-1',
        assignedAt: '2026-09-04T12:00:00.000Z',
        updatedAt: '2026-09-04T12:00:00.000Z',
      );

      await database.activationAttemptLocalDao.saveAttempt(attempt);

      final rehydrated = await database.activationAttemptLocalDao.getAttemptById(attemptId);
      expect(rehydrated, isNotNull);
      expect(rehydrated!.attemptId, equals(attemptId));
      expect(rehydrated.tenantId, equals(tenantId));
      expect(rehydrated.candidateTerminalId, equals('pos-term-01'));
      expect(rehydrated.localStatus, equals('ASSIGNED'));
      expect(rehydrated.requiredFiscalRevision, equals(1));
      expect(rehydrated.requiredFiscalFingerprint, equals('fiscal-fp-sha256-abc'));
      expect(rehydrated.verificationProductId, equals('prod-uuid-1'));
    });

    test('persists ActivationCheckResultLocalEntity with uniqueness and idempotent upsert', () async {
      const check = ActivationCheckResultLocalEntity(
        id: 'chk-local-1',
        tenantId: tenantId,
        activationAttemptId: attemptId,
        checkCode: 'TERMINAL_LINKED',
        required: 1,
        status: 'PASS',
        evidenceType: 'DEVICE_IDENTITY_PROOF',
        evidenceRef: 'pos-term-01',
        recordedAt: '2026-09-04T12:01:00.000Z',
      );

      await database.activationCheckResultLocalDao.insertOrReplace(check);

      final fetched = await database.activationCheckResultLocalDao.getCheck(
        tenantId,
        attemptId,
        'TERMINAL_LINKED',
      );
      expect(fetched, isNotNull);
      expect(fetched!.status, equals('PASS'));
      expect(fetched.evidenceRef, equals('pos-term-01'));

      // Idempotent upsert with updated evidence
      const updatedCheck = ActivationCheckResultLocalEntity(
        id: 'chk-local-1',
        tenantId: tenantId,
        activationAttemptId: attemptId,
        checkCode: 'TERMINAL_LINKED',
        required: 1,
        status: 'PASS',
        evidenceType: 'DEVICE_IDENTITY_PROOF',
        evidenceRef: 'pos-term-01-updated',
        recordedAt: '2026-09-04T12:02:00.000Z',
      );
      await database.activationCheckResultLocalDao.insertOrReplace(updatedCheck);

      final reFetched = await database.activationCheckResultLocalDao.getCheck(
        tenantId,
        attemptId,
        'TERMINAL_LINKED',
      );
      expect(reFetched!.evidenceRef, equals('pos-term-01-updated'));
    });

    test('first_successful_sale_claim write-once semantics: subsequent attempt ignores duplicate insert', () async {
      const claim1 = FirstSuccessfulSaleClaimEntity(
        tenantId: tenantId,
        terminalId: 'pos-term-01',
        ticketId: 'ticket-paid-001',
        activationAttemptId: attemptId,
        deviceOccurredAt: '2026-09-04T12:05:00.000Z',
        clockConfidence: 'ANCHORED',
        outboxEventId: 'evt-claim-001',
        createdAtLocal: '2026-09-04T12:05:01.000Z',
      );

      final insertResult1 = await database.firstSuccessfulSaleClaimDao.insertClaim(claim1);
      expect(insertResult1, isNonNegative);

      final claimInDb = await database.firstSuccessfulSaleClaimDao.getClaimByTenantId(tenantId);
      expect(claimInDb, isNotNull);
      expect(claimInDb!.ticketId, equals('ticket-paid-001'));

      // Second sale occurs later: attempt to insert second claim for same tenant
      const claim2 = FirstSuccessfulSaleClaimEntity(
        tenantId: tenantId,
        terminalId: 'pos-term-01',
        ticketId: 'ticket-paid-002', // Later sale!
        activationAttemptId: attemptId,
        deviceOccurredAt: '2026-09-04T12:10:00.000Z',
        clockConfidence: 'ANCHORED',
        outboxEventId: 'evt-claim-002',
        createdAtLocal: '2026-09-04T12:10:01.000Z',
      );

      // On conflict ignore: returns -1 or 0 and original claim remains write-once
      await database.firstSuccessfulSaleClaimDao.insertClaim(claim2);

      final persistentClaim = await database.firstSuccessfulSaleClaimDao.getClaimByTenantId(tenantId);
      expect(persistentClaim!.ticketId, equals('ticket-paid-001')); // Original winner preserved!
    });

    test('multi-tenant isolation: Tenant A and Tenant B data do not cross boundaries', () async {
      const tenantA = 'tenant-alpha';
      const tenantB = 'tenant-beta';

      await database.activationAttemptLocalDao.saveAttempt(
        const ActivationAttemptLocalEntity(
          attemptId: 'att-a',
          tenantId: tenantA,
          candidateTerminalId: 'term-a',
          localStatus: 'ASSIGNED',
          requiredFiscalRevision: 1,
          requiredFiscalFingerprint: 'fp-a',
          verificationProductId: 'prod-a',
          assignedAt: '2026-09-04T12:00:00.000Z',
          updatedAt: '2026-09-04T12:00:00.000Z',
        ),
      );

      await database.activationAttemptLocalDao.saveAttempt(
        const ActivationAttemptLocalEntity(
          attemptId: 'att-b',
          tenantId: tenantB,
          candidateTerminalId: 'term-b',
          localStatus: 'ASSIGNED',
          requiredFiscalRevision: 2,
          requiredFiscalFingerprint: 'fp-b',
          verificationProductId: 'prod-b',
          assignedAt: '2026-09-04T12:00:00.000Z',
          updatedAt: '2026-09-04T12:00:00.000Z',
        ),
      );

      final attemptA = await database.activationAttemptLocalDao.getActiveAttempt(tenantA);
      final attemptB = await database.activationAttemptLocalDao.getActiveAttempt(tenantB);

      expect(attemptA!.attemptId, equals('att-a'));
      expect(attemptA.candidateTerminalId, equals('term-a'));
      expect(attemptB!.attemptId, equals('att-b'));
      expect(attemptB.candidateTerminalId, equals('term-b'));
    });
  });

  group('ONB1.8B — Pre-Offline Checks Runner', () {
    const tenantId = 'tenant-founder-checks';
    const attemptId = 'attempt-runner-1';
    const candidateTerminalId = 'pos-term-founder-01';
    const verificationProductId = 'prod-gallo-pinto-1';
    const authorizedUserId = 'user-owner-01';
    const validPin = '1234';

    late String fiscalFingerprint;
    late String productFingerprint;

    setUp(() async {
      // 1. Provision terminal identity
      await database.localConfigDao.saveConfig(
        LocalConfigEntity(
          key: TerminalIdentityService.localDeviceIdKey,
          value: candidateTerminalId,
          description: 'Stable terminal identity',
        ),
      );

      // 2. Provision fiscal config in SQLite
      fiscalFingerprint = 'fiscal-fingerprint-sha256-verified-ok';
      final fiscalPayload = jsonEncode({
        'tenantId': tenantId,
        'businessName': 'Comedor El Fundador',
        'fiscalRegime': 'GENERAL',
        'taxRate': 0.15,
        'configVersion': {
          'revision': 1,
          'fingerprint': fiscalFingerprint,
        },
      });
      await database.fiscalConfigLocalDao.applyFiscalConfig(
        FiscalConfigLocalEntity(
          tenantId: tenantId,
          revision: 1,
          fingerprint: fiscalFingerprint,
          payload: fiscalPayload,
          appliedAt: '2026-09-04T12:00:00.000Z',
        ),
      );

      // 3. Provision product in SQLite
      final product = ProductEntity(
        id: verificationProductId,
        name: 'Gallo Pinto Tradicional',
        uom: 'PLATO',
        sellPrice: 75.0,
        stock: 10.0,
        averageCost: 40.0,
        isActive: true,
        tenantId: tenantId,
      );
      await database.productDao.insertProducts([product]);
      productFingerprint = ActivationRequiredConfigAdapter.computeProductFingerprint(product);

      // 4. Provision authorized user with offline PIN in SQLite
      await database.userDao.insertUsers([
        UserEntity(
          id: authorizedUserId,
          name: 'Dona Gloria',
          email: 'gloria@fundador.ni',
          role: 'owner',
          pinHash: localAuth.hashPin(validPin),
          isActive: true,
          tenantId: tenantId,
        ),
      ]);
      await database.securityProfileDao.insertProfiles([
        SecurityProfileEntity(
          userId: authorizedUserId,
          pinHash: localAuth.hashPin(validPin),
          isPinEnabled: true,
          isTotpEnabled: false,
        ),
      ]);

      // 5. Seed ActivationAttemptLocal in SQLite
      await database.activationAttemptLocalDao.saveAttempt(
        ActivationAttemptLocalEntity(
          attemptId: attemptId,
          tenantId: tenantId,
          candidateTerminalId: candidateTerminalId,
          localStatus: 'ASSIGNED',
          requiredFiscalRevision: 1,
          requiredFiscalFingerprint: fiscalFingerprint,
          verificationProductId: verificationProductId,
          assignedAt: '2026-09-04T12:00:00.000Z',
          updatedAt: '2026-09-04T12:00:00.000Z',
        ),
      );

      printerAdapter.reset();
      printerAdapter.currentStatus = PrinterStatus.ready;
    });

    test('passes all 6 pre-offline checks and transitions attempt to RUNNING', () async {
      final summary = await runner.runPreOfflineChecks(
        const PreOfflineRunnerParams(
          attemptId: attemptId,
          tenantId: tenantId,
          authorizedUserId: authorizedUserId,
          authorizedUserPin: validPin,
        ),
      );

      expect(summary.isReadyForOffline, isTrue);
      expect(summary.blockers, isEmpty);
      expect(summary.checks.length, equals(6));

      expect(summary.checks['TERMINAL_LINKED']!.status, equals('PASS'));
      expect(summary.checks['REQUIRED_CONFIG_LOCAL']!.status, equals('PASS'));
      expect(summary.checks['AUTHORIZED_USER_LOCAL']!.status, equals('PASS'));
      expect(summary.checks['PRINTER_AVAILABLE']!.status, equals('PASS'));
      expect(summary.checks['TEST_PRINT']!.status, equals('PASS'));
      expect(summary.checks['SQLITE_DURABILITY']!.status, equals('PASS'));

      // Verify Floor SQLite persistence: all 6 checks saved
      final persistedChecks = await database.activationCheckResultLocalDao.getChecksForAttempt(
        tenantId,
        attemptId,
      );
      expect(persistedChecks.length, equals(6));

      // Attempt transitioned to RUNNING
      final attemptInDb = await database.activationAttemptLocalDao.getAttemptById(attemptId);
      expect(attemptInDb!.localStatus, equals('RUNNING'));
    });

    test('fails TERMINAL_LINKED check when candidate terminal does not match authenticated device identity', () async {
      // Simulate different device identity
      await database.localConfigDao.saveConfig(
        LocalConfigEntity(
          key: TerminalIdentityService.localDeviceIdKey,
          value: 'different-rogue-pos-term',
          description: 'Rogue terminal',
        ),
      );

      final summary = await runner.runPreOfflineChecks(
        const PreOfflineRunnerParams(
          attemptId: attemptId,
          tenantId: tenantId,
          authorizedUserId: authorizedUserId,
          authorizedUserPin: validPin,
        ),
      );

      expect(summary.isReadyForOffline, isFalse);
      expect(summary.checks['TERMINAL_LINKED']!.status, equals('FAIL'));
      expect(summary.blockers.any((b) => b.contains('TERMINAL_LINKED_FAILED')), isTrue);

      final attemptInDb = await database.activationAttemptLocalDao.getAttemptById(attemptId);
      expect(attemptInDb!.localStatus, equals('ASSIGNED')); // Did not advance to RUNNING
    });

    test('fails REQUIRED_CONFIG_LOCAL check when fiscal fingerprint mismatches', () async {
      // Corrupt fiscal fingerprint in attempt
      final attempt = await database.activationAttemptLocalDao.getAttemptById(attemptId);
      await database.activationAttemptLocalDao.updateAttempt(
        attempt!.copyWith(requiredFiscalFingerprint: 'corrupt-sha256-fingerprint'),
      );

      final summary = await runner.runPreOfflineChecks(
        const PreOfflineRunnerParams(
          attemptId: attemptId,
          tenantId: tenantId,
          authorizedUserId: authorizedUserId,
          authorizedUserPin: validPin,
        ),
      );

      expect(summary.isReadyForOffline, isFalse);
      expect(summary.checks['REQUIRED_CONFIG_LOCAL']!.status, equals('FAIL'));
      expect(summary.blockers.any((b) => b.contains('REQUIRED_CONFIG_LOCAL_FAILED')), isTrue);
    });

    test('fails AUTHORIZED_USER_LOCAL check when offline PIN is invalid', () async {
      final summary = await runner.runPreOfflineChecks(
        const PreOfflineRunnerParams(
          attemptId: attemptId,
          tenantId: tenantId,
          authorizedUserId: authorizedUserId,
          authorizedUserPin: 'wrong-pin-0000',
        ),
      );

      expect(summary.isReadyForOffline, isFalse);
      expect(summary.checks['AUTHORIZED_USER_LOCAL']!.status, equals('FAIL'));
      expect(summary.blockers.any((b) => b.contains('AUTHORIZED_USER_LOCAL_FAILED')), isTrue);
    });

    test('fails PRINTER_AVAILABLE and TEST_PRINT when hardware printer is offline or out of paper', () async {
      printerAdapter.currentStatus = PrinterStatus.outOfPaper;

      final summary = await runner.runPreOfflineChecks(
        const PreOfflineRunnerParams(
          attemptId: attemptId,
          tenantId: tenantId,
          authorizedUserId: authorizedUserId,
          authorizedUserPin: validPin,
        ),
      );

      expect(summary.isReadyForOffline, isFalse);
      expect(summary.checks['PRINTER_AVAILABLE']!.status, equals('FAIL'));
      expect(summary.checks['TEST_PRINT']!.status, equals('FAIL'));
      expect(summary.blockers.any((b) => b.contains('PRINTER_AVAILABLE_FAILED')), isTrue);
    });
  });

  group('ONB1.8A–B — Offline Restart Durability (Disk Persistence Roundtrip)', () {
    test('persisted attempt and check results survive SQLite close and reopen', () async {
      final tempDir = await Directory.systemTemp.createTemp('pos_restart_durability_');
      final dbPath = p.join(tempDir.path, 'pos_restart_test.db');

      try {
        // 1. Open disk database, seed attempt and run checks
        final diskDb1 = await $FloorAppDatabase.databaseBuilder(dbPath).build();

        const tenantId = 'tenant-restart-durability';
        const attemptId = 'attempt-durability-001';

        await diskDb1.activationAttemptLocalDao.saveAttempt(
          const ActivationAttemptLocalEntity(
            attemptId: attemptId,
            tenantId: tenantId,
            candidateTerminalId: 'term-disk-01',
            localStatus: 'RUNNING',
            requiredFiscalRevision: 1,
            requiredFiscalFingerprint: 'disk-fp-sha256',
            verificationProductId: 'prod-disk-1',
            assignedAt: '2026-09-04T12:00:00.000Z',
            updatedAt: '2026-09-04T12:05:00.000Z',
          ),
        );

        await diskDb1.activationCheckResultLocalDao.insertChecks([
          const ActivationCheckResultLocalEntity(
            id: 'chk-disk-1',
            tenantId: tenantId,
            activationAttemptId: attemptId,
            checkCode: 'TERMINAL_LINKED',
            required: 1,
            status: 'PASS',
            evidenceRef: 'term-disk-01',
            recordedAt: '2026-09-04T12:01:00.000Z',
          ),
          const ActivationCheckResultLocalEntity(
            id: 'chk-disk-2',
            tenantId: tenantId,
            activationAttemptId: attemptId,
            checkCode: 'SQLITE_DURABILITY',
            required: 1,
            status: 'PASS',
            evidenceRef: 'DISK_COMMITTED',
            recordedAt: '2026-09-04T12:02:00.000Z',
          ),
        ]);

        await diskDb1.firstSuccessfulSaleClaimDao.insertClaim(
          const FirstSuccessfulSaleClaimEntity(
            tenantId: tenantId,
            terminalId: 'term-disk-01',
            ticketId: 'ticket-disk-paid',
            activationAttemptId: attemptId,
            deviceOccurredAt: '2026-09-04T12:03:00.000Z',
            clockConfidence: 'ANCHORED',
            outboxEventId: 'evt-disk-001',
            createdAtLocal: '2026-09-04T12:03:01.000Z',
          ),
        );

        // Simulate crash / restart: close connection
        await diskDb1.close();

        // 2. Re-open database from disk file (simulate POS restart)
        final diskDb2 = await $FloorAppDatabase.databaseBuilder(dbPath).build();

        final rehydratedAttempt = await diskDb2.activationAttemptLocalDao.getAttemptById(attemptId);
        expect(rehydratedAttempt, isNotNull);
        expect(rehydratedAttempt!.localStatus, equals('RUNNING'));
        expect(rehydratedAttempt.requiredFiscalFingerprint, equals('disk-fp-sha256'));

        final rehydratedChecks = await diskDb2.activationCheckResultLocalDao.getChecksForAttempt(
          tenantId,
          attemptId,
        );
        expect(rehydratedChecks.length, equals(2));
        expect(rehydratedChecks.any((c) => c.checkCode == 'TERMINAL_LINKED' && c.status == 'PASS'), isTrue);
        expect(rehydratedChecks.any((c) => c.checkCode == 'SQLITE_DURABILITY' && c.status == 'PASS'), isTrue);

        final rehydratedClaim = await diskDb2.firstSuccessfulSaleClaimDao.getClaimByTenantId(tenantId);
        expect(rehydratedClaim, isNotNull);
        expect(rehydratedClaim!.ticketId, equals('ticket-disk-paid'));

        await diskDb2.close();
      } finally {
        if (await tempDir.exists()) {
          await tempDir.delete(recursive: true);
        }
      }
    });
  });
}
