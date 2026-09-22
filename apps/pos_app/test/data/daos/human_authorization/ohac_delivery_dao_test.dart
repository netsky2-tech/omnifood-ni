import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/database/migrations.dart';
import 'package:pos_app/data/models/human_authorization/ohac_delivery_entities.dart';

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
        attemptResetGeneration: 'gen-$sequence-$userId',
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
  }) =>
      OhacAttemptStateEntity(
        tenantId: tenantId,
        terminalId: terminalId,
        userId: userId,
        failureTimestamps: '["2026-01-01T00:00:00.000Z"]',
        lockedUntil: lockedUntil,
        resetGeneration: 'gen-1',
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
}
