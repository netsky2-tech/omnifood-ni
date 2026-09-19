import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:pos_app/data/database/migrations.dart';

/// Covers the OHAC local delivery persistence migration (design §4.2, §5, §6).
///
/// The migration is exercised directly against a database at the previous
/// version, which is how this app covers every other migration. The point of
/// the assertions is that immutability is a schema property: a policy artifact
/// that could be edited in place would let the stored epoch disagree with the
/// digest the backend signed.
void main() {
  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  Future<Database> migrateFrom52() async {
    final db = await openDatabase(
      inMemoryDatabasePath,
      version: 52,
      onCreate: (db, version) async {
        // The migration only adds tables, so the prior schema is irrelevant to
        // it beyond existing at all.
        await db.execute(
          'CREATE TABLE legacy_marker (id TEXT PRIMARY KEY)',
        );
      },
    );
    await migration52_53.migrate(db);
    return db;
  }

  Future<List<String>> columnNames(Database db, String table) async {
    final rows = await db.rawQuery('PRAGMA table_info($table)');
    return rows.map((row) => row['name'] as String).toList();
  }

  test('migration52_53 creates the five OHAC delivery tables', () async {
    final db = await migrateFrom52();

    final tables = await db.rawQuery(
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
    await db.close();
  });

  test('the immutable epoch table carries the signed envelope and its chain', () async {
    final db = await migrateFrom52();

    expect(await columnNames(db, 'human_auth_policy_epochs'), [
      'tenant_id',
      'terminal_id',
      'sequence',
      'digest',
      'previous_sequence',
      'previous_digest',
      'schema',
      'target_pos_build',
      'publisher_backend_build',
      'minimum_assertion_schema',
      'payload',
      'received_at',
    ]);
    await db.close();
  });

  test('the entry table carries the portable verifier and its generation', () async {
    final db = await migrateFrom52();

    expect(await columnNames(db, 'human_auth_policy_entries'), [
      'tenant_id',
      'terminal_id',
      'sequence',
      'user_id',
      'status',
      'role',
      'permissions',
      'verifier_algorithm',
      'verifier_format_version',
      'verifier_encoded',
      'attempt_reset_generation',
    ]);
    await db.close();
  });

  test('the attempt state keeps the rolling window and its own sequence', () async {
    final db = await migrateFrom52();

    expect(await columnNames(db, 'human_auth_attempt_state'), [
      'tenant_id',
      'terminal_id',
      'user_id',
      'failure_timestamps',
      'locked_until',
      'reset_generation',
      'local_authorization_sequence',
      'revision',
      'updated_at',
    ]);
    await db.close();
  });

  test('policy artifacts and the event log refuse an update', () async {
    final db = await migrateFrom52();

    await db.insert('human_auth_policy_epochs', {
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
    await db.insert('human_auth_policy_entries', {
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
    await db.insert('human_auth_local_events', {
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
        db.rawUpdate(statement),
        throwsA(isA<DatabaseException>()),
      );
    }

    // The rows are still what they were: a refused update changes nothing.
    final epoch = await db.query('human_auth_policy_epochs');
    expect(epoch.single['payload'], '{}');
    await db.close();
  });

  test('policy artifacts and the event log refuse a delete', () async {
    final db = await migrateFrom52();

    await db.insert('human_auth_policy_epochs', {
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
    await db.insert('human_auth_policy_entries', {
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
    await db.insert('human_auth_local_events', {
      'id': 'event-1',
      'tenant_id': 'tenant-1',
      'terminal_id': 'terminal-1',
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
        db.rawDelete(statement),
        throwsA(isA<DatabaseException>()),
      );
    }

    // Evidence survives the attempt to erase it.
    expect(await db.query('human_auth_policy_epochs'), hasLength(1));
    expect(await db.query('human_auth_local_events'), hasLength(1));
    await db.close();
  });

  test('the mutable tables stay writable, which is what makes them mutable', () async {
    final db = await migrateFrom52();

    await db.insert('human_auth_terminal_state', {
      'tenant_id': 'tenant-1',
      'terminal_id': 'terminal-1',
      'state': 'ACTIVE',
      'active_sequence': 1,
      'active_digest': 'sha256:${'a' * 64}',
      'revision': 1,
      'updated_at': '2026-01-01T00:00:00.000Z',
    });
    await db.update(
      'human_auth_terminal_state',
      {'state': 'ACK_SUBMITTING', 'revision': 2},
      where: 'tenant_id = ? AND terminal_id = ?',
      whereArgs: ['tenant-1', 'terminal-1'],
    );

    await db.insert('human_auth_attempt_state', {
      'tenant_id': 'tenant-1',
      'terminal_id': 'terminal-1',
      'user_id': 'user-1',
      'failure_timestamps': '[]',
      'reset_generation': '0',
      'local_authorization_sequence': 0,
      'revision': 1,
      'updated_at': '2026-01-01T00:00:00.000Z',
    });
    await db.update(
      'human_auth_attempt_state',
      {'revision': 2},
      where: 'user_id = ?',
      whereArgs: ['user-1'],
    );

    final state = await db.query('human_auth_terminal_state');
    expect(state.single['state'], 'ACK_SUBMITTING');
    final attempts = await db.query('human_auth_attempt_state');
    expect(attempts.single['revision'], 2);
    await db.close();
  });

  test('the migration is idempotent when it runs twice', () async {
    final db = await migrateFrom52();

    await migration52_53.migrate(db);

    final tables = await db.rawQuery(
      "SELECT name FROM sqlite_master WHERE type = 'table' "
      "AND name LIKE 'human_auth_%'",
    );
    expect(tables, hasLength(5));
    await db.close();
  });
}
