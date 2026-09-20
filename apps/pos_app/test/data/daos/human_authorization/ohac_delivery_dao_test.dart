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
    int revision = 1,
  }) =>
      OhacTerminalStateEntity(
        tenantId: tenantId,
        terminalId: terminalId,
        state: state,
        activeSequence: activeSequence,
        activeDigest: 'sha256:${'c' * 64}',
        revision: revision,
        updatedAt: '2026-01-01T00:00:00.000Z',
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
      await database.ohacPolicyEpochDao.insertEpoch(inserted);

      final read = await database.ohacPolicyEpochDao.findEpoch(
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
      await database.ohacPolicyEpochDao.insertEpoch(epoch(sequence: 1));

      final read = await database.ohacPolicyEpochDao.findEpoch(
        'tenant-1',
        'terminal-1',
        99,
      );
      expect(read, isNull);
    });

    test('findNewestEpoch picks the highest sequence, not the newest insert',
        () async {
      expect(await database.database.query('human_auth_policy_epochs'), isEmpty);

      await database.ohacPolicyEpochDao.insertEpoch(epoch(sequence: 3));
      await database.ohacPolicyEpochDao.insertEpoch(epoch(sequence: 1));
      await database.ohacPolicyEpochDao.insertEpoch(epoch(sequence: 7));

      final newest = await database.ohacPolicyEpochDao.findNewestEpoch(
        'tenant-1',
        'terminal-1',
      );
      expect(newest, isNotNull);
      expect(newest!.sequence, 7);
    });

    test('findEpochsAfter returns ascending and excludes the boundary',
        () async {
      await database.ohacPolicyEpochDao.insertEpoch(epoch(sequence: 1));
      await database.ohacPolicyEpochDao.insertEpoch(epoch(sequence: 2));
      await database.ohacPolicyEpochDao.insertEpoch(epoch(sequence: 3));

      final after = await database.ohacPolicyEpochDao.findEpochsAfter(
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
      await database.ohacPolicyEntryDao.insertEntries([inserted]);

      final read = await database.ohacPolicyEntryDao.findEntryForUser(
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
      await database.ohacPolicyEntryDao.insertEntries([
        entry(userId: 'zoe'),
        entry(userId: 'ada'),
        entry(userId: 'mia'),
      ]);

      final entries = await database.ohacPolicyEntryDao.findEntries(
        'tenant-1',
        'terminal-1',
        1,
      );
      expect(entries.map((e) => e.userId).toList(), ['ada', 'mia', 'zoe']);
    });

    test('findEntryForUser finds the right one and null for an unknown user',
        () async {
      await database.ohacPolicyEntryDao.insertEntries([
        entry(sequence: 1, userId: 'user-1'),
        entry(sequence: 2, userId: 'user-2'),
      ]);

      final found = await database.ohacPolicyEntryDao.findEntryForUser(
        'tenant-1',
        'terminal-1',
        2,
        'user-2',
      );
      expect(found, isNotNull);
      expect(found!.sequence, 2);
      expect(found.userId, 'user-2');

      final unknown = await database.ohacPolicyEntryDao.findEntryForUser(
        'tenant-1',
        'terminal-1',
        2,
        'nobody',
      );
      expect(unknown, isNull);
    });
  });

  group('OhacTerminalStateDao', () {
    test('round trip preserves every field', () async {
      expect(
        await database.database.query('human_auth_terminal_state'),
        isEmpty,
      );

      final inserted = terminalState(
        state: 'RECEIVE_PENDING',
        activeSequence: 4,
        revision: 2,
      );
      await database.ohacTerminalStateDao.insertTerminalState(inserted);

      final read = await database.ohacTerminalStateDao.findTerminalState(
        'tenant-1',
        'terminal-1',
      );
      expect(read, isNotNull);
      expect(read!.tenantId, inserted.tenantId);
      expect(read.terminalId, inserted.terminalId);
      expect(read.state, inserted.state);
      expect(read.activeSequence, inserted.activeSequence);
      expect(read.activeDigest, inserted.activeDigest);
      expect(read.revision, inserted.revision);
      expect(read.updatedAt, inserted.updatedAt);
    });

    test('insertTerminalState twice for the same terminal fails instead of '
        'overwriting', () async {
      await database.ohacTerminalStateDao
          .insertTerminalState(terminalState(state: 'ACTIVE'));

      await expectLater(
        database.ohacTerminalStateDao
            .insertTerminalState(terminalState(state: 'ACK_SUBMITTING')),
        throwsA(isA<Exception>()),
      );

      final stored = await database.ohacTerminalStateDao.findTerminalState(
        'tenant-1',
        'terminal-1',
      );
      expect(stored!.state, 'ACTIVE',
          reason: 'a failed insert must not overwrite the protected state');
    });

    test('the revision compare-and-set is real', () async {
      await database.ohacTerminalStateDao
          .insertTerminalState(terminalState(revision: 5));

      // A stale expectation loses the race and changes nothing. The seeded
      // revision is deliberately not 1, so a WHERE clause that compared the
      // revision against a constant instead of against the caller's
      // expectation would fail here rather than pass by coincidence.
      final stale = await database.ohacTerminalStateDao
          .updateTerminalStateIfRevisionMatches(
        'tenant-1',
        'terminal-1',
        5 + 100,
        'ACK_SUBMITTING',
        2,
        'sha256:${'d' * 64}',
        '2026-01-02T00:00:00.000Z',
      );
      expect(stale, 0);
      final afterStale = await database.ohacTerminalStateDao.findTerminalState(
        'tenant-1',
        'terminal-1',
      );
      expect(afterStale!.state, 'ACTIVE');
      expect(afterStale.revision, 5);

      // The current expectation wins exactly once and bumps the revision.
      final won = await database.ohacTerminalStateDao
          .updateTerminalStateIfRevisionMatches(
        'tenant-1',
        'terminal-1',
        5,
        'ACK_SUBMITTING',
        2,
        'sha256:${'d' * 64}',
        '2026-01-02T00:00:00.000Z',
      );
      expect(won, 1);
      final afterWin = await database.ohacTerminalStateDao.findTerminalState(
        'tenant-1',
        'terminal-1',
      );
      expect(afterWin!.state, 'ACK_SUBMITTING');
      expect(afterWin.activeSequence, 2);
      expect(afterWin.activeDigest, 'sha256:${'d' * 64}');
      expect(afterWin.updatedAt, '2026-01-02T00:00:00.000Z');
      expect(afterWin.revision, 6);

      // The revision the first win consumed can never win again.
      final replayed = await database.ohacTerminalStateDao
          .updateTerminalStateIfRevisionMatches(
        'tenant-1',
        'terminal-1',
        5,
        'ACK_CONFIRMED',
        3,
        'sha256:${'e' * 64}',
        '2026-01-03T00:00:00.000Z',
      );
      expect(replayed, 0);
      final afterReplay = await database.ohacTerminalStateDao
          .findTerminalState('tenant-1', 'terminal-1');
      expect(afterReplay!.state, 'ACK_SUBMITTING');
      expect(afterReplay.revision, 6);
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
      await database.ohacAttemptStateDao.insertAttemptState(inserted);

      final read = await database.ohacAttemptStateDao.findAttemptState(
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
      await database.ohacAttemptStateDao.insertAttemptState(inserted);

      final read = await database.ohacAttemptStateDao.findAttemptState(
        'tenant-1',
        'terminal-1',
        'user-2',
      );
      expect(read!.lockedUntil, '2026-01-01T01:00:00.000Z');
    });

    test('the revision compare-and-set is real, including lockedUntil',
        () async {
      await database.ohacAttemptStateDao
          .insertAttemptState(attemptState(revision: 5));

      // A stale expectation loses the race and changes nothing. As above, the
      // seeded revision is deliberately not 1 so a hardcoded comparison could
      // not pass by coincidence.
      final stale = await database.ohacAttemptStateDao
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
      final afterStale = await database.ohacAttemptStateDao.findAttemptState(
        'tenant-1',
        'terminal-1',
        'user-1',
      );
      expect(afterStale!.failureTimestamps, '["2026-01-01T00:00:00.000Z"]');
      expect(afterStale.revision, 5);

      // The current expectation wins exactly once, clears the lock and bumps
      // the revision.
      final won = await database.ohacAttemptStateDao
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
      final afterWin = await database.ohacAttemptStateDao.findAttemptState(
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
      final replayed = await database.ohacAttemptStateDao
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
      final afterReplay = await database.ohacAttemptStateDao.findAttemptState(
        'tenant-1',
        'terminal-1',
        'user-1',
      );
      expect(afterReplay!.resetGeneration, 'gen-2');
      expect(afterReplay.revision, 6);
    });

    test('the clear-the-lock sentinel works from a real instant, and a real '
        'instant can be stored again', () async {
      await database.ohacAttemptStateDao.insertAttemptState(
        attemptState(lockedUntil: '2026-01-01T01:00:00.000Z'),
      );

      Future<String?> storedLock() async =>
          (await database.ohacAttemptStateDao.findAttemptState(
            'tenant-1',
            'terminal-1',
            'user-1',
          ))!
              .lockedUntil;

      // The row really starts locked, so the transition below is a change and
      // not a row that was already NULL — which is what the other CAS test
      // cannot distinguish.
      expect(await storedLock(), '2026-01-01T01:00:00.000Z');

      final cleared = await database.ohacAttemptStateDao
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

      final relocked = await database.ohacAttemptStateDao
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
      await database.ohacLocalEventDao.appendEvent(inserted);

      final events = await database.ohacLocalEventDao.findEventsForTerminal(
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
      await database.ohacLocalEventDao.appendEvent(
        event(id: 'e-3', createdAt: '2026-01-03T00:00:00.000Z'),
      );
      await database.ohacLocalEventDao.appendEvent(
        event(id: 'e-1', createdAt: '2026-01-01T00:00:00.000Z'),
      );
      await database.ohacLocalEventDao.appendEvent(
        event(id: 'e-2', createdAt: '2026-01-02T00:00:00.000Z'),
      );
      await database.ohacLocalEventDao.appendEvent(
        event(id: 'other-1', terminalId: 'terminal-2',
            createdAt: '2026-01-01T00:00:00.000Z'),
      );

      final events = await database.ohacLocalEventDao.findEventsForTerminal(
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
      await database.ohacLocalEventDao
          .appendEvent(event(id: 'e-b', createdAt: sharedInstant));
      await database.ohacLocalEventDao
          .appendEvent(event(id: 'e-a', createdAt: sharedInstant));

      final events = await database.ohacLocalEventDao.findEventsForTerminal(
        'tenant-1',
        'terminal-1',
      );
      expect(events.map((e) => e.id).toList(), ['e-a', 'e-b']);
    });
  });

  group('append-only refusal at the DAO boundary', () {
    test('a direct update against each append-only table is refused',
        () async {
      await database.ohacPolicyEpochDao.insertEpoch(epoch());
      await database.ohacPolicyEntryDao.insertEntries([entry()]);
      await database.ohacLocalEventDao.appendEvent(event());

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
      await database.ohacPolicyEpochDao.insertEpoch(epoch());
      await database.ohacPolicyEntryDao.insertEntries([entry()]);
      await database.ohacLocalEventDao.appendEvent(event());

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
      await database.ohacTerminalStateDao
          .insertTerminalState(terminalState(revision: 1));
      final updated = await database.ohacTerminalStateDao
          .updateTerminalStateIfRevisionMatches(
        'tenant-1',
        'terminal-1',
        1,
        'ACK_CONFIRMED',
        1,
        'sha256:${'c' * 64}',
        '2026-01-02T00:00:00.000Z',
      );
      expect(updated, 1);

      await database.ohacAttemptStateDao
          .insertAttemptState(attemptState(revision: 1));
      final attemptUpdated = await database.ohacAttemptStateDao
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
        (await database.ohacTerminalStateDao.findTerminalState(
          'tenant-1',
          'terminal-1',
        ))!
            .state,
        'ACK_CONFIRMED',
      );
      expect(
        (await database.ohacAttemptStateDao.findAttemptState(
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
