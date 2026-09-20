import 'dart:io';

import 'package:path/path.dart' as p;
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/database/migrations.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

/// Release-harness persistence bootstrap for Loyalty V1 (tracker T1, blocker
/// B10 discipline).
///
/// Production-shape rule: POS release evidence must come from a file-backed
/// SQLite database obtained through the app's real migration path. This
/// harness first creates an *empty historical version 10* database (v10-shaped
/// tables, zero rows) and then opens it through Floor's `databaseBuilder` with
/// `allMigrations`, so migrations 10 -> current actually execute. Floor's
/// `onCreate` is never relied on as evidence: a freshly created schema is not
/// release evidence.
///
/// No loyalty structure is ever hand-built here: `customer_point_transactions`
/// (migrations 39/40), `loyalty_programs` and `loyalty_rewards` (migration 41)
/// exist only if the real migrations created them. The legacy tables below are
/// only the v10-era, non-loyalty tables the production migration chain
/// hard-requires as its starting point (ALTER TABLE / UPDATE targets).
class LoyaltyReleaseHarness {
  LoyaltyReleaseHarness(this.directory);

  /// Directory that owns the temporary database file (deleted in teardown).
  final Directory directory;

  /// Schema version of [AppDatabase] today.
  static const int currentSchemaVersion = 53;
  static const int legacySchemaVersion = 10;

  late final String dbPath = p.join(directory.path, 'pos_release_probe.db');

  AppDatabase? _database;

  /// Loyalty tables/columns the release probes depend on (arch §5, §8-§9).
  static const requiredLoyaltyColumns = <String, Set<String>>{
    'loyalty_programs': {
      'id', 'tenant_id', 'program_type', 'status', 'earning_rule_json',
    },
    'loyalty_rewards': {
      'id', 'tenant_id', 'loyalty_program_id', 'reward_type', 'cost_units',
      'status',
    },
    'customer_point_transactions': {
      'id', 'customer_id', 'transaction_type', 'units', 'ticket_id',
      'loyalty_program_id', 'reward_id', 'reversal_of_transaction_id',
      'idempotency_key', 'origin',
    },
  };

  /// Creates the empty historical version-10 database file on disk.
  Future<void> createLegacyV10Database() async {
    final legacyDb = await databaseFactory.openDatabase(
      dbPath,
      options: OpenDatabaseOptions(
        version: legacySchemaVersion,
        onCreate: (db, version) async {
          // Minimal v10 stub: only the v10-era, non-loyalty tables the
          // production migration chain hard-requires (ALTER TABLE / UPDATE
          // targets), empty of rows. This is Loyalty-scope migration evidence,
          // NOT a full production-v10 snapshot; unrelated tables are
          // deliberately not expanded in this slice. Loyalty tables are
          // deliberately absent so their existence can only come from real
          // migrations.
          await db.execute(
            'CREATE TABLE inventory_movements (id TEXT NOT NULL PRIMARY KEY, '
            'insumo_id TEXT NOT NULL, type TEXT NOT NULL, quantity REAL NOT NULL, '
            'previous_stock REAL NOT NULL, new_stock REAL NOT NULL, '
            'timestamp TEXT NOT NULL, reason TEXT, user_id TEXT, '
            'is_synced INTEGER NOT NULL DEFAULT 0)');
          await db.execute(
            'CREATE TABLE cashier_sessions (id TEXT NOT NULL PRIMARY KEY)');
          await db.execute(
            'CREATE TABLE audit_logs (id TEXT NOT NULL PRIMARY KEY, '
            'tenant_id TEXT, device_id TEXT, user_id TEXT, sequence_no INTEGER)');
          await db.execute(
            'CREATE TABLE purchases (id TEXT NOT NULL PRIMARY KEY, '
            'timestamp TEXT NOT NULL)');
          await db.execute(
            'CREATE TABLE batches (id TEXT NOT NULL PRIMARY KEY)');
          await db.execute(
            'CREATE TABLE insumos (id TEXT NOT NULL PRIMARY KEY)');
          await db.execute(
            'CREATE TABLE products (id TEXT NOT NULL PRIMARY KEY)');
          await db.execute(
            'CREATE TABLE invoice_items (id TEXT NOT NULL PRIMARY KEY, '
            'invoice_id TEXT)');
          await db.execute(
            'CREATE TABLE invoices (id TEXT NOT NULL PRIMARY KEY, '
            'invoice_number TEXT NOT NULL, total REAL NOT NULL, '
            'created_at INTEGER NOT NULL, sync_status TEXT NOT NULL, '
            'type TEXT NOT NULL)');
        },
      ),
    );
    await legacyDb.close();
  }

  /// Opens the legacy file through the production migration path
  /// (`allMigrations` + the same append-only open callback `main.dart` uses),
  /// never through Floor `onCreate`.
  Future<AppDatabase> openMigratedDatabase() async {
    final database = await $FloorAppDatabase
        .databaseBuilder(dbPath)
        .addMigrations(allMigrations)
        .addCallback(inventoryMovementAppendOnlyCallback)
        .build();
    _database = database;
    return database;
  }

  /// Proves the file on disk is still the untouched v10 baseline before Floor
  /// touches it: correct `user_version` and zero Loyalty structures. A missing
  /// or wrong file must fail here instead of silently falling into Floor
  /// `onCreate` (a freshly created schema is not migration evidence).
  Future<void> verifyLegacyBaseline() async {
    final raw = await databaseFactory.openDatabase(dbPath);
    try {
      final version =
          (await raw.rawQuery('PRAGMA user_version')).single['user_version']
              as int;
      if (version != legacySchemaVersion) {
        throw StateError(
          'expected legacy file at schema version $legacySchemaVersion, '
          'found $version',
        );
      }
      final loyaltyTables = await raw.rawQuery(
        "SELECT name FROM sqlite_master WHERE type='table' AND name IN "
        "('customer_point_transactions', 'loyalty_programs', 'loyalty_rewards')",
      );
      if (loyaltyTables.isNotEmpty) {
        throw StateError(
          'legacy v10 baseline must not contain Loyalty tables; found '
          '${loyaltyTables.map((row) => row['name'])}',
        );
      }
    } finally {
      await raw.close();
    }
  }

  /// Closes the migrated database (used before reopen and teardown).
  Future<void> close() async { await _database?.close(); _database = null; }

  /// Column names of [table] on the migrated database.
  static Future<Set<String>> tableColumns(AppDatabase db, String table) async {
    final rows = await db.database.rawQuery('PRAGMA table_info($table)');
    return rows.map((row) => row['name'] as String).toSet();
  }

  /// `PRAGMA user_version` of the migrated database file.
  static Future<int> userVersion(AppDatabase db) async =>
      (await db.database.rawQuery('PRAGMA user_version')).single['user_version']
          as int;
}
