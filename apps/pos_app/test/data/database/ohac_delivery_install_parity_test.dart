import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/database/migrations.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

/// Install parity for the OHAC local delivery persistence (design §4.2, §5, §6).
///
/// Migrations only run in `onUpgrade`. On a fresh install Floor runs `onCreate`,
/// which builds the five `human_auth_%` tables from the generated entity DDL and
/// then calls the registered callback. This test opens the database the way
/// `main.dart` does — in-memory builder, `allMigrations` attached, callback
/// registered — and asserts the fresh install carries the same indexes and
/// append-only triggers the migration installs, so a fresh install cannot drift
/// from an upgraded one.
///
/// Passing `allMigrations` is deliberate: it proves the fresh path does not
/// secretly depend on the migration.
void main() {
  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  Future<AppDatabase> buildFreshDatabase() async {
    final database = await $FloorAppDatabase
        .inMemoryDatabaseBuilder()
        .addMigrations(allMigrations)
        .addCallback(inventoryMovementAppendOnlyCallback)
        .build();
    // Closed in a tear-down, never as the last statement of a test. sqflite
    // caches an opened in-memory database by its `:memory:` path, so a close
    // skipped by a failed assertion would leave that database cached and the
    // next test would reuse it without running `onCreate` or the callback,
    // observing a schema an earlier test created instead of its own.
    addTearDown(database.close);
    return database;
  }

  Future<List<String>> columnNames(DatabaseExecutor db, String table) async {
    final rows = await db.rawQuery('PRAGMA table_info($table)');
    return rows.map((row) => row['name'] as String).toList();
  }

  /// The properties a parity claim actually depends on, one entry per column.
  ///
  /// Comparing names alone would pass while the two install paths disagreed on
  /// a declared type, on whether the column allows nulls, or on a default —
  /// which is the parity this file exists to hold, so it is asserted rather
  /// than assumed.
  Future<Map<String, String>> columnShapes(
    DatabaseExecutor db,
    String table,
  ) async {
    final rows = await db.rawQuery('PRAGMA table_info($table)');
    return {
      for (final row in rows)
        row['name'] as String:
            '${row['type']} notnull=${row['notnull']} default=${row['dflt_value']}',
    };
  }

  test('a fresh install creates the five OHAC delivery tables', () async {
    final db = await buildFreshDatabase();

    final tables = await db.database.rawQuery(
      "SELECT name FROM sqlite_master WHERE type = 'table' "
      "AND name LIKE 'human_auth_%' ORDER BY name",
    );
    expect(
      tables.map((row) => row['name'] as String).toList(),
      [
        'human_auth_attempt_state',
        'human_auth_local_events',
        'human_auth_policy_entries',
        'human_auth_policy_epochs',
        'human_auth_terminal_state',
      ],
    );

    // A fresh install starts empty, and asserting it turns a leaked `:memory:`
    // database from a silent pass into a loud failure: if the builder handed
    // back a database an earlier test had already written to, this fails.
    for (final table in [
      'human_auth_policy_epochs',
      'human_auth_policy_entries',
      'human_auth_terminal_state',
      'human_auth_attempt_state',
      'human_auth_local_events',
    ]) {
      expect(await db.database.query(table), isEmpty, reason: table);
    }
  });

  test('a fresh install carries the terminal-state extension columns',
      () async {
    final db = await buildFreshDatabase();

    // The same column set the migration adds on the upgrade path: the
    // candidate pair, the server floor pair, the four negotiated facts, the
    // integrity classification, and the terminal-local authorization
    // sequence (design §4.2).
    expect(await columnNames(db.database, 'human_auth_terminal_state'), [
      'tenant_id',
      'terminal_id',
      'state',
      'active_sequence',
      'active_digest',
      'candidate_sequence',
      'candidate_digest',
      'server_floor_sequence',
      'server_floor_digest',
      'negotiated_pos_build',
      'negotiated_backend_build',
      'negotiated_policy_schema',
      'negotiated_assertion_schema',
      'integrity_classification',
      'local_authorization_sequence',
      'revision',
      'updated_at',
    ]);

    // And the shape, not only the names. Floor's entity DDL cannot declare a
    // default, so on this path the ten added columns carry none; the upgrade
    // path adds them with `DEFAULT`, because SQLite cannot add a `NOT NULL`
    // column without one. That single divergence is pinned explicitly in
    // ohac_delivery_migration_test.dart; everything else must match it.
    final shapes = await columnShapes(
      db.database,
      'human_auth_terminal_state',
    );
    for (final column in [
      'candidate_sequence',
      'candidate_digest',
      'server_floor_sequence',
      'server_floor_digest',
      'negotiated_pos_build',
      'negotiated_backend_build',
      'negotiated_policy_schema',
      'negotiated_assertion_schema',
      'integrity_classification',
      'local_authorization_sequence',
    ]) {
      final expectedType = column.endsWith('sequence') ? 'INTEGER' : 'TEXT';
      expect(
        shapes[column],
        '$expectedType notnull=1 default=null',
        reason: column,
      );
    }
  });

  test('a fresh install creates both OHAC indexes', () async {
    final db = await buildFreshDatabase();

    final indexes = await db.database.rawQuery(
      "SELECT name FROM sqlite_master WHERE type = 'index' "
      "AND name LIKE 'index_human_auth_%' ORDER BY name",
    );
    expect(
      indexes.map((row) => row['name'] as String).toList(),
      [
        'index_human_auth_local_events_terminal',
        'index_human_auth_policy_entries_user',
      ],
    );
  });

  test('a fresh install refuses to update the append-only tables', () async {
    final db = await buildFreshDatabase();

    await db.database.insert('human_auth_policy_epochs', {
      'tenant_id': 'tenant-1',
      'terminal_id': 'terminal-1',
      'sequence': 1,
      'digest': 'sha256:${'a' * 64}',
      'previous_sequence': 0,
      'previous_digest': 'GENESIS',
      'schema': 'ohac.staff-policy-epoch.v1',
      'target_pos_build': '1.0.0+1',
      'publisher_backend_build': 'backend-1',
      'minimum_assertion_schema': 'ohac.assertion.v1',
      'payload': '{}',
      'received_at': '2026-01-01T00:00:00.000Z',
    });
    await db.database.insert('human_auth_policy_entries', {
      'tenant_id': 'tenant-1',
      'terminal_id': 'terminal-1',
      'sequence': 1,
      'user_id': 'user-1',
      'status': 'ACTIVE',
      'role': 'MANAGER',
      'permissions': '[]',
      'verifier_algorithm': 'bcrypt',
      'verifier_format_version': '2b',
      'verifier_encoded': r'$2b$10$abcdefghijklmnopqrstuv',
      'attempt_reset_generation': '0',
    });
    await db.database.insert('human_auth_local_events', {
      'id': 'event-1',
      'tenant_id': 'tenant-1',
      'terminal_id': 'terminal-1',
      'event_type': 'EPOCH_APPLIED',
      'sequence': 1,
      'payload': '{}',
      'created_at': '2026-01-01T00:00:00.000Z',
    });

    // Each statement has a row to refuse. A row-level trigger only fires for a
    // matched row, so asserting the refusal against an empty table would pass
    // for the wrong reason and prove nothing.
    for (final statement in [
      "UPDATE human_auth_policy_epochs SET payload = 'tampered'",
      "UPDATE human_auth_policy_entries SET status = 'INACTIVE'",
      "UPDATE human_auth_local_events SET payload = 'tampered'",
    ]) {
      await expectLater(
        db.database.rawUpdate(statement),
        throwsA(isA<DatabaseException>()),
      );
    }

    // The rows are still what they were: a refused update changes nothing.
    final epoch = await db.database.query('human_auth_policy_epochs');
    expect(epoch.single['payload'], '{}');
    final entries = await db.database.query('human_auth_policy_entries');
    expect(entries.single['status'], 'ACTIVE');
    final events = await db.database.query('human_auth_local_events');
    expect(events.single['payload'], '{}');
  });

  test('a fresh install refuses to delete from the append-only tables',
      () async {
    final db = await buildFreshDatabase();

    await db.database.insert('human_auth_policy_epochs', {
      'tenant_id': 'tenant-2',
      'terminal_id': 'terminal-2',
      'sequence': 1,
      'digest': 'sha256:${'a' * 64}',
      'previous_sequence': 0,
      'previous_digest': 'GENESIS',
      'schema': 'ohac.staff-policy-epoch.v1',
      'target_pos_build': '1.0.0+1',
      'publisher_backend_build': 'backend-1',
      'minimum_assertion_schema': 'ohac.assertion.v1',
      'payload': '{}',
      'received_at': '2026-01-01T00:00:00.000Z',
    });
    await db.database.insert('human_auth_policy_entries', {
      'tenant_id': 'tenant-2',
      'terminal_id': 'terminal-2',
      'sequence': 1,
      'user_id': 'user-2',
      'status': 'ACTIVE',
      'role': 'MANAGER',
      'permissions': '[]',
      'verifier_algorithm': 'bcrypt',
      'verifier_format_version': '2b',
      'verifier_encoded': r'$2b$10$abcdefghijklmnopqrstuv',
      'attempt_reset_generation': '0',
    });
    await db.database.insert('human_auth_local_events', {
      'id': 'event-2',
      'tenant_id': 'tenant-2',
      'terminal_id': 'terminal-2',
      'event_type': 'EPOCH_APPLIED',
      'sequence': 1,
      'payload': '{}',
      'created_at': '2026-01-01T00:00:00.000Z',
    });

    for (final statement in [
      'DELETE FROM human_auth_policy_epochs',
      'DELETE FROM human_auth_policy_entries',
      'DELETE FROM human_auth_local_events',
    ]) {
      await expectLater(
        db.database.rawDelete(statement),
        throwsA(isA<DatabaseException>()),
      );
    }

    // Evidence survives the attempt to erase it.
    expect(await db.database.query('human_auth_policy_epochs'), hasLength(1));
    expect(await db.database.query('human_auth_policy_entries'), hasLength(1));
    expect(await db.database.query('human_auth_local_events'), hasLength(1));
  });

  test('a fresh install keeps the mutable OHAC tables writable', () async {
    final db = await buildFreshDatabase();

    await db.database.insert('human_auth_terminal_state', {
      'tenant_id': 'tenant-3',
      'terminal_id': 'terminal-3',
      'state': 'ACTIVE',
      'active_sequence': 1,
      'active_digest': 'sha256:${'a' * 64}',
      'candidate_sequence': 0,
      'candidate_digest': '',
      'server_floor_sequence': 0,
      'server_floor_digest': 'GENESIS',
      'negotiated_pos_build': '',
      'negotiated_backend_build': '',
      'negotiated_policy_schema': '',
      'negotiated_assertion_schema': '',
      'integrity_classification': '',
      'local_authorization_sequence': 0,
      'revision': 1,
      'updated_at': '2026-01-01T00:00:00.000Z',
    });
    await db.database.update(
      'human_auth_terminal_state',
      {'state': 'ACK_SUBMITTING', 'revision': 2},
      where: 'tenant_id = ? AND terminal_id = ?',
      whereArgs: ['tenant-3', 'terminal-3'],
    );

    await db.database.insert('human_auth_attempt_state', {
      'tenant_id': 'tenant-3',
      'terminal_id': 'terminal-3',
      'user_id': 'user-3',
      'failure_timestamps': '[]',
      'reset_generation': '0',
      'local_authorization_sequence': 0,
      'revision': 1,
      'updated_at': '2026-01-01T00:00:00.000Z',
    });
    await db.database.update(
      'human_auth_attempt_state',
      {'revision': 2},
      where: 'user_id = ?',
      whereArgs: ['user-3'],
    );

    final state = await db.database.query('human_auth_terminal_state');
    expect(state.single['state'], 'ACK_SUBMITTING');
    final attempts = await db.database.query('human_auth_attempt_state');
    expect(attempts.single['revision'], 2);
  });
}
