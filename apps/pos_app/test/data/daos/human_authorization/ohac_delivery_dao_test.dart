import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/database/migrations.dart';
import 'package:pos_app/data/models/human_authorization/ohac_delivery_entities.dart';

import 'package:pos_app/domain/security/ohac_outbox_registry.dart';

import 'package:pos_app/data/models/human_authorization/staff_policy_epoch_v1.dart';

import 'package:pos_app/data/models/human_authorization/terminal_state_machine.dart';

/// The decision-31 test registrant: a mutable assertion-bearing outbox whose
/// drain and quarantine state the tests move directly.
class TestDrainOutbox
    implements OhacAssertionBearingOutbox, OhacQuarantineReportingOutbox {
  @override
  final String outboxId;

  int? lowestUnconsumed;
  int? lowestQuarantined;

  TestDrainOutbox(this.outboxId,
      {this.lowestUnconsumed, this.lowestQuarantined});

  @override
  Future<int?> lowestUnconsumedAssertionSequence() async => lowestUnconsumed;

  @override
  Future<int?> lowestQuarantinedAssertionSequence() async => lowestQuarantined;
}

/// DAO-level coverage for the OHAC local delivery tables (design §4.2, §5, §6).
///
/// The three append-only tables are guarded by SQLite triggers, so the refusal
/// assertions here prove the boundary holds at the DAO's own database, not
/// only on the migration path covered by `ohac_delivery_migration_test.dart`.
void main() {
  late AppDatabase database;

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
    // sqflite caches an in-memory database by path and evicts it only on
    // close, so the close must be registered even when an assertion fails,
    // otherwise the next test silently reuses this database without running
    // onCreate.
    addTearDown(database.close);
  });

  OhacPolicyEpochEntity epoch({
    String tenantId = 'tenant-1',
    String terminalId = 'terminal-1',
    int sequence = 1,
  }) =>
      OhacPolicyEpochEntity(
        tenantId: tenantId,
        terminalId: terminalId,
        sequence: sequence,
        digest: 'sha256:${'a' * 64}',
        previousSequence: sequence - 1,
        previousDigest: sequence == 1 ? 'GENESIS' : 'sha256:${'b' * 64}',
        schema: 'ohac.staff-policy-epoch.v1',
        targetPosBuild: '1.0.0+1',
        publisherBackendBuild: 'backend-1',
        minimumAssertionSchema: 'ohac.assertion.v1',
        payload: '{"sequence":$sequence}',
        receivedAt: '2026-01-01T00:00:0$sequence.000Z',
      );

  OhacPolicyEntryEntity entry({
    String tenantId = 'tenant-1',
    String terminalId = 'terminal-1',
    int sequence = 1,
    String userId = 'user-1',
    String? attemptResetGeneration,
  }) =>
      OhacPolicyEntryEntity(
        tenantId: tenantId,
        terminalId: terminalId,
        sequence: sequence,
        userId: userId,
        status: 'ACTIVE',
        role: 'MANAGER',
        permissions: '["sales.sell"]',
        verifierAlgorithm: 'bcrypt',
        verifierFormatVersion: '2b',
        verifierEncoded: r'$2b$10$abcdefghijklmnopqrstuv',
        attemptResetGeneration:
            attemptResetGeneration ?? 'gen-$sequence-$userId',
      );

  OhacTerminalStateEntity terminalState({
    String tenantId = 'tenant-1',
    String terminalId = 'terminal-1',
    String state = 'ACTIVE',
    int activeSequence = 1,
    String? activeDigest,
    int revision = 1,
    int candidateSequence = 0,
    String candidateDigest = '',
    int serverFloorSequence = 0,
    String serverFloorDigest = 'GENESIS',
    String negotiatedPosBuild = '',
    String negotiatedBackendBuild = '',
    String negotiatedPolicySchema = '',
    String negotiatedAssertionSchema = '',
    String integrityClassification = '',
    String? ackDeferralReason,
    int? ackDeferralCount,
    int localAuthorizationSequence = 0,
    String updatedAt = '2026-01-01T00:00:00.000Z',
  }) =>
      OhacTerminalStateEntity(
        tenantId: tenantId,
        terminalId: terminalId,
        state: state,
        activeSequence: activeSequence,
        activeDigest: activeDigest ?? 'sha256:${'c' * 64}',
        candidateSequence: candidateSequence,
        candidateDigest: candidateDigest,
        serverFloorSequence: serverFloorSequence,
        serverFloorDigest: serverFloorDigest,
        negotiatedPosBuild: negotiatedPosBuild,
        negotiatedBackendBuild: negotiatedBackendBuild,
        negotiatedPolicySchema: negotiatedPolicySchema,
        negotiatedAssertionSchema: negotiatedAssertionSchema,
        integrityClassification: integrityClassification,
        ackDeferralReason: ackDeferralReason,
        ackDeferralCount: ackDeferralCount,
        localAuthorizationSequence: localAuthorizationSequence,
        revision: revision,
        updatedAt: updatedAt,
      );

  OhacAttemptStateEntity attemptState({
    String tenantId = 'tenant-1',
    String terminalId = 'terminal-1',
    String userId = 'user-1',
    String? lockedUntil,
    int revision = 1,
    String resetGeneration = 'gen-1',
    String failureTimestamps = '["2026-01-01T00:00:00.000Z"]',
  }) =>
      OhacAttemptStateEntity(
        tenantId: tenantId,
        terminalId: terminalId,
        userId: userId,
        failureTimestamps: failureTimestamps,
        lockedUntil: lockedUntil,
        resetGeneration: resetGeneration,
        localAuthorizationSequence: 7,
        revision: revision,
        updatedAt: '2026-01-01T00:00:00.000Z',
      );

  OhacLocalEventEntity event({
    String id = 'event-1',
    String terminalId = 'terminal-1',
    String createdAt = '2026-01-01T00:00:00.000Z',
  }) =>
      OhacLocalEventEntity(
        id: id,
        tenantId: 'tenant-1',
        terminalId: terminalId,
        eventType: 'EPOCH_APPLIED',
        sequence: 1,
        payload: '{"id":"$id"}',
        createdAt: createdAt,
      );

  group('OhacPolicyEpochDao', () {
    test('round trip preserves every field', () async {
      expect(await database.database.query('human_auth_policy_epochs'), isEmpty);

      final inserted = epoch(sequence: 3);
      await database.ohacDeliveryDao.insertEpoch(inserted);

      final read = await database.ohacDeliveryDao.findEpoch(
        'tenant-1',
        'terminal-1',
        3,
      );
      expect(read, isNotNull);
      expect(read!.tenantId, inserted.tenantId);
      expect(read.terminalId, inserted.terminalId);
      expect(read.sequence, inserted.sequence);
      expect(read.digest, inserted.digest);
      expect(read.previousSequence, inserted.previousSequence);
      expect(read.previousDigest, inserted.previousDigest);
      expect(read.schema, inserted.schema);
      expect(read.targetPosBuild, inserted.targetPosBuild);
      expect(read.publisherBackendBuild, inserted.publisherBackendBuild);
      expect(read.minimumAssertionSchema, inserted.minimumAssertionSchema);
      expect(read.payload, inserted.payload);
      expect(read.receivedAt, inserted.receivedAt);
    });

    test('findEpoch returns null for an unknown epoch', () async {
      await database.ohacDeliveryDao.insertEpoch(epoch(sequence: 1));

      final read = await database.ohacDeliveryDao.findEpoch(
        'tenant-1',
        'terminal-1',
        99,
      );
      expect(read, isNull);
    });

    test('findNewestEpoch picks the highest sequence, not the newest insert',
        () async {
      expect(await database.database.query('human_auth_policy_epochs'), isEmpty);

      await database.ohacDeliveryDao.insertEpoch(epoch(sequence: 3));
      await database.ohacDeliveryDao.insertEpoch(epoch(sequence: 1));
      await database.ohacDeliveryDao.insertEpoch(epoch(sequence: 7));

      final newest = await database.ohacDeliveryDao.findNewestEpoch(
        'tenant-1',
        'terminal-1',
      );
      expect(newest, isNotNull);
      expect(newest!.sequence, 7);
    });

    test('findEpochsAfter returns ascending and excludes the boundary',
        () async {
      await database.ohacDeliveryDao.insertEpoch(epoch(sequence: 1));
      await database.ohacDeliveryDao.insertEpoch(epoch(sequence: 2));
      await database.ohacDeliveryDao.insertEpoch(epoch(sequence: 3));

      final after = await database.ohacDeliveryDao.findEpochsAfter(
        'tenant-1',
        'terminal-1',
        1,
      );
      expect(after.map((e) => e.sequence).toList(), [2, 3]);
    });
  });

  group('OhacPolicyEntryDao', () {
    test('round trip preserves every field', () async {
      expect(await database.database.query('human_auth_policy_entries'), isEmpty);

      final inserted = entry(sequence: 2, userId: 'user-9');
      await database.ohacDeliveryDao.insertEntries([inserted]);

      final read = await database.ohacDeliveryDao.findEntryForUser(
        'tenant-1',
        'terminal-1',
        2,
        'user-9',
      );
      expect(read, isNotNull);
      expect(read!.tenantId, inserted.tenantId);
      expect(read.terminalId, inserted.terminalId);
      expect(read.sequence, inserted.sequence);
      expect(read.userId, inserted.userId);
      expect(read.status, inserted.status);
      expect(read.role, inserted.role);
      expect(read.permissions, inserted.permissions);
      expect(read.verifierAlgorithm, inserted.verifierAlgorithm);
      expect(read.verifierFormatVersion, inserted.verifierFormatVersion);
      expect(read.verifierEncoded, inserted.verifierEncoded);
      expect(read.attemptResetGeneration, inserted.attemptResetGeneration);
    });

    test('findEntries returns entries ordered by user_id', () async {
      await database.ohacDeliveryDao.insertEntries([
        entry(userId: 'zoe'),
        entry(userId: 'ada'),
        entry(userId: 'mia'),
      ]);

      final entries = await database.ohacDeliveryDao.findEntries(
        'tenant-1',
        'terminal-1',
        1,
      );
      expect(entries.map((e) => e.userId).toList(), ['ada', 'mia', 'zoe']);
    });

    test('findEntryForUser finds the right one and null for an unknown user',
        () async {
      await database.ohacDeliveryDao.insertEntries([
        entry(sequence: 1, userId: 'user-1'),
        entry(sequence: 2, userId: 'user-2'),
      ]);

      final found = await database.ohacDeliveryDao.findEntryForUser(
        'tenant-1',
        'terminal-1',
        2,
        'user-2',
      );
      expect(found, isNotNull);
      expect(found!.sequence, 2);
      expect(found.userId, 'user-2');

      final unknown = await database.ohacDeliveryDao.findEntryForUser(
        'tenant-1',
        'terminal-1',
        2,
        'nobody',
      );
      expect(unknown, isNull);
    });
  });

  group('OhacTerminalStateDao', () {
    // The extension columns use "absent" sentinels instead of NULL and carry
    // no CHECK constraint (a Floor @Entity cannot express one, so a CHECK
    // would exist only on the upgrade path and reintroduce the
    // install-versus-upgrade drift that 0264fde repaired). The pairing is a
    // documented invariant enforced here instead.
    void expectSameTerminalState(
      OhacTerminalStateEntity actual,
      OhacTerminalStateEntity expected, [
      String reasonPrefix = '',
    ]) {
      void check(Object? actualValue, Object? expectedValue, String field) {
        expect(actualValue, expectedValue, reason: '$reasonPrefix$field');
      }

      check(actual.tenantId, expected.tenantId, 'tenant_id');
      check(actual.terminalId, expected.terminalId, 'terminal_id');
      check(actual.state, expected.state, 'state');
      check(actual.activeSequence, expected.activeSequence, 'active_sequence');
      check(actual.activeDigest, expected.activeDigest, 'active_digest');
      check(
          actual.candidateSequence, expected.candidateSequence,
          'candidate_sequence');
      check(actual.candidateDigest, expected.candidateDigest,
          'candidate_digest');
      check(actual.serverFloorSequence, expected.serverFloorSequence,
          'server_floor_sequence');
      check(actual.serverFloorDigest, expected.serverFloorDigest,
          'server_floor_digest');
      check(actual.negotiatedPosBuild, expected.negotiatedPosBuild,
          'negotiated_pos_build');
      check(actual.negotiatedBackendBuild, expected.negotiatedBackendBuild,
          'negotiated_backend_build');
      check(actual.negotiatedPolicySchema, expected.negotiatedPolicySchema,
          'negotiated_policy_schema');
      check(actual.negotiatedAssertionSchema,
          expected.negotiatedAssertionSchema, 'negotiated_assertion_schema');
      check(actual.integrityClassification, expected.integrityClassification,
          'integrity_classification');
      check(
          actual.localAuthorizationSequence,
          expected.localAuthorizationSequence,
          'local_authorization_sequence');
      check(actual.revision, expected.revision, 'revision');
      check(actual.updatedAt, expected.updatedAt, 'updated_at');
    }

    test('round trip preserves every field', () async {
      expect(
        await database.database.query('human_auth_terminal_state'),
        isEmpty,
      );

      final inserted = terminalState(
        state: 'RECEIVE_PENDING',
        activeSequence: 4,
        revision: 2,
        candidateSequence: 5,
        candidateDigest: 'sha256:${'d' * 64}',
        serverFloorSequence: 3,
        serverFloorDigest: 'sha256:${'f' * 64}',
        negotiatedPosBuild: '2.0.0+7',
        negotiatedBackendBuild: 'backend-2',
        negotiatedPolicySchema: 'ohac.staff-policy-epoch.v1',
        negotiatedAssertionSchema: 'ohac.assertion.v1',
        integrityClassification: 'EPOCH_CHAIN_BROKEN',
        localAuthorizationSequence: 12,
      );
      await database.ohacDeliveryDao.insertTerminalState(inserted);

      final read = await database.ohacDeliveryDao.findTerminalState(
        'tenant-1',
        'terminal-1',
      );
      expect(read, isNotNull);
      expectSameTerminalState(read!, inserted);
    });

    test('insertTerminalState twice for the same terminal fails instead of '
        'overwriting', () async {
      await database.ohacDeliveryDao
          .insertTerminalState(terminalState(state: 'ACTIVE'));

      await expectLater(
        database.ohacDeliveryDao
            .insertTerminalState(terminalState(state: 'ACK_SUBMITTING')),
        throwsA(isA<Exception>()),
      );

      final stored = await database.ohacDeliveryDao.findTerminalState(
        'tenant-1',
        'terminal-1',
      );
      expect(stored!.state, 'ACTIVE',
          reason: 'a failed insert must not overwrite the protected state');
    });

    test('a terminal that never received a candidate reports the sentinel '
        'pair, and confirm restores it', () async {
      // The sentinels are the documented "absent" values: epoch sequences
      // start at 1 so 0 is not a sequence, and a digest is never empty.
      await database.ohacDeliveryDao
          .insertTerminalState(terminalState(state: 'ACTIVE', revision: 7));

      final fresh = await database.ohacDeliveryDao.findTerminalState(
        'tenant-1',
        'terminal-1',
      );
      expect(fresh!.candidateSequence, 0);
      expect(fresh.candidateDigest, '');
      expect(fresh.serverFloorSequence, 0,
          reason: 'a terminal that acknowledged nothing sits at the genesis '
              'floor');
      expect(fresh.serverFloorDigest, 'GENESIS');

      final received = await database.ohacDeliveryDao.receiveEpoch(
        'tenant-1',
        'terminal-1',
        7,
        8,
        'sha256:${'d' * 64}',
        '2.0.0+7',
        'backend-2',
        'ohac.staff-policy-epoch.v1',
        'ohac.assertion.v1',
        '2026-01-02T00:00:00.000Z',
      );
      expect(received, 1);

      final carrying = await database.ohacDeliveryDao.findTerminalState(
        'tenant-1',
        'terminal-1',
      );
      expect(carrying!.candidateSequence, 8);
      expect(carrying.candidateDigest, 'sha256:${'d' * 64}');

      final confirmed = await database.ohacDeliveryDao
          .confirmAcknowledgement(
        'tenant-1',
        'terminal-1',
        8,
        '2026-01-03T00:00:00.000Z',
      );
      expect(confirmed, 1);

      final restored = await database.ohacDeliveryDao.findTerminalState(
        'tenant-1',
        'terminal-1',
      );
      expect(restored!.candidateSequence, 0,
          reason: 'confirm must clear the candidate back to its sentinel');
      expect(restored.candidateDigest, '');
      expect(restored.activeSequence, 8,
          reason: 'confirm must promote the candidate to active');
      expect(restored.activeDigest, 'sha256:${'d' * 64}');
      expect(restored.state, 'ACTIVE');
    });

    test('receiveEpoch writes the pending state, the candidate pair and the '
        'negotiated facts', () async {
      await database.ohacDeliveryDao
          .insertTerminalState(terminalState(state: 'ACTIVE', revision: 7));

      final received = await database.ohacDeliveryDao.receiveEpoch(
        'tenant-1',
        'terminal-1',
        7,
        8,
        'sha256:${'d' * 64}',
        '2.0.0+7',
        'backend-2',
        'ohac.staff-policy-epoch.v1',
        'ohac.assertion.v1',
        '2026-01-02T00:00:00.000Z',
      );
      expect(received, 1);

      final read = await database.ohacDeliveryDao.findTerminalState(
        'tenant-1',
        'terminal-1',
      );
      expect(read!.state, 'RECEIVE_PENDING');
      expect(read.candidateSequence, 8);
      expect(read.candidateDigest, 'sha256:${'d' * 64}');
      expect(read.negotiatedPosBuild, '2.0.0+7');
      expect(read.negotiatedBackendBuild, 'backend-2');
      expect(read.negotiatedPolicySchema, 'ohac.staff-policy-epoch.v1');
      expect(read.negotiatedAssertionSchema, 'ohac.assertion.v1');
      expect(read.updatedAt, '2026-01-02T00:00:00.000Z');
      expect(read.revision, 8);
      // Fields the receive transition does not own stay untouched.
      expect(read.activeSequence, 1);
      expect(read.activeDigest, 'sha256:${'c' * 64}');
    });

    test('the negotiated facts survive a receive and are not silently '
        'defaulted', () async {
      // A receive over a row whose negotiated facts were already set must
      // overwrite every one of them, not leave stale values behind.
      await database.ohacDeliveryDao.insertTerminalState(terminalState(
        state: 'ACTIVE',
        revision: 7,
        negotiatedPosBuild: '1.0.0+1',
        negotiatedBackendBuild: 'backend-1',
        negotiatedPolicySchema: 'ohac.staff-policy-epoch.v0',
        negotiatedAssertionSchema: 'ohac.assertion.v0',
      ));

      final received = await database.ohacDeliveryDao.receiveEpoch(
        'tenant-1',
        'terminal-1',
        7,
        8,
        'sha256:${'d' * 64}',
        '3.0.0+1',
        'backend-3',
        'ohac.staff-policy-epoch.v2',
        'ohac.assertion.v2',
        '2026-01-02T00:00:00.000Z',
      );
      expect(received, 1);

      final read = await database.ohacDeliveryDao.findTerminalState(
        'tenant-1',
        'terminal-1',
      );
      expect(read!.negotiatedPosBuild, '3.0.0+1');
      expect(read.negotiatedBackendBuild, 'backend-3');
      expect(read.negotiatedPolicySchema, 'ohac.staff-policy-epoch.v2');
      expect(read.negotiatedAssertionSchema, 'ohac.assertion.v2');
    });

    test('submitAcknowledgement moves to ACK_SUBMITTING and leaves the '
        'candidate untouched', () async {
      await database.ohacDeliveryDao.insertTerminalState(terminalState(
        state: 'RECEIVE_PENDING',
        revision: 7,
        candidateSequence: 8,
        candidateDigest: 'sha256:${'d' * 64}',
      ));

      final submitted = await database.ohacDeliveryDao
          .submitAcknowledgement(
        'tenant-1',
        'terminal-1',
        7,
        '2026-01-02T00:00:00.000Z',
      );
      expect(submitted, 1);

      final read = await database.ohacDeliveryDao.findTerminalState(
        'tenant-1',
        'terminal-1',
      );
      expect(read!.state, 'ACK_SUBMITTING');
      expect(read.candidateSequence, 8,
          reason: 'submit owns only the state; the candidate is untouched');
      expect(read.candidateDigest, 'sha256:${'d' * 64}');
      expect(read.revision, 8);
      expect(read.updatedAt, '2026-01-02T00:00:00.000Z');
    });

    test('recordServerFloor writes both halves of the floor', () async {
      await database.ohacDeliveryDao
          .insertTerminalState(terminalState(state: 'ACTIVE', revision: 7));

      final recorded = await database.ohacDeliveryDao.recordServerFloor(
        'tenant-1',
        'terminal-1',
        7,
        6,
        'sha256:${'f' * 64}',
        '2026-01-02T00:00:00.000Z',
      );
      expect(recorded, 1);

      final read = await database.ohacDeliveryDao.findTerminalState(
        'tenant-1',
        'terminal-1',
      );
      expect(read!.serverFloorSequence, 6);
      expect(read.serverFloorDigest, 'sha256:${'f' * 64}');
      expect(read.revision, 8);
    });

    test('markIntegrityLoss sets the state and the classification, and the '
        'classification is readable afterwards', () async {
      await database.ohacDeliveryDao
          .insertTerminalState(terminalState(state: 'ACTIVE', revision: 7));

      final marked = await database.ohacDeliveryDao.markIntegrityLoss(
        'tenant-1',
        'terminal-1',
        7,
        'EPOCH_CHAIN_BROKEN',
        '2026-01-02T00:00:00.000Z',
      );
      expect(marked, 1);

      final read = await database.ohacDeliveryDao.findTerminalState(
        'tenant-1',
        'terminal-1',
      );
      expect(read!.state, 'INTEGRITY_LOSS');
      expect(read.integrityClassification, 'EPOCH_CHAIN_BROKEN');
      expect(read.revision, 8);
    });

    test('every transition is a real compare-and-set, and a stale one does '
        'not partially apply', () async {
      final candidateDigest = 'sha256:${'d' * 64}';

      Future<int?> receive(int expectedRevision) =>
          database.ohacDeliveryDao.receiveEpoch(
            'tenant-1',
            'terminal-1',
            expectedRevision,
            8,
            candidateDigest,
            '2.0.0+7',
            'backend-2',
            'ohac.staff-policy-epoch.v1',
            'ohac.assertion.v1',
            '2026-01-02T00:00:00.000Z',
          );
      Future<int?> submit(int expectedRevision) =>
          database.ohacDeliveryDao.submitAcknowledgement(
            'tenant-1',
            'terminal-1',
            expectedRevision,
            '2026-01-02T00:00:00.000Z',
          );
      Future<int?> confirm(int expectedRevision) =>
          database.ohacDeliveryDao.confirmAcknowledgement(
            'tenant-1',
            'terminal-1',
            expectedRevision,
            '2026-01-02T00:00:00.000Z',
          );
      Future<int?> floor(int expectedRevision) =>
          database.ohacDeliveryDao.recordServerFloor(
            'tenant-1',
            'terminal-1',
            expectedRevision,
            6,
            'sha256:${'f' * 64}',
            '2026-01-02T00:00:00.000Z',
          );
      Future<int?> loss(int expectedRevision) =>
          database.ohacDeliveryDao.markIntegrityLoss(
            'tenant-1',
            'terminal-1',
            expectedRevision,
            'EPOCH_CHAIN_BROKEN',
            '2026-01-02T00:00:00.000Z',
          );

      final scenarios = <(
        String name,
        OhacTerminalStateEntity seeded,
        Future<int?> Function(int expectedRevision) attempt,
        OhacTerminalStateEntity Function(int newRevision) expectedAfterWin,
      )>[
        (
          'receive',
          terminalState(state: 'ACTIVE', activeSequence: 4, revision: 7),
          receive,
          (int newRevision) => terminalState(
                state: 'RECEIVE_PENDING',
                activeSequence: 4,
                revision: newRevision,
                candidateSequence: 8,
                candidateDigest: candidateDigest,
                negotiatedPosBuild: '2.0.0+7',
                negotiatedBackendBuild: 'backend-2',
                negotiatedPolicySchema: 'ohac.staff-policy-epoch.v1',
                negotiatedAssertionSchema: 'ohac.assertion.v1',
                updatedAt: '2026-01-02T00:00:00.000Z',
              ),
        ),
        (
          'submit',
          terminalState(
            state: 'RECEIVE_PENDING',
            revision: 7,
            candidateSequence: 8,
            candidateDigest: candidateDigest,
          ),
          submit,
          (int newRevision) => terminalState(
                state: 'ACK_SUBMITTING',
                revision: newRevision,
                candidateSequence: 8,
                candidateDigest: candidateDigest,
                updatedAt: '2026-01-02T00:00:00.000Z',
              ),
        ),
        (
          'confirm',
          terminalState(
            state: 'RECEIVE_PENDING',
            revision: 7,
            candidateSequence: 8,
            candidateDigest: candidateDigest,
          ),
          confirm,
          (int newRevision) => terminalState(
                state: 'ACTIVE',
                activeSequence: 8,
                activeDigest: candidateDigest,
                revision: newRevision,
                updatedAt: '2026-01-02T00:00:00.000Z',
              ),
        ),
        (
          'floor',
          terminalState(state: 'ACTIVE', revision: 7),
          floor,
          (int newRevision) => terminalState(
                state: 'ACTIVE',
                revision: newRevision,
                serverFloorSequence: 6,
                serverFloorDigest: 'sha256:${'f' * 64}',
                updatedAt: '2026-01-02T00:00:00.000Z',
              ),
        ),
        (
          'integrity loss',
          terminalState(state: 'ACTIVE', revision: 7),
          loss,
          (int newRevision) => terminalState(
                state: 'INTEGRITY_LOSS',
                revision: newRevision,
                integrityClassification: 'EPOCH_CHAIN_BROKEN',
                updatedAt: '2026-01-02T00:00:00.000Z',
              ),
        ),
      ];

      for (final (name, seeded, attempt, expectedAfterWin) in scenarios) {
        await database.database.delete('human_auth_terminal_state');
        await database.ohacDeliveryDao.insertTerminalState(seeded);

        // A stale expectation loses the race and changes nothing. The seeded
        // revision is deliberately not 1, so a WHERE clause that compared the
        // revision against a constant instead of against the caller's
        // expectation would fail here rather than pass by coincidence.
        final stale = await attempt(seeded.revision + 100);
        expect(stale, 0, reason: name);
        final afterStale = await database.ohacDeliveryDao
            .findTerminalState(seeded.tenantId, seeded.terminalId);
        // Whole-row equality is what proves a stale transition did not
        // partially apply: the state and the candidate must be unchanged
        // together, not just one of them.
        expectSameTerminalState(afterStale!, seeded, '$name stale: ');

        // The current expectation wins exactly once and bumps the revision.
        final won = await attempt(seeded.revision);
        expect(won, 1, reason: name);
        final afterWin = await database.ohacDeliveryDao
            .findTerminalState(seeded.tenantId, seeded.terminalId);
        expectSameTerminalState(
          afterWin!,
          expectedAfterWin(seeded.revision + 1),
          '$name win: ',
        );

        // The revision the win consumed can never win again.
        final replayed = await attempt(seeded.revision);
        expect(replayed, 0, reason: name);
        final afterReplay = await database.ohacDeliveryDao
            .findTerminalState(seeded.tenantId, seeded.terminalId);
        expectSameTerminalState(
          afterReplay!,
          expectedAfterWin(seeded.revision + 1),
          '$name replay: ',
        );
      }
    });

    group('ensureTerminalState', () {
      test('inserts the exact sentinel first row when none exists', () async {
        expect(
          await database.database.query('human_auth_terminal_state'),
          isEmpty,
        );

        await database.ohacDeliveryDao.ensureTerminalState(
          'tenant-1',
          'terminal-1',
          '2026-02-01T00:00:00.000Z',
        );

        final state = await database.ohacDeliveryDao
            .findTerminalState('tenant-1', 'terminal-1');
        expect(state, isNotNull);
        // The sentinel row, from the entity doc comments and the state
        // machine: ACTIVE at sequence 0 with the epoch chain's pre-epoch-1
        // floor, no candidate, no negotiated facts, no fault, no
        // authorization history, and the caller's timestamp (design §4.2,
        // §5).
        expectSameTerminalState(
          state!,
          OhacTerminalStateEntity(
            tenantId: 'tenant-1',
            terminalId: 'terminal-1',
            state: OhacTerminalPhase.active.wire,
            activeSequence: 0,
            activeDigest: '',
            candidateSequence: 0,
            candidateDigest: '',
            serverFloorSequence: 0,
            serverFloorDigest: genesisDigest,
            negotiatedPosBuild: '',
            negotiatedBackendBuild: '',
            negotiatedPolicySchema: '',
            negotiatedAssertionSchema: '',
            integrityClassification: '',
            localAuthorizationSequence: 0,
            revision: 0,
            updatedAt: '2026-02-01T00:00:00.000Z',
          ),
        );
      });

      test('is idempotent: a second call changes nothing, not even the '
          'revision or the timestamp', () async {
        await database.ohacDeliveryDao.ensureTerminalState(
          'tenant-1',
          'terminal-1',
          '2026-02-01T00:00:00.000Z',
        );

        await database.ohacDeliveryDao.ensureTerminalState(
          'tenant-1',
          'terminal-1',
          '2026-02-02T00:00:00.000Z',
        );

        final rows = await database.database
            .query('human_auth_terminal_state');
        expect(rows, hasLength(1));
        expect(rows.single['revision'], 0);
        expect(rows.single['updated_at'], '2026-02-01T00:00:00.000Z');
      });

      test('leaves an existing row exactly as it was', () async {
        final existing = terminalState(
          state: 'RECEIVE_PENDING',
          activeSequence: 3,
          candidateSequence: 4,
          candidateDigest: 'sha256:${'d' * 64}',
          serverFloorSequence: 3,
          negotiatedPosBuild: '1.0.0+1',
          revision: 9,
          updatedAt: '2026-01-15T00:00:00.000Z',
        );
        await database.ohacDeliveryDao.insertTerminalState(existing);

        await database.ohacDeliveryDao.ensureTerminalState(
          existing.tenantId,
          existing.terminalId,
          '2026-02-01T00:00:00.000Z',
        );

        final state = await database.ohacDeliveryDao.findTerminalState(
          existing.tenantId,
          existing.terminalId,
        );
        expectSameTerminalState(state!, existing);
      });

      test('keys the sentinel row by tenant and terminal, not globally',
          () async {
        await database.ohacDeliveryDao.ensureTerminalState(
          'tenant-1',
          'terminal-1',
          '2026-02-01T00:00:00.000Z',
        );
        await database.ohacDeliveryDao.ensureTerminalState(
          'tenant-2',
          'terminal-1',
          '2026-02-01T00:00:00.000Z',
        );

        final tenant1 = await database.ohacDeliveryDao
            .findTerminalState('tenant-1', 'terminal-1');
        final tenant2 = await database.ohacDeliveryDao
            .findTerminalState('tenant-2', 'terminal-1');
        expect(tenant1!.tenantId, 'tenant-1');
        expect(tenant2!.tenantId, 'tenant-2');
      });
    });
  });

  group('OhacAttemptStateDao', () {
    test('round trip preserves every field with a null lockedUntil',
        () async {
      expect(
        await database.database.query('human_auth_attempt_state'),
        isEmpty,
      );

      final inserted = attemptState();
      await database.ohacDeliveryDao.insertAttemptState(inserted);

      final read = await database.ohacDeliveryDao.findAttemptState(
        'tenant-1',
        'terminal-1',
        'user-1',
      );
      expect(read, isNotNull);
      expect(read!.tenantId, inserted.tenantId);
      expect(read.terminalId, inserted.terminalId);
      expect(read.userId, inserted.userId);
      expect(read.failureTimestamps, inserted.failureTimestamps);
      expect(read.lockedUntil, isNull);
      expect(read.resetGeneration, inserted.resetGeneration);
      expect(read.localAuthorizationSequence,
          inserted.localAuthorizationSequence);
      expect(read.revision, inserted.revision);
      expect(read.updatedAt, inserted.updatedAt);
    });

    test('round trip preserves a non-null lockedUntil', () async {
      final inserted = attemptState(
        userId: 'user-2',
        lockedUntil: '2026-01-01T01:00:00.000Z',
      );
      await database.ohacDeliveryDao.insertAttemptState(inserted);

      final read = await database.ohacDeliveryDao.findAttemptState(
        'tenant-1',
        'terminal-1',
        'user-2',
      );
      expect(read!.lockedUntil, '2026-01-01T01:00:00.000Z');
    });

    test('the revision compare-and-set is real, including lockedUntil',
        () async {
      await database.ohacDeliveryDao
          .insertAttemptState(attemptState(revision: 5));

      // A stale expectation loses the race and changes nothing. As above, the
      // seeded revision is deliberately not 1 so a hardcoded comparison could
      // not pass by coincidence.
      final stale = await database.ohacDeliveryDao
          .updateAttemptStateIfRevisionMatches(
        'tenant-1',
        'terminal-1',
        'user-1',
        5 + 100,
        '["2026-02-01T00:00:00.000Z"]',
        '2026-02-01T01:00:00.000Z',
        'gen-2',
        8,
        '2026-02-01T00:00:00.000Z',
      );
      expect(stale, 0);
      final afterStale = await database.ohacDeliveryDao.findAttemptState(
        'tenant-1',
        'terminal-1',
        'user-1',
      );
      expect(afterStale!.failureTimestamps, '["2026-01-01T00:00:00.000Z"]');
      expect(afterStale.revision, 5);

      // The current expectation wins exactly once, clears the lock and bumps
      // the revision.
      final won = await database.ohacDeliveryDao
          .updateAttemptStateIfRevisionMatches(
        'tenant-1',
        'terminal-1',
        'user-1',
        5,
        '["2026-02-01T00:00:00.000Z"]',
        '',
        'gen-2',
        8,
        '2026-02-01T00:00:00.000Z',
      );
      expect(won, 1);
      final afterWin = await database.ohacDeliveryDao.findAttemptState(
        'tenant-1',
        'terminal-1',
        'user-1',
      );
      expect(afterWin!.failureTimestamps, '["2026-02-01T00:00:00.000Z"]');
      expect(afterWin.lockedUntil, isNull);
      expect(afterWin.resetGeneration, 'gen-2');
      expect(afterWin.localAuthorizationSequence, 8);
      expect(afterWin.updatedAt, '2026-02-01T00:00:00.000Z');
      expect(afterWin.revision, 6);

      // The revision the first win consumed can never win again.
      final replayed = await database.ohacDeliveryDao
          .updateAttemptStateIfRevisionMatches(
        'tenant-1',
        'terminal-1',
        'user-1',
        5,
        '[]',
        '2026-03-01T00:00:00.000Z',
        'gen-3',
        9,
        '2026-03-01T00:00:00.000Z',
      );
      expect(replayed, 0);
      final afterReplay = await database.ohacDeliveryDao.findAttemptState(
        'tenant-1',
        'terminal-1',
        'user-1',
      );
      expect(afterReplay!.resetGeneration, 'gen-2');
      expect(afterReplay.revision, 6);
    });

    test('the clear-the-lock sentinel works from a real instant, and a real '
        'instant can be stored again', () async {
      await database.ohacDeliveryDao.insertAttemptState(
        attemptState(lockedUntil: '2026-01-01T01:00:00.000Z'),
      );

      Future<String?> storedLock() async =>
          (await database.ohacDeliveryDao.findAttemptState(
            'tenant-1',
            'terminal-1',
            'user-1',
          ))!
              .lockedUntil;

      // The row really starts locked, so the transition below is a change and
      // not a row that was already NULL — which is what the other CAS test
      // cannot distinguish.
      expect(await storedLock(), '2026-01-01T01:00:00.000Z');

      final cleared = await database.ohacDeliveryDao
          .updateAttemptStateIfRevisionMatches(
        'tenant-1',
        'terminal-1',
        'user-1',
        1,
        '["2026-02-01T00:00:00.000Z"]',
        '',
        'gen-2',
        8,
        '2026-02-01T00:00:00.000Z',
      );
      expect(cleared, 1);
      expect(
        await storedLock(),
        isNull,
        reason: "an empty string must reach the column as NULL, not as ''",
      );

      final relocked = await database.ohacDeliveryDao
          .updateAttemptStateIfRevisionMatches(
        'tenant-1',
        'terminal-1',
        'user-1',
        2,
        '["2026-03-01T00:00:00.000Z"]',
        '2026-03-01T01:00:00.000Z',
        'gen-3',
        9,
        '2026-03-01T00:00:00.000Z',
      );
      expect(relocked, 1);
      expect(
        await storedLock(),
        '2026-03-01T01:00:00.000Z',
        reason: 'a real instant must survive the NULLIF sentinel',
      );
    });
  });

  group('OhacLocalEventDao', () {
    test('round trip preserves every field', () async {
      expect(await database.database.query('human_auth_local_events'), isEmpty);

      final inserted = event(id: 'event-42', createdAt: '2026-01-05T00:00:00.000Z');
      await database.ohacDeliveryDao.appendEvent(inserted);

      final events = await database.ohacDeliveryDao.findEventsForTerminal(
        'tenant-1',
        'terminal-1',
      );
      expect(events, hasLength(1));
      final read = events.single;
      expect(read.id, inserted.id);
      expect(read.tenantId, inserted.tenantId);
      expect(read.terminalId, inserted.terminalId);
      expect(read.eventType, inserted.eventType);
      expect(read.sequence, inserted.sequence);
      expect(read.payload, inserted.payload);
      expect(read.createdAt, inserted.createdAt);
    });

    test('findEventsForTerminal orders by created_at and isolates terminals',
        () async {
      await database.ohacDeliveryDao.appendEvent(
        event(id: 'e-3', createdAt: '2026-01-03T00:00:00.000Z'),
      );
      await database.ohacDeliveryDao.appendEvent(
        event(id: 'e-1', createdAt: '2026-01-01T00:00:00.000Z'),
      );
      await database.ohacDeliveryDao.appendEvent(
        event(id: 'e-2', createdAt: '2026-01-02T00:00:00.000Z'),
      );
      await database.ohacDeliveryDao.appendEvent(
        event(id: 'other-1', terminalId: 'terminal-2',
            createdAt: '2026-01-01T00:00:00.000Z'),
      );

      final events = await database.ohacDeliveryDao.findEventsForTerminal(
        'tenant-1',
        'terminal-1',
      );
      expect(events.map((e) => e.id).toList(), ['e-1', 'e-2', 'e-3']);
    });

    test('events sharing a created_at are ordered by id, not by insertion',
        () async {
      const sharedInstant = '2026-01-01T00:00:00.000Z';
      // Inserted in reverse id order, so an absent tiebreak would return the
      // insertion order and this assertion would fail.
      await database.ohacDeliveryDao
          .appendEvent(event(id: 'e-b', createdAt: sharedInstant));
      await database.ohacDeliveryDao
          .appendEvent(event(id: 'e-a', createdAt: sharedInstant));

      final events = await database.ohacDeliveryDao.findEventsForTerminal(
        'tenant-1',
        'terminal-1',
      );
      expect(events.map((e) => e.id).toList(), ['e-a', 'e-b']);
    });
  });

  group('append-only refusal at the DAO boundary', () {
    test('a direct update against each append-only table is refused',
        () async {
      await database.ohacDeliveryDao.insertEpoch(epoch());
      await database.ohacDeliveryDao.insertEntries([entry()]);
      await database.ohacDeliveryDao.appendEvent(event());

      for (final statement in [
        "UPDATE human_auth_policy_epochs SET payload = 'tampered'",
        "UPDATE human_auth_policy_entries SET status = 'INACTIVE'",
        "UPDATE human_auth_local_events SET payload = 'tampered'",
      ]) {
        await expectLater(
          database.database.rawUpdate(statement),
          throwsA(isA<DatabaseException>()),
        );
      }

      // The seeded evidence survives the attempt to rewrite it.
      expect(
        (await database.database.query('human_auth_policy_epochs'))
            .single['payload'],
        '{"sequence":1}',
      );
      expect(
        (await database.database.query('human_auth_policy_entries'))
            .single['status'],
        'ACTIVE',
      );
      expect(
        (await database.database.query('human_auth_local_events'))
            .single['payload'],
        '{"id":"event-1"}',
      );
    });

    test('a direct delete against each append-only table is refused',
        () async {
      await database.ohacDeliveryDao.insertEpoch(epoch());
      await database.ohacDeliveryDao.insertEntries([entry()]);
      await database.ohacDeliveryDao.appendEvent(event());

      for (final statement in [
        'DELETE FROM human_auth_policy_epochs',
        'DELETE FROM human_auth_policy_entries',
        'DELETE FROM human_auth_local_events',
      ]) {
        await expectLater(
          database.database.rawDelete(statement),
          throwsA(isA<DatabaseException>()),
        );
      }

      // Evidence survives the attempt to erase it.
      expect(
        await database.database.query('human_auth_policy_epochs'),
        hasLength(1),
      );
      expect(
        await database.database.query('human_auth_policy_entries'),
        hasLength(1),
      );
      expect(
        await database.database.query('human_auth_local_events'),
        hasLength(1),
      );
    });

    test('the mutable tables stay writable through their DAOs', () async {
      // The refusal assertions above only mean something if immutability was
      // not over-applied: both mutable tables must still accept an insert and
      // an update.
      await database.ohacDeliveryDao
          .insertTerminalState(terminalState(revision: 1));
      final updated = await database.ohacDeliveryDao
          .submitAcknowledgement(
        'tenant-1',
        'terminal-1',
        1,
        '2026-01-02T00:00:00.000Z',
      );
      expect(updated, 1);

      await database.ohacDeliveryDao
          .insertAttemptState(attemptState(revision: 1));
      final attemptUpdated = await database.ohacDeliveryDao
          .updateAttemptStateIfRevisionMatches(
        'tenant-1',
        'terminal-1',
        'user-1',
        1,
        '[]',
        '',
        'gen-1',
        7,
        '2026-01-02T00:00:00.000Z',
      );
      expect(attemptUpdated, 1);

      expect(
        (await database.ohacDeliveryDao.findTerminalState(
          'tenant-1',
          'terminal-1',
        ))!
            .state,
        'ACK_SUBMITTING',
      );
      expect(
        (await database.ohacDeliveryDao.findAttemptState(
          'tenant-1',
          'terminal-1',
          'user-1',
        ))!
            .revision,
        2,
      );
    });
  });

  group('receiveCandidateEpoch — the atomic candidate transaction R', () {
    final digest = 'sha256:${'d' * 64}';

    OhacPolicyEpochEntity candidate({int sequence = 2}) => OhacPolicyEpochEntity(
          tenantId: 'tenant-1',
          terminalId: 'terminal-1',
          sequence: sequence,
          digest: digest,
          previousSequence: sequence - 1,
          previousDigest: 'sha256:${'a' * 64}',
          schema: 'ohac.staff-policy-epoch.v1',
          targetPosBuild: '1.0.0+1',
          publisherBackendBuild: 'backend-1',
          minimumAssertionSchema: 'ohac.assertion.v1',
          payload: '{"sequence":$sequence}',
          receivedAt: '2026-01-02T00:00:00.000Z',
        );

    final priorDigest = 'sha256:${'a' * 64}';

    Future<void> seedActive({int revision = 1}) =>
        database.ohacDeliveryDao.insertTerminalState(
          terminalState(
            state: 'ACTIVE',
            activeSequence: 1,
            activeDigest: priorDigest,
            revision: revision,
          ),
        );

    Future<void> expectNothingPersisted({
      int revision = 1,
      String stateName = 'ACTIVE',
      int candidateSequence = 0,
    }) async {
      expect(
        await database.database.query('human_auth_policy_epochs'),
        isEmpty,
        reason: 'a rolled-back receive must leave no epoch row',
      );
      expect(
        await database.database.query('human_auth_policy_entries'),
        isEmpty,
        reason: 'a rolled-back receive must leave no entry rows',
      );
      final state = await database.ohacDeliveryDao
          .findTerminalState('tenant-1', 'terminal-1');
      expect(state!.state, stateName);
      expect(state.revision, revision);
      expect(state.candidateSequence, candidateSequence);
    }

    test('writes the epoch, its entries and the RECEIVE_PENDING flip in one '
        'transaction', () async {
      await seedActive();
      final entries = [
        entry(sequence: 2, userId: 'user-a'),
        entry(sequence: 2, userId: 'user-b'),
      ];

      await database.ohacDeliveryDao.receiveCandidateEpoch(
        candidate(),
        entries,
        entries.length,
        digest,
        1,
        '1.0.0+1',
        'backend-1',
        'ohac.staff-policy-epoch.v1',
        'ohac.assertion.v1',
        '2026-01-02T00:00:00.000Z',
      );

      final stored =
          await database.ohacDeliveryDao.findEpoch('tenant-1', 'terminal-1', 2);
      expect(stored, isNotNull);
      expect(stored!.digest, digest);
      expect(
        await database.ohacDeliveryDao.findEntries('tenant-1', 'terminal-1', 2),
        hasLength(2),
      );

      final state = await database.ohacDeliveryDao
          .findTerminalState('tenant-1', 'terminal-1');
      expect(state!.state, 'RECEIVE_PENDING');
      expect(state.candidateSequence, 2);
      expect(state.candidateDigest, digest);
      expect(state.negotiatedPosBuild, '1.0.0+1');
      expect(state.negotiatedBackendBuild, 'backend-1');
      expect(state.negotiatedPolicySchema, 'ohac.staff-policy-epoch.v1');
      expect(state.negotiatedAssertionSchema, 'ohac.assertion.v1');
      expect(state.revision, 2);
      // The prior epoch keeps governing while RECEIVE_PENDING holds.
      expect(state.activeSequence, 1);
      expect(state.activeDigest, priorDigest);
    });

    test('a declared entry count the write does not satisfy rolls the whole '
        'receive back', () async {
      await seedActive();
      final entries = [entry(sequence: 2, userId: 'user-a')];

      await expectLater(
        database.ohacDeliveryDao.receiveCandidateEpoch(
          candidate(),
          entries,
          3, // the caller claims three entries; only one was supplied
          digest,
          1,
          '1.0.0+1',
          'backend-1',
          'ohac.staff-policy-epoch.v1',
          'ohac.assertion.v1',
          '2026-01-02T00:00:00.000Z',
        ),
        throwsA(isA<StateError>()),
      );

      await expectNothingPersisted();
    });

    test('a digest that is not the one the caller verified rolls the whole '
        'receive back', () async {
      await seedActive();
      final entries = [entry(sequence: 2, userId: 'user-a')];

      await expectLater(
        database.ohacDeliveryDao.receiveCandidateEpoch(
          candidate(),
          entries,
          entries.length,
          'sha256:${'e' * 64}', // not the digest the epoch row carries
          1,
          '1.0.0+1',
          'backend-1',
          'ohac.staff-policy-epoch.v1',
          'ohac.assertion.v1',
          '2026-01-02T00:00:00.000Z',
        ),
        throwsA(isA<StateError>()),
      );

      await expectNothingPersisted();
    });

    test('a stale terminal revision rolls the epoch write back with the flip '
        'it cannot apply', () async {
      await seedActive(revision: 1);
      final entries = [entry(sequence: 2, userId: 'user-a')];

      await expectLater(
        database.ohacDeliveryDao.receiveCandidateEpoch(
          candidate(),
          entries,
          entries.length,
          digest,
          99, // the row is at revision 1
          '1.0.0+1',
          'backend-1',
          'ohac.staff-policy-epoch.v1',
          'ohac.assertion.v1',
          '2026-01-02T00:00:00.000Z',
        ),
        throwsA(isA<StateError>()),
      );

      await expectNothingPersisted();
    });

    test('a receive from a terminal that is not ACTIVE writes nothing',
        () async {
      await database.ohacDeliveryDao.insertTerminalState(
        terminalState(
          state: 'RECEIVE_PENDING',
          activeSequence: 1,
          revision: 1,
          candidateSequence: 2,
          candidateDigest: 'sha256:${'f' * 64}',
        ),
      );

      await expectLater(
        database.ohacDeliveryDao.receiveCandidateEpoch(
          candidate(),
          [entry(sequence: 2, userId: 'user-a')],
          1,
          digest,
          1,
          '1.0.0+1',
          'backend-1',
          'ohac.staff-policy-epoch.v1',
          'ohac.assertion.v1',
          '2026-01-02T00:00:00.000Z',
        ),
        throwsA(isA<StateError>()),
      );

      // The pending candidate already on record must be untouched: the guard
      // fires before any write, so the row is exactly as it was seeded.
      await expectNothingPersisted(
        revision: 1,
        stateName: 'RECEIVE_PENDING',
        candidateSequence: 2,
      );
    });

    test('a sequence that is not the next one writes nothing', () async {
      await seedActive();

      await expectLater(
        database.ohacDeliveryDao.receiveCandidateEpoch(
          candidate(sequence: 5),
          [entry(sequence: 5, userId: 'user-a')],
          1,
          digest,
          1,
          '1.0.0+1',
          'backend-1',
          'ohac.staff-policy-epoch.v1',
          'ohac.assertion.v1',
          '2026-01-02T00:00:00.000Z',
        ),
        throwsA(isA<StateError>()),
      );

      await expectNothingPersisted();
    });
  });

  group('submitCandidateAcknowledgement — the submit transaction S', () {
    final digest = 'sha256:${'f' * 64}';

    Future<void> seedPending({int revision = 4}) =>
        database.ohacDeliveryDao.insertTerminalState(
          terminalState(
            state: 'RECEIVE_PENDING',
            activeSequence: 1,
            revision: revision,
            candidateSequence: 2,
            candidateDigest: digest,
          ),
        );

    test('flips to ACK_SUBMITTING, appends one reset fact per advanced '
        'generation, and never carries verifier material', () async {
      await seedPending();
      await database.ohacDeliveryDao.insertEntries([
        entry(sequence: 2, userId: 'user-advance', attemptResetGeneration: '2'),
        entry(sequence: 2, userId: 'user-equal', attemptResetGeneration: '1'),
        entry(sequence: 2, userId: 'user-lower', attemptResetGeneration: '1'),
        entry(sequence: 2, userId: 'user-absent', attemptResetGeneration: '4'),
      ]);
      await database.ohacDeliveryDao.insertAttemptState(
        attemptState(
          userId: 'user-advance',
          resetGeneration: '1',
          lockedUntil: '2026-02-01T00:00:00.000Z',
        ),
      );
      await database.ohacDeliveryDao.insertAttemptState(
        attemptState(userId: 'user-equal', resetGeneration: '1'),
      );
      await database.ohacDeliveryDao.insertAttemptState(
        attemptState(userId: 'user-lower', resetGeneration: '3'),
      );

      await database.ohacDeliveryDao.submitCandidateAcknowledgement(
        'tenant-1',
        'terminal-1',
        4,
        2,
        digest,
        '2026-01-03T00:00:00.000Z',
          OhacOutboxRegistry(),
      );

      final state = await database.ohacDeliveryDao
          .findTerminalState('tenant-1', 'terminal-1');
      expect(state!.state, 'ACK_SUBMITTING');
      expect(state.revision, 5);
      // The flip alone leaves the candidate untouched for the acknowledgement.
      expect(state.candidateSequence, 2);
      expect(state.candidateDigest, digest);
      expect(state.activeSequence, 1);

      final advanced = await database.ohacDeliveryDao.findAttemptState(
        'tenant-1',
        'terminal-1',
        'user-advance',
      );
      expect(advanced!.resetGeneration, '2');
      expect(advanced.failureTimestamps, '[]');
      expect(advanced.lockedUntil, isNull);
      expect(advanced.revision, 2);

      for (final userId in ['user-equal', 'user-lower']) {
        final untouched =
            await database.ohacDeliveryDao.findAttemptState(
              'tenant-1',
              'terminal-1',
              userId,
            );
        expect(untouched!.revision, 1, reason: '$userId must not be reset');
        expect(
          untouched.failureTimestamps,
          '["2026-01-01T00:00:00.000Z"]',
        );
      }

      final events = await database.ohacDeliveryDao
          .findEventsForTerminal('tenant-1', 'terminal-1');
      expect(events, hasLength(1), reason: 'only the advanced user is a fact');
      final fact = events.single;
      expect(fact.eventType, 'ADMIN_ATTEMPT_RESET_APPLIED');
      expect(fact.sequence, 2, reason: 'the fact belongs to the candidate');
      // Pin the payload SHAPE, not just its contents: a fact that later grew
      // a verifier or a PIN would otherwise satisfy every assertion below,
      // because the three expected values would still be present alongside it.
      expect(
        (jsonDecode(fact.payload) as Map<String, dynamic>).keys.toList(),
        ['userId', 'fromGeneration', 'toGeneration'],
        reason: 'the local reset fact carries the user and the generation move '
            'and nothing else (design §12 observability: no PIN, verifier, '
            'token secret or assertion body)',
      );
      expect(fact.payload, contains('user-advance'));
      expect(fact.payload, contains('"fromGeneration":"1"'));
      expect(fact.payload, contains('"toGeneration":"2"'));
      expect(fact.payload, isNot(contains(r'$2b$')));
      expect(fact.payload, isNot(contains('verifier')));
    });

    test('a user with no attempt row is skipped and the flip still commits',
        () async {
      await seedPending();
      await database.ohacDeliveryDao.insertEntries([
        entry(sequence: 2, userId: 'user-never-seen', attemptResetGeneration: '9'),
      ]);

      await database.ohacDeliveryDao.submitCandidateAcknowledgement(
        'tenant-1',
        'terminal-1',
        4,
        2,
        digest,
        '2026-01-03T00:00:00.000Z',
          OhacOutboxRegistry(),
      );

      final state = await database.ohacDeliveryDao
          .findTerminalState('tenant-1', 'terminal-1');
      expect(state!.state, 'ACK_SUBMITTING');
      expect(
        await database.ohacDeliveryDao.findEventsForTerminal('tenant-1', 'terminal-1'),
        isEmpty,
        reason: 'a user with no attempt row has nothing to reset',
      );
    });

    test('a stored generation that is not a decimal string fails closed rather '
        'than silently dropping an administrative reset', () async {
      await seedPending();
      await database.ohacDeliveryDao.insertEntries([
        entry(sequence: 2, userId: 'user-bad', attemptResetGeneration: '2'),
      ]);
      await database.ohacDeliveryDao.insertAttemptState(
        attemptState(userId: 'user-bad', resetGeneration: 'gen-legacy'),
      );

      await expectLater(
        database.ohacDeliveryDao.submitCandidateAcknowledgement(
          'tenant-1',
          'terminal-1',
          4,
          2,
          digest,
          '2026-01-03T00:00:00.000Z',
          OhacOutboxRegistry(),
        ),
        throwsA(isA<StateError>()),
      );

      final state = await database.ohacDeliveryDao
          .findTerminalState('tenant-1', 'terminal-1');
      expect(state!.state, 'RECEIVE_PENDING', reason: 'the flip rolled back');
      expect(state.revision, 4);
      expect(
        await database.ohacDeliveryDao.findEventsForTerminal('tenant-1', 'terminal-1'),
        isEmpty,
      );
    });

    test('a second submit for the same candidate is a no-op, not a second '
        'flip and not a second fact', () async {
      await seedPending();
      await database.ohacDeliveryDao.insertEntries([
        entry(sequence: 2, userId: 'user-advance', attemptResetGeneration: '2'),
      ]);
      await database.ohacDeliveryDao.insertAttemptState(
        attemptState(userId: 'user-advance', resetGeneration: '1'),
      );

      Future<void> submit() => database.ohacDeliveryDao
          .submitCandidateAcknowledgement(
            'tenant-1',
            'terminal-1',
            4,
            2,
            digest,
            '2026-01-03T00:00:00.000Z',
              OhacOutboxRegistry(),
          );

      await submit();
      await submit();

      final state = await database.ohacDeliveryDao
          .findTerminalState('tenant-1', 'terminal-1');
      expect(state!.state, 'ACK_SUBMITTING');
      expect(state.revision, 5, reason: 'the replay must not bump revision');
      expect(
        await database.ohacDeliveryDao.findEventsForTerminal('tenant-1', 'terminal-1'),
        hasLength(1),
        reason: 'the replay must not append a second reset fact',
      );
      final advanced = await database.ohacDeliveryDao.findAttemptState(
        'tenant-1',
        'terminal-1',
        'user-advance',
      );
      expect(advanced!.revision, 2, reason: 'the replay must not re-reset');
    });

    test('a stale revision throws and changes nothing', () async {
      await seedPending(revision: 4);

      await expectLater(
        database.ohacDeliveryDao.submitCandidateAcknowledgement(
          'tenant-1',
          'terminal-1',
          7, // the row is at revision 4
          2,
          digest,
          '2026-01-03T00:00:00.000Z',
          OhacOutboxRegistry(),
        ),
        throwsA(isA<StateError>()),
      );

      final state = await database.ohacDeliveryDao
          .findTerminalState('tenant-1', 'terminal-1');
      expect(state!.state, 'RECEIVE_PENDING');
      expect(state.revision, 4);
    });

    test('a candidate pair that is not the one on record is refused', () async {
      await seedPending(revision: 4);

      await expectLater(
        database.ohacDeliveryDao.submitCandidateAcknowledgement(
          'tenant-1',
          'terminal-1',
          4,
          2,
          'sha256:${'0' * 64}', // not the candidate digest on record
          '2026-01-03T00:00:00.000Z',
          OhacOutboxRegistry(),
        ),
        throwsA(isA<StateError>()),
      );

      final state = await database.ohacDeliveryDao
          .findTerminalState('tenant-1', 'terminal-1');
      expect(state!.state, 'RECEIVE_PENDING');
      expect(state.revision, 4);
    });
  });


  group('submitCandidateAcknowledgement — the §5.1 drain gate in S (B3, '
      'design §5.1, §11.5 decision 31)', () {
    final digest = 'sha256:${'f' * 64}';

    // Fresh registry + registrant per test: registrations must never leak
    // between tests. The named test registrants are decision 31's
    // exercisers: no production outbox emits ohac.assertion.v1 yet.
    (OhacOutboxRegistry, TestDrainOutbox) freshGate(String outboxId) {
      final registry = OhacOutboxRegistry();
      final outbox = TestDrainOutbox(outboxId);
      registry.register(outbox);
      return (registry, outbox);
    }

    Future<void> seedPending({
      int revision = 4,
      String? ackDeferralReason,
      int? ackDeferralCount,
    }) =>
        database.ohacDeliveryDao.insertTerminalState(
          terminalState(
            state: 'RECEIVE_PENDING',
            activeSequence: 1,
            revision: revision,
            candidateSequence: 2,
            candidateDigest: digest,
            ackDeferralReason: ackDeferralReason,
            ackDeferralCount: ackDeferralCount,
          ),
        );

    test('a registered blocker at ≤ candidate-1 defers: no flip, reason and '
        'count set, deferral event appended atomically', () async {
      await seedPending();
      final (registry, blocker) = freshGate('credit-note-outbox');
      blocker.lowestUnconsumed = 1;

      await database.ohacDeliveryDao.submitCandidateAcknowledgement(
        'tenant-1',
        'terminal-1',
        4,
        2,
        digest,
        '2026-01-03T00:00:00.000Z',
        registry,
      );

      // No flip: the terminal stays RECEIVE_PENDING with the old epoch
      // governing (§5.1 line 180) — authorization is NOT frozen.
      final state = await database.ohacDeliveryDao
          .findTerminalState('tenant-1', 'terminal-1');
      expect(state!.state, 'RECEIVE_PENDING');
      expect(state.ackDeferralReason, 'OHAC_ACK_DEFERRED_OUTBOX');
      expect(state.ackDeferralCount, 1,
          reason: 'the count starts at 1 for this candidate');
      // The deferral itself is one CAS: revision 4 -> 5, nothing else moved.
      expect(state.revision, 5);
      expect(state.candidateSequence, 2);
      expect(state.candidateDigest, digest);

      final events = await database.ohacDeliveryDao
          .findEventsForTerminal('tenant-1', 'terminal-1');
      expect(events, hasLength(1),
          reason: 'the deferral event is appended in the same transaction');
      final event = events.single;
      expect(event.eventType, 'OHAC_ACK_DEFERRED_OUTBOX');
      expect(event.sequence, 2);
      // Pin the payload SHAPE by key list (repo convention), never by
      // substring: a later payload that grew a verifier or an assertion body
      // would still contain the values below.
      expect(
        (jsonDecode(event.payload) as Map<String, dynamic>).keys.toList(),
        ['candidateSequence', 'blockingOutboxIds', 'retryCount',
            'retryBoundReached'],
        reason: 'the deferral fact carries the candidate, the blockers, the '
            'count and the bound flag and nothing else (design §12: no PIN, '
            'verifier, token secret or assertion body)',
      );
      final payload = jsonDecode(event.payload) as Map<String, dynamic>;
      expect(payload['candidateSequence'], 2);
      expect(payload['blockingOutboxIds'], ['credit-note-outbox']);
      expect(payload['retryCount'], 1);
      expect(payload['retryBoundReached'], isFalse);
    });

    test('a deferral increments the count for the SAME candidate', () async {
      await seedPending(ackDeferralReason: 'OHAC_ACK_DEFERRED_OUTBOX',
          ackDeferralCount: 2);
      final (registry, blocker) = freshGate('credit-note-outbox');
      blocker.lowestUnconsumed = 1;

      await database.ohacDeliveryDao.submitCandidateAcknowledgement(
        'tenant-1',
        'terminal-1',
        4,
        2,
        digest,
        '2026-01-03T00:00:00.000Z',
        registry,
      );

      final state = await database.ohacDeliveryDao
          .findTerminalState('tenant-1', 'terminal-1');
      expect(state!.state, 'RECEIVE_PENDING');
      expect(state.ackDeferralCount, 3);
    });

    test('reaching the retry bound marks the deferral event '
        'retryBoundReached=true; below it stays false', () async {
      // Count 4 -> 5 == the design placeholder bound.
      await seedPending(ackDeferralReason: 'OHAC_ACK_DEFERRED_OUTBOX',
          ackDeferralCount: 4);
      final (registry, blocker) = freshGate('credit-note-outbox');
      blocker.lowestUnconsumed = 1;

      await database.ohacDeliveryDao.submitCandidateAcknowledgement(
        'tenant-1',
        'terminal-1',
        4,
        2,
        digest,
        '2026-01-03T00:00:00.000Z',
        registry,
      );

      final events = await database.ohacDeliveryDao
          .findEventsForTerminal('tenant-1', 'terminal-1');
      final payload =
          jsonDecode(events.single.payload) as Map<String, dynamic>;
      expect(payload['retryCount'], 5);
      expect(payload['retryBoundReached'], isTrue,
          reason: 'the count reached OhacOutboxRegistry.ohacAckDeferredRetryBound; '
              'the operator-visible quarantine-review log lives in the '
              'sync caller (developer.log has no in-process capture)');
    });

    test('a drained registry passes: the flip commits, the reason clears, '
        'the count persists as history', () async {
      await seedPending(
          ackDeferralReason: 'OHAC_ACK_DEFERRED_OUTBOX', ackDeferralCount: 2);
      // An empty registry -> passed: the same path a drained outbox
      // exercises.
      final registry = OhacOutboxRegistry();

      await database.ohacDeliveryDao.submitCandidateAcknowledgement(
        'tenant-1',
        'terminal-1',
        4,
        2,
        digest,
        '2026-01-03T00:00:00.000Z',
        registry,
      );

      final state = await database.ohacDeliveryDao
          .findTerminalState('tenant-1', 'terminal-1');
      expect(state!.state, 'ACK_SUBMITTING');
      expect(state.ackDeferralReason, isNull,
          reason: 'a successful flip clears the deferral reason');
      expect(state.ackDeferralCount, 2,
          reason: 'the count persists as history after the flip');
      expect(
        await database.ohacDeliveryDao
            .findEventsForTerminal('tenant-1', 'terminal-1'),
        isEmpty,
        reason: 'a pass appends no deferral event',
      );
    });

    test('a quarantined-only outbox is excluded from the gate: the flip '
        'proceeds exactly as a pass (§5.1 line 182)', () async {
      await seedPending();
      final (registry, quarantinedOnly) = freshGate('quarantined-outbox');
      quarantinedOnly.lowestUnconsumed = null;
      quarantinedOnly.lowestQuarantined = 1;

      await database.ohacDeliveryDao.submitCandidateAcknowledgement(
        'tenant-1',
        'terminal-1',
        4,
        2,
        digest,
        '2026-01-03T00:00:00.000Z',
        registry,
      );

      final state = await database.ohacDeliveryDao
          .findTerminalState('tenant-1', 'terminal-1');
      expect(state!.state, 'ACK_SUBMITTING');
      expect(state.ackDeferralReason, isNull);
      expect(
        await database.ohacDeliveryDao
            .findEventsForTerminal('tenant-1', 'terminal-1'),
        isEmpty,
      );
    });

    test('receiving a NEW candidate resets the deferral reason and count '
        '(the reset lives in R\'s receiveEpoch CAS)', () async {
      // A terminal whose previous candidate was deferred (and whose ack
      // eventually succeeded) is ACTIVE again, carrying the deferral
      // history. The next candidate's receive must start with a clean
      // deferral observation.
      await database.ohacDeliveryDao.insertTerminalState(
        terminalState(
          state: 'ACTIVE',
          activeSequence: 1,
          revision: 3,
          ackDeferralReason: 'OHAC_ACK_DEFERRED_OUTBOX',
          ackDeferralCount: 4,
        ),
      );

      await database.ohacDeliveryDao.receiveCandidateEpoch(
        epoch(sequence: 2),
        [entry(sequence: 2)],
        1,
        'sha256:${'a' * 64}',
        3,
        '',
        'backend-1',
        'ohac.staff-policy-epoch.v1',
        'ohac.assertion.v1',
        '2026-01-03T00:00:00.000Z',
      );

      final state = await database.ohacDeliveryDao
          .findTerminalState('tenant-1', 'terminal-1');
      expect(state!.state, 'RECEIVE_PENDING');
      expect(state.candidateSequence, 2);
      expect(state.ackDeferralReason, isNull,
          reason: 'a new candidate starts with no deferral reason');
      expect(state.ackDeferralCount, isNull,
          reason: 'the count belongs to one candidate\'s lifetime');
    });

    test('a losing revision CAS on the deferral write throws and leaves '
        'every column and the event log untouched', () async {
      await seedPending(revision: 4);
      final (registry, blocker) = freshGate('credit-note-outbox');
      blocker.lowestUnconsumed = 1;

      await expectLater(
        database.ohacDeliveryDao.submitCandidateAcknowledgement(
          'tenant-1',
          'terminal-1',
          7, // the row is at revision 4
          2,
          digest,
          '2026-01-03T00:00:00.000Z',
          registry,
        ),
        throwsA(isA<StateError>()),
      );

      final state = await database.ohacDeliveryDao
          .findTerminalState('tenant-1', 'terminal-1');
      expect(state!.state, 'RECEIVE_PENDING');
      expect(state.revision, 4);
      expect(state.ackDeferralReason, isNull);
      expect(state.ackDeferralCount, isNull);
      expect(
        await database.ohacDeliveryDao
            .findEventsForTerminal('tenant-1', 'terminal-1'),
        isEmpty,
      );
    });
  });

  group('confirmAcknowledgementWithReceipt — the confirmation transaction C',
      () {
    final digest = 'sha256:${'f' * 64}';
    const receiptId = '7e6c1c2a-0f4e-4f7a-9c5a-1b2c3d4e5f60';

    /// Seeds the exact post-submit state transaction C operates on:
    /// `ACK_SUBMITTING` with the candidate pair on record and the previous
    /// epoch still governing (§5 step 3's committed flip).
    Future<void> seedSubmitting({int revision = 7}) =>
        database.ohacDeliveryDao.insertTerminalState(
          terminalState(
            state: 'ACK_SUBMITTING',
            activeSequence: 1,
            activeDigest: 'sha256:${'a' * 64}',
            revision: revision,
            candidateSequence: 2,
            candidateDigest: digest,
            serverFloorSequence: 1,
            serverFloorDigest: 'sha256:${'a' * 64}',
          ),
        );

    test('promotes the candidate, sets the floor pair, the receipt id, and '
        'bumps the revision in one atomic write', () async {
      await seedSubmitting();

      await database.ohacDeliveryDao.confirmAcknowledgementWithReceipt(
        'tenant-1',
        'terminal-1',
        7,
        2,
        digest,
        receiptId,
        2,
        digest,
        '2026-01-04T00:00:00.000Z',
      );

      final state = await database.ohacDeliveryDao
          .findTerminalState('tenant-1', 'terminal-1');
      expect(state!.state, 'ACTIVE');
      // The candidate is promoted to the governing pair...
      expect(state.activeSequence, 2);
      expect(state.activeDigest, digest);
      // ...and cleared back to its sentinels (§4.2).
      expect(state.candidateSequence, 0);
      expect(state.candidateDigest, '');
      // The server-confirmed floor and the receipt of record (§5 step 4).
      expect(state.serverFloorSequence, 2);
      expect(state.serverFloorDigest, digest);
      expect(state.ackReceiptId, receiptId);
      expect(state.revision, 8);
      expect(state.updatedAt, '2026-01-04T00:00:00.000Z');
    });

    test('appends exactly one local lifecycle fact per confirmed ack, and '
        'the payload is pinned to the receipt move only', () async {
      await seedSubmitting();

      await database.ohacDeliveryDao.confirmAcknowledgementWithReceipt(
        'tenant-1',
        'terminal-1',
        7,
        2,
        digest,
        receiptId,
        2,
        digest,
        '2026-01-04T00:00:00.000Z',
      );

      final events = await database.ohacDeliveryDao
          .findEventsForTerminal('tenant-1', 'terminal-1');
      expect(events, hasLength(1));
      final fact = events.single;
      expect(fact.eventType, 'OHAC_ACK_CONFIRMED');
      expect(fact.sequence, 2, reason: 'the fact belongs to the new epoch');
      // Pin the payload SHAPE: the fact carries the receipt identity and
      // the floor move and nothing else (§12 observability).
      expect(
        (jsonDecode(fact.payload) as Map<String, dynamic>).keys.toList(),
        ['receiptId', 'fromFloorSequence', 'toFloorSequence'],
      );
      expect(fact.payload, contains(receiptId));
      expect(fact.payload, contains('"toFloorSequence":2'));
    });

    test('a losing revision CAS (seeded at revision 7) leaves EVERY column '
        'untouched', () async {
      await seedSubmitting();

      await expectLater(
        database.ohacDeliveryDao.confirmAcknowledgementWithReceipt(
          'tenant-1',
          'terminal-1',
          6, // the row is at revision 7
          2,
          digest,
          receiptId,
          2,
          digest,
          '2026-01-04T00:00:00.000Z',
        ),
        throwsA(isA<StateError>()),
      );

      final state = await database.ohacDeliveryDao
          .findTerminalState('tenant-1', 'terminal-1');
      expect(state!.state, 'ACK_SUBMITTING');
      expect(state.activeSequence, 1);
      expect(state.activeDigest, 'sha256:${'a' * 64}');
      expect(state.candidateSequence, 2);
      expect(state.candidateDigest, digest);
      expect(state.serverFloorSequence, 1);
      expect(state.serverFloorDigest, 'sha256:${'a' * 64}');
      expect(state.ackReceiptId, isNull);
      expect(state.revision, 7);
      expect(
        await database.ohacDeliveryDao
            .findEventsForTerminal('tenant-1', 'terminal-1'),
        isEmpty,
      );
    });

    test('a terminal that is not ACK_SUBMITTING is refused and untouched',
        () async {
      await database.ohacDeliveryDao.insertTerminalState(
        terminalState(
          state: 'RECEIVE_PENDING',
          activeSequence: 1,
          revision: 7,
          candidateSequence: 2,
          candidateDigest: digest,
        ),
      );

      await expectLater(
        database.ohacDeliveryDao.confirmAcknowledgementWithReceipt(
          'tenant-1',
          'terminal-1',
          7,
          2,
          digest,
          receiptId,
          2,
          digest,
          '2026-01-04T00:00:00.000Z',
        ),
        throwsA(isA<StateError>()),
      );

      final state = await database.ohacDeliveryDao
          .findTerminalState('tenant-1', 'terminal-1');
      expect(state!.state, 'RECEIVE_PENDING');
      expect(state.activeSequence, 1);
      expect(state.candidateSequence, 2);
      expect(state.ackReceiptId, isNull);
      expect(state.revision, 7);
    });

    test('a candidate pair that is not the server-confirmed claim is refused '
        'and untouched', () async {
      await seedSubmitting();

      await expectLater(
        database.ohacDeliveryDao.confirmAcknowledgementWithReceipt(
          'tenant-1',
          'terminal-1',
          7,
          2,
          'sha256:${'0' * 64}', // not the candidate digest on record
          receiptId,
          2,
          'sha256:${'0' * 64}',
          '2026-01-04T00:00:00.000Z',
        ),
        throwsA(isA<StateError>()),
      );

      final state = await database.ohacDeliveryDao
          .findTerminalState('tenant-1', 'terminal-1');
      expect(state!.state, 'ACK_SUBMITTING');
      expect(state.candidateDigest, digest);
      expect(state.ackReceiptId, isNull);
      expect(state.revision, 7);
    });

    test('a missing terminal state is refused', () async {
      await expectLater(
        database.ohacDeliveryDao.confirmAcknowledgementWithReceipt(
          'tenant-1',
          'terminal-1',
          0,
          2,
          digest,
          receiptId,
          2,
          digest,
          '2026-01-04T00:00:00.000Z',
        ),
        throwsA(isA<StateError>()),
      );
    });
  });
}
