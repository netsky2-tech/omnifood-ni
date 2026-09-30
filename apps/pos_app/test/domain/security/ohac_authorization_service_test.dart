import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/daos/human_authorization/ohac_delivery_dao.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/database/migrations.dart';
import 'package:pos_app/data/models/human_authorization/assertion_v1.dart';
import 'package:pos_app/data/models/human_authorization/canonical.dart';
import 'package:pos_app/data/models/human_authorization/error_codes.dart';
import 'package:pos_app/data/models/human_authorization/ohac_delivery_entities.dart';
import 'package:pos_app/domain/security/ohac_assertion_emitter.dart';
import 'package:pos_app/domain/security/ohac_attempt_policy.dart';
import 'package:pos_app/domain/security/ohac_authorization_port.dart';
import 'package:pos_app/domain/security/ohac_authorization_service.dart';
import 'package:pos_app/domain/security/ohac_outbox_registry.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

/// The decision-31 test registrant reused as the R1-008 registered outbox.
class TestOutbox implements OhacAssertionBearingOutbox {
  @override
  final String outboxId;

  TestOutbox(this.outboxId);

  @override
  Future<int?> lowestUnconsumedAssertionSequence() async => null;
}

/// Application-service coverage for operation-bound local PIN authorization
/// (Slice C, design §6, §7.1, spec `Fresh Local PIN Authorization`):
/// cohort/build gate, R1-008 registry gate, entry eligibility, durable
/// lockout, assertion creation, and the never-leak PIN guarantees.
void main() {
  final now = DateTime.utc(2026, 1, 4, 12, 0, 0);

  const tenantId = '0f0e8a20-1111-4222-8333-444455556666';
  const terminalId = 'terminal-1';
  const userId = 'aa000000-1111-4222-8333-444455556666';
  const operatorUserId = 'bb000000-1111-4222-8333-444455556666';
  const deviceCredentialId = 'cc000000-1111-4222-8333-444455556666';
  final epochDigest = 'sha256:${'d' * 64}';
  const pin = '1234';

  late AppDatabase database;
  late OhacOutboxRegistry registry;
  late int pinComparerCalls;
  late bool pinMatches;
  late String? posBuild;
  late DateTime currentTime;

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  setUp(() async {
    database = await $FloorAppDatabase
        .inMemoryDatabaseBuilder()
        .addMigrations(allMigrations)
        .addCallback(inventoryMovementAppendOnlyCallback)
        .build();
    addTearDown(database.close);
    registry = OhacOutboxRegistry()..register(TestOutbox('outbox-1'));
    pinComparerCalls = 0;
    pinMatches = true;
    posBuild = '1.0.0+1';
    currentTime = now;

    await database.ohacDeliveryDao.insertEpoch(
      OhacPolicyEpochEntity(
        tenantId: tenantId,
        terminalId: terminalId,
        sequence: 1,
        digest: epochDigest,
        previousSequence: 0,
        previousDigest: 'GENESIS',
        schema: 'ohac.staff-policy-epoch.v1',
        targetPosBuild: '1.0.0+1',
        publisherBackendBuild: 'backend-1',
        minimumAssertionSchema: 'ohac.assertion.v1',
        payload: '{"sequence":1}',
        receivedAt: '2026-01-01T00:00:00.000Z',
      ),
    );
    await database.ohacDeliveryDao.insertEntries([
      OhacPolicyEntryEntity(
        tenantId: tenantId,
        terminalId: terminalId,
        sequence: 1,
        userId: userId,
        status: 'ACTIVE',
        role: 'MANAGER',
        permissions: '["sales.sell","sales.void_invoice"]',
        verifierAlgorithm: 'bcrypt',
        verifierFormatVersion: '2b',
        verifierEncoded: r'$2b$10$abcdefghijklmnopqrstuv',
        attemptResetGeneration: '1',
      ),
    ]);
    await database.ohacDeliveryDao.insertTerminalState(
      OhacTerminalStateEntity(
        tenantId: tenantId,
        terminalId: terminalId,
        state: 'ACTIVE',
        activeSequence: 1,
        activeDigest: epochDigest,
        candidateSequence: 0,
        candidateDigest: '',
        serverFloorSequence: 1,
        serverFloorDigest: epochDigest,
        negotiatedPosBuild: '',
        negotiatedBackendBuild: '',
        negotiatedPolicySchema: '',
        negotiatedAssertionSchema: '',
        integrityClassification: '',
        localAuthorizationSequence: 0,
        revision: 1,
        updatedAt: '2026-01-01T00:00:00.000Z',
      ),
    );
  });

  OhacAuthorizationService service() => OhacAuthorizationService(
        ohacDeliveryDao: database.ohacDeliveryDao,
        ohacOutboxRegistry: registry,
        readPosBuild: () async => posBuild,
        clock: () => currentTime,
        newId: () => 'ee000000-1111-4222-8333-444455556666',
        pinComparer: (candidatePin, verifierEncoded) {
          pinComparerCalls++;
          return pinMatches;
        },
      );

  OhacAuthorizationRequest request({
    String outboxId = 'outbox-1',
    List<String>? permissionsUsed,
    String? userIdField,
    String? operationDigest,
    String deviceCredentialVersion = '3',
  }) =>
      OhacAuthorizationRequest(
        tenantId: tenantId,
        terminalId: terminalId,
        userId: userIdField ?? userId,
        operatorUserId: operatorUserId,
        pin: pin,
        outboxId: outboxId,
        deviceCredentialId: deviceCredentialId,
        deviceCredentialVersion: deviceCredentialVersion,
        permissionsUsed: permissionsUsed ?? const ['sales.void_invoice'],
        operationType: 'consumer.registered-operation.v1',
        operationSchema: 'consumer.operation.v1',
        operationDigest: operationDigest ?? 'sha256:${'f' * 64}',
      );

  Future<OhacTerminalStateEntity> terminalState() async =>
      (await database.ohacDeliveryDao.findTerminalState(
        tenantId,
        terminalId,
      ))!;

  group('cohort/build gate', () {
    test('a pos build that differs from the epoch target denies closed',
        () async {
      posBuild = '9.9.9+9';

      final result = await service().authorizeOperation(request());

      expect(result, isA<OhacAssertionDenied>());
      expect(
        (result as OhacAssertionDenied).reason,
        OhacAuthorizationDenialReason.buildMismatch,
      );
      expect((await terminalState()).localAuthorizationSequence, 0);
      expect(
        await database.ohacDeliveryDao.findAttemptState(
          tenantId,
          terminalId,
          userId,
        ),
        isNull,
        reason: 'the gate denies before any attempt state is touched',
      );
    });

    test('an unreadable pos build (legacy client) denies closed', () async {
      posBuild = null;

      final result = await service().authorizeOperation(request());

      expect(result, isA<OhacAssertionDenied>());
      expect(
        (result as OhacAssertionDenied).reason,
        OhacAuthorizationDenialReason.buildMismatch,
      );
    });

    test('no acknowledged ACTIVE epoch denies closed', () async {
      // A fresh terminal has no epoch row and active sequence 0.
      await database.ohacDeliveryDao.insertTerminalState(
        OhacTerminalStateEntity(
          tenantId: tenantId,
          terminalId: 'terminal-2',
          state: 'ACTIVE',
          activeSequence: 0,
          activeDigest: '',
          candidateSequence: 0,
          candidateDigest: '',
          serverFloorSequence: 0,
          serverFloorDigest: 'GENESIS',
          negotiatedPosBuild: '',
          negotiatedBackendBuild: '',
          negotiatedPolicySchema: '',
          negotiatedAssertionSchema: '',
          integrityClassification: '',
          localAuthorizationSequence: 0,
          revision: 0,
          updatedAt: '2026-01-01T00:00:00.000Z',
        ),
      );

      final result = await service().authorizeOperation(
        OhacAuthorizationRequest(
          tenantId: tenantId,
          terminalId: 'terminal-2',
                  userId: userId,
                  operatorUserId: operatorUserId,
                  pin: pin,
                  outboxId: 'outbox-1',
                  deviceCredentialId: deviceCredentialId,
                  deviceCredentialVersion: '3',
                  permissionsUsed: const ['sales.void_invoice'],
                  operationType: 'consumer.registered-operation.v1',
                  operationSchema: 'consumer.operation.v1',
          operationDigest: 'sha256:${'f' * 64}',
        ),
      );

      expect(result, isA<OhacAssertionDenied>());
      expect(
        (result as OhacAssertionDenied).reason,
        OhacAuthorizationDenialReason.noActiveEpoch,
      );
    });

    test('a frozen terminal (RECEIVE_PENDING with no epoch) denies closed',
        () async {
      final result = await service().authorizeOperation(
        OhacAuthorizationRequest(
          tenantId: tenantId,
          terminalId: 'terminal-unknown',
          userId: userId,
          operatorUserId: operatorUserId,
          pin: pin,
          outboxId: 'outbox-1',
          deviceCredentialId: deviceCredentialId,
          deviceCredentialVersion: '3',
          permissionsUsed: const ['sales.void_invoice'],
          operationType: 'consumer.registered-operation.v1',
          operationSchema: 'consumer.operation.v1',
          operationDigest: 'sha256:${'f' * 64}',
        ),
      );

      expect(result, isA<OhacAssertionDenied>());
      expect(
        (result as OhacAssertionDenied).reason,
        OhacAuthorizationDenialReason.noActiveEpoch,
      );
    });
  });

  group('R1-008 registry gate', () {
    test('an unregistered outbox denies closed without any assertion',
        () async {
      final result = await service()
          .authorizeOperation(request(outboxId: 'shadow-outbox'));

      expect(result, isA<OhacAssertionDenied>());
      expect(
        (result as OhacAssertionDenied).reason,
        OhacAuthorizationDenialReason.unregisteredOutbox,
      );
      expect((await terminalState()).localAuthorizationSequence, 0);
    });
  });

  group('entry eligibility', () {
    test('an unknown user denies', () async {
      final result = await service().authorizeOperation(
        // A well-formed id that no epoch entry carries.
        request(userIdField: 'ff999999-1111-4222-8333-444455556666'),
      );

      expect(result, isA<OhacAssertionDenied>());
      expect(
        (result as OhacAssertionDenied).reason,
        OhacAuthorizationDenialReason.userNotEligible,
      );
    });

    test('an INACTIVE entry denies even with the correct PIN', () async {
      // Entries are append-only, so a second epoch carries the INACTIVE
      // projection and the terminal advances to govern it.
      await database.ohacDeliveryDao.insertEpoch(
        OhacPolicyEpochEntity(
          tenantId: tenantId,
          terminalId: terminalId,
          sequence: 2,
          digest: 'sha256:${'2' * 64}',
          previousSequence: 1,
          previousDigest: epochDigest,
          schema: 'ohac.staff-policy-epoch.v1',
          targetPosBuild: '1.0.0+1',
          publisherBackendBuild: 'backend-1',
          minimumAssertionSchema: 'ohac.assertion.v1',
          payload: '{"sequence":2}',
          receivedAt: '2026-01-02T00:00:00.000Z',
        ),
      );
      await database.ohacDeliveryDao.insertEntries([
        OhacPolicyEntryEntity(
          tenantId: tenantId,
          terminalId: terminalId,
          sequence: 2,
          userId: userId,
          status: 'INACTIVE',
          role: 'MANAGER',
          permissions: '["sales.sell","sales.void_invoice"]',
          verifierAlgorithm: 'bcrypt',
          verifierFormatVersion: '2b',
          verifierEncoded: r'$2b$10$abcdefghijklmnopqrstuv',
          attemptResetGeneration: '2',
        ),
      ]);
      await database.database.execute(
        'UPDATE human_auth_terminal_state SET active_sequence = 2, '
        "active_digest = 'sha256:${'2' * 64}' "
        'WHERE tenant_id = ? AND terminal_id = ?',
        [tenantId, terminalId],
      );

      final result = await service().authorizeOperation(request());

      expect(result, isA<OhacAssertionDenied>());
      expect(
        (result as OhacAssertionDenied).reason,
        OhacAuthorizationDenialReason.userNotEligible,
      );
      expect(pinComparerCalls, 0,
          reason: 'an ineligible user is refused before any PIN comparison');
    });

    test('a permission outside the entry denies', () async {
      final denied = await service()
          .authorizeOperation(request(permissionsUsed: ['inventory.adjust']));

      expect(denied, isA<OhacAssertionDenied>());
      expect(
        (denied as OhacAssertionDenied).reason,
        OhacAuthorizationDenialReason.permissionDenied,
      );
    });

    test('an invalid request denies before anything is read', () async {
      final result = await service().authorizeOperation(
        request(permissionsUsed: ['sales.zzz', 'sales.aaa']),
      );

      expect(result, isA<OhacAssertionDenied>());
      expect(
        (result as OhacAssertionDenied).reason,
        OhacAuthorizationDenialReason.invalidRequest,
      );
      expect((await terminalState()).localAuthorizationSequence, 0);
    });

    test('a corrupt entry payload (non-string permission element) fails '
        'closed with StateError, not a raw TypeError', () async {
      // The stated intent (see the catch below the decode) is that a corrupt
      // persisted permissions payload is a fail-closed StateError. A payload
      // that parses as JSON but holds non-string elements must hit the SAME
      // intent, not escape as an unhandled TypeError from .cast<String>().
      await database.ohacDeliveryDao.insertEntries([
        OhacPolicyEntryEntity(
          tenantId: tenantId,
          terminalId: terminalId,
          sequence: 1,
          userId: 'cc000000-1111-4222-8333-444455556666',
          status: 'ACTIVE',
          role: 'MANAGER',
          permissions: '[1,2]',
          verifierAlgorithm: 'bcrypt',
          verifierFormatVersion: '2b',
          verifierEncoded: r'$2b$10$abcdefghijklmnopqrstuv',
          attemptResetGeneration: '1',
        ),
      ]);

      await expectLater(
        service().authorizeOperation(
          request(
            userIdField: 'cc000000-1111-4222-8333-444455556666',
            permissionsUsed: ['sales.void_invoice'],
          ),
        ),
        throwsA(
          isA<StateError>().having(
            (error) => error.message,
            'message',
            contains('corrupt permissions payload'),
          ),
        ),
      );
    });
  });

  group('durable attempt state', () {
    test('a wrong PIN denies and durably records the failure', () async {
      pinMatches = false;

      final result = await service().authorizeOperation(request());

      expect(result, isA<OhacAssertionDenied>());
      expect(
        (result as OhacAssertionDenied).reason,
        OhacAuthorizationDenialReason.pinMismatch,
      );
      final attempt = await database.ohacDeliveryDao.findAttemptState(
        tenantId,
        terminalId,
        userId,
      );
      expect(attempt, isNotNull);
      expect(
        OhacAttemptPolicy.decodeFailureTimestamps(attempt!.failureTimestamps),
        [now],
      );
      expect(attempt.lockedUntil, isNull);
    });

    test('three failures inside the window lock the pair for five minutes',
        () async {
      pinMatches = false;
      final svc = service();

      await svc.authorizeOperation(request());
      await svc.authorizeOperation(request());
      await svc.authorizeOperation(request());

      final attempt = await database.ohacDeliveryDao.findAttemptState(
        tenantId,
        terminalId,
        userId,
      );
      expect(
        attempt!.lockedUntil,
        now.add(const Duration(minutes: 5)).toIso8601String(),
      );
    });

    test('a locked pair denies without any PIN comparison', () async {
      pinMatches = false;
      final svc = service();
      await svc.authorizeOperation(request());
      await svc.authorizeOperation(request());
      await svc.authorizeOperation(request());
      pinComparerCalls = 0;

      final result = await svc.authorizeOperation(request());

      expect(result, isA<OhacAssertionDenied>());
      expect(
        (result as OhacAssertionDenied).reason,
        OhacAuthorizationDenialReason.attemptLocked,
      );
      expect(pinComparerCalls, 0,
          reason: 'a locked pair is denied without a bcrypt check');
    });

    test('a successful attempt after the lockout expired resets the state '
        'and appends PIN_ATTEMPT_RESET_SUCCESS', () async {
      pinMatches = false;
      final svc = service();
      await svc.authorizeOperation(request());
      await svc.authorizeOperation(request());
      await svc.authorizeOperation(request());
      pinMatches = true;

      // The clock moves past the lockout; the first admissible attempt is a
      // fresh successful PIN check.
      currentTime = now.add(const Duration(minutes: 5));
      final result = await svc.authorizeOperation(request());

      expect(result, isA<OhacAssertionAuthorized>());
      final attempt = await database.ohacDeliveryDao.findAttemptState(
        tenantId,
        terminalId,
        userId,
      );
      expect(attempt!.failureTimestamps, '[]');
      expect(attempt.lockedUntil, isNull);
    });
  });

  group('successful authorization', () {
    test('a successful authorization touches ONLY the terminal-local '
        'authorization sequence and updated_at on the terminal row '
        '(design §6: authorization must not interfere with the epoch '
        'state machine)', () async {
      // Seed non-null drain-gate deferral state so the identity assertion
      // on ack_deferral_* is discriminating, not vacuously null == null.
      await database.database.rawUpdate(
          'UPDATE human_auth_terminal_state '
          "SET ack_deferral_reason = 'OHAC_ACK_DEFERRED_OUTBOX', "
          'ack_deferral_count = 3');
      final before = await terminalState();

      final result = await service().authorizeOperation(request());

      expect(result, isA<OhacAssertionAuthorized>());
      final after = await terminalState();
      // Byte-identical identity, phase, epoch pairs, floor, negotiated
      // facts, fault class, receipt and drain-gate deferral state: none of
      // them is authorization's to move.
      expect(after.tenantId, before.tenantId);
      expect(after.terminalId, before.terminalId);
      expect(after.state, before.state);
      expect(after.revision, before.revision);
      expect(after.activeSequence, before.activeSequence);
      expect(after.activeDigest, before.activeDigest);
      expect(after.candidateSequence, before.candidateSequence);
      expect(after.candidateDigest, before.candidateDigest);
      expect(after.serverFloorSequence, before.serverFloorSequence);
      expect(after.serverFloorDigest, before.serverFloorDigest);
      expect(after.negotiatedPosBuild, before.negotiatedPosBuild);
      expect(after.negotiatedBackendBuild, before.negotiatedBackendBuild);
      expect(after.negotiatedPolicySchema, before.negotiatedPolicySchema);
      expect(after.negotiatedAssertionSchema,
          before.negotiatedAssertionSchema);
      expect(after.integrityClassification,
          before.integrityClassification);
      expect(after.ackReceiptId, before.ackReceiptId);
      expect(after.ackDeferralReason, before.ackDeferralReason);
      expect(after.ackDeferralCount, before.ackDeferralCount);
      // The ONLY two intended changes: the stamped counter and the instant.
      expect(after.localAuthorizationSequence,
          before.localAuthorizationSequence + 1);
      expect(after.updatedAt, isNot(before.updatedAt));
      expect(after.updatedAt, now.toUtc().toIso8601String());
    });
    test('returns a parseable assertion bound to the operation and epoch',
        () async {
      final result = await service().authorizeOperation(request());

      expect(result, isA<OhacAssertionAuthorized>());
      final assertion = (result as OhacAssertionAuthorized).assertion;
      expect(assertion.epochSequence, '1');
      expect(assertion.epochDigest, epochDigest);
      expect(assertion.authorizerUserId, userId);
      expect(assertion.operatorUserId, operatorUserId);
      expect(assertion.authorizerRole, 'MANAGER');
      expect(assertion.permissionsUsed, ['sales.void_invoice']);
      expect(assertion.localAuthorizationSequence, '1');
      expect(assertion.posBuild, '1.0.0+1');
      expect(assertion.trustLevel, 'APPLICATION_SANDBOX_SOFTWARE');
      expect(assertion.authorizedAt, '2026-01-04T12:00:00Z');
      expect(assertion.digest, startsWith('sha256:'));
    });

    test('increments the terminal-local sequence atomically with the attempt '
        'reset and the audit linkage', () async {
      final result = await service().authorizeOperation(request());

      final assertion = (result as OhacAssertionAuthorized).assertion;
      expect((await terminalState()).localAuthorizationSequence, 1);

      final attempt = await database.ohacDeliveryDao.findAttemptState(
        tenantId,
        terminalId,
        userId,
      );
      expect(attempt!.failureTimestamps, '[]');
      expect(attempt.lockedUntil, isNull);
      expect(attempt.localAuthorizationSequence, 1);

      final events = await database.ohacDeliveryDao.findEventsForTerminal(
        tenantId,
        terminalId,
      );
      final resetEvents = events
          .where((e) => e.eventType == OhacLocalEventType.pinAttemptResetSuccess)
          .toList();
      expect(resetEvents, hasLength(1));
      final event = resetEvents.single;
      // The audit linkage is the appended event: id and canonical payload
      // digest land in the assertion.
      expect(assertion.localAuditId, event.id);
      final canonical = canonicalizeOhac(
        Uint8List.fromList(utf8.encode(event.payload)),
      );
      expect(canonical, isA<OhacSuccess<Uint8List>>());
      expect(
        ohacDigest((canonical as OhacSuccess<Uint8List>).value),
        assertion.localAuditEntryHash,
      );
      final payload = jsonDecode(event.payload) as Map<String, dynamic>;
      expect(payload['userId'], userId);
      expect(payload['localAuthorizationSequence'], '1');
    });

    test('concurrent authorizations are equivalent to sequential ones: '
        'distinct sequences, no lost update', () async {
      final results = await Future.wait([
        service().authorizeOperation(request()),
        service().authorizeOperation(request()),
      ]);

      expect(results, everyElement(isA<OhacAssertionAuthorized>()));
      final sequences = results
          .map((r) => (r as OhacAssertionAuthorized).assertion
              .localAuthorizationSequence)
          .toSet();
      expect(sequences, {'1', '2'},
          reason: 'each authorization stamps a distinct, monotonic sequence');
      expect((await terminalState()).localAuthorizationSequence, 2);
    });
  });

  group('service-level denies touch nothing durable', () {
    /// Each service-level deny is exercised and, for each one, the terminal
    /// revision is unchanged and NO event was appended — a deny that moves a
    /// revision or writes forensic evidence would fabricate authorization
    /// history (design §6: only the transaction's own outcome is recorded).
    Future<void> expectDenyWritesNothing(
      Future<OhacAssertionResult> Function() scenario,
      String expectedReason, {
      bool rowDeleted = false,
    }) async {
      final before = rowDeleted ? null : await terminalState();

      final result = await scenario();

      expect(result, isA<OhacAssertionDenied>());
      expect((result as OhacAssertionDenied).reason, expectedReason);
      if (rowDeleted) {
        // The row was absent before the deny and must still be absent —
        // a deny must not resurrect or seed terminal state.
        expect(
          await database.ohacDeliveryDao.findTerminalState(
            tenantId,
            terminalId,
          ),
          isNull,
        );
      } else {
        final after = await terminalState();
        expect(after.revision, before!.revision, reason: expectedReason);
        expect(after.localAuthorizationSequence,
            before.localAuthorizationSequence,
            reason: expectedReason);
      }
      expect(
        await database.ohacDeliveryDao
            .findEventsForTerminal(tenantId, terminalId),
        isEmpty,
        reason: expectedReason,
      );
    }

    test('invalidRequest', () async {
      await expectDenyWritesNothing(
        () => service()
            .authorizeOperation(request(permissionsUsed: ['sales.zzz', 'sales.aaa'])),
        OhacAuthorizationDenialReason.invalidRequest,
      );
    });

    test('noActiveEpoch', () async {
      await database.database.delete(
        'human_auth_terminal_state',
        where: 'tenant_id = ? AND terminal_id = ?',
        whereArgs: [tenantId, terminalId],
      );
      await expectDenyWritesNothing(
        () => service().authorizeOperation(request()),
        OhacAuthorizationDenialReason.noActiveEpoch,
        rowDeleted: true,
      );
    });

    test('buildMismatch', () async {
      posBuild = '9.9.9+99';
      await expectDenyWritesNothing(
        () => service().authorizeOperation(request()),
        OhacAuthorizationDenialReason.buildMismatch,
      );
    });

    test('unregisteredOutbox', () async {
      await expectDenyWritesNothing(
        () => service().authorizeOperation(request(outboxId: 'never-registered')),
        OhacAuthorizationDenialReason.unregisteredOutbox,
      );
    });

    test('userNotEligible', () async {
      await expectDenyWritesNothing(
        () => service().authorizeOperation(
          request(userIdField: 'ff000000-1111-4222-8333-444455556666'),
        ),
        OhacAuthorizationDenialReason.userNotEligible,
      );
    });

    test('permissionDenied', () async {
      await expectDenyWritesNothing(
        () => service()
            .authorizeOperation(request(permissionsUsed: ['inventory.adjust'])),
        OhacAuthorizationDenialReason.permissionDenied,
      );
    });
  });

  group('the revision CAS actually loses and actually retries (§13, forced)',
      () {
    /// Seeds an existing attempt row so the authorization's attempt write
    /// takes the UPDATE (CAS) path — the only path a concurrent writer can
    /// realistically win.
    Future<void> seedAttemptRow() => database.ohacDeliveryDao
        .insertAttemptState(
          OhacAttemptStateEntity(
            tenantId: tenantId,
            terminalId: terminalId,
            userId: userId,
            failureTimestamps: '[]',
            lockedUntil: null,
            resetGeneration: '1',
            localAuthorizationSequence: 0,
            revision: 0,
            updatedAt: '2026-01-01T00:00:00.000Z',
          ),
        );

    test('a forced CAS loss rolls the whole transaction back and the retry '
        'runs fresh: the counter bumps exactly once, one event survives',
        () async {
      await seedAttemptRow();
      var attempts = 0;
      final result = await OhacAuthorizationService(
        ohacDeliveryDao: database.ohacDeliveryDao,
        ohacOutboxRegistry: registry,
        readPosBuild: () async => posBuild,
        clock: () => currentTime,
        newId: () => 'ee000000-1111-4222-8333-444455556666',
        pinComparer: (candidatePin, verifierEncoded) {
          pinComparerCalls++;
          return pinMatches;
        },
        // Attempt 1 loses the CAS deterministically; attempt 2 runs clean.
        debugForceAttemptCasLoss: () => ++attempts == 1,
      ).authorizeOperation(request());

      expect(attempts, 2,
          reason: 'the retry path must actually retry, not give up or '
              'silently succeed on the lost attempt');
      expect(result, isA<OhacAssertionAuthorized>());

      // Full-rollback proof for the lost attempt: the counter bumped ONCE
      // overall (not once per attempt) and exactly one reset event exists —
      // everything the rolled-back attempt wrote is gone.
      expect((await terminalState()).localAuthorizationSequence, 1);
      final events = await database.ohacDeliveryDao
          .findEventsForTerminal(tenantId, terminalId);
      expect(
        events.where((e) => e.eventType ==
            OhacLocalEventType.pinAttemptResetSuccess),
        hasLength(1),
      );
      final attempt = await database.ohacDeliveryDao.findAttemptState(
        tenantId,
        terminalId,
        userId,
      );
      expect(attempt!.revision, 1,
          reason: 'exactly one surviving attempt-state write');
      expect(attempt.localAuthorizationSequence, 1);
    });

    test('retry-budget exhaustion rethrows and leaves EVERY durable surface '
        'byte-identical: no counter bump, no event, original attempt row',
        () async {
      await seedAttemptRow();
      final seededAttempt = await database.ohacDeliveryDao.findAttemptState(
        tenantId,
        terminalId,
        userId,
      );

      await expectLater(
        OhacAuthorizationService(
          ohacDeliveryDao: database.ohacDeliveryDao,
          ohacOutboxRegistry: registry,
          readPosBuild: () async => posBuild,
          clock: () => currentTime,
          newId: () => 'ee000000-1111-4222-8333-444455556666',
          pinComparer: (candidatePin, verifierEncoded) {
            pinComparerCalls++;
            return pinMatches;
          },
          maxCasRetries: 2,
          debugForceAttemptCasLoss: () => true,
        ).authorizeOperation(request()),
        throwsA(isA<OhacAttemptCasLostException>()),
      );

      final state = await terminalState();
      expect(state.localAuthorizationSequence, 0,
          reason: 'no counter bump may survive the exhausted retries');
      expect(state.revision, 1);
      expect(state.updatedAt, '2026-01-01T00:00:00.000Z');
      expect(
        await database.ohacDeliveryDao
            .findEventsForTerminal(tenantId, terminalId),
        isEmpty,
        reason: 'no forensic event may survive the exhausted retries',
      );
      final attempt = await database.ohacDeliveryDao.findAttemptState(
        tenantId,
        terminalId,
        userId,
      );
      // Byte-identical to the seed: the exhausted CAS never wrote.
      expect(attempt!.revision, seededAttempt!.revision);
      expect(attempt.failureTimestamps, seededAttempt.failureTimestamps);
      expect(attempt.lockedUntil, seededAttempt.lockedUntil);
      expect(attempt.resetGeneration, seededAttempt.resetGeneration);
      expect(attempt.localAuthorizationSequence,
          seededAttempt.localAuthorizationSequence);
      expect(attempt.updatedAt, seededAttempt.updatedAt);
    });
  });

  group('PIN material never leaks', () {
    test('the pin appears in no denial reason, event payload, or attempt row',
        () async {
      pinMatches = false;
      final svc = service();
      await svc.authorizeOperation(request());
      await svc.authorizeOperation(request());
      await svc.authorizeOperation(request());
      final locked = await svc.authorizeOperation(request());

      final attempt = await database.ohacDeliveryDao.findAttemptState(
        tenantId,
        terminalId,
        userId,
      );
      final events = await database.ohacDeliveryDao.findEventsForTerminal(
        tenantId,
        terminalId,
      );

      final surfaces = [
        (locked as OhacAssertionDenied).reason,
        attempt!.failureTimestamps,
        attempt.lockedUntil ?? '',
        attempt.resetGeneration,
        for (final event in events) event.eventType,
        for (final event in events) event.payload,
      ];
      expect(surfaces, everyElement(isNot(contains(pin))));
    });
  });
}
