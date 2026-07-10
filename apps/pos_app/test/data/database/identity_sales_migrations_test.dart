import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/database/migrations.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

void main() {
  late String dbPath;

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  setUp(() async {
    dbPath =
        '${await databaseFactory.getDatabasesPath()}/identity_sales_migrations_test.db';
    await databaseFactory.deleteDatabase(dbPath);
  });

  tearDown(() async {
    await databaseFactory.deleteDatabase(dbPath);
  });

  test('migration11_12 creates security_profiles table', () async {
    final db = await databaseFactory.openDatabase(
      dbPath,
      options: OpenDatabaseOptions(
        version: 11,
        onCreate: (database, version) async {},
      ),
    );

    await migration11_12.migrate(db);

    final table = await db.rawQuery(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='security_profiles'",
    );
    expect(table, isNotEmpty);

    await db.close();
  });

  test(
    'migration12_13 defaults active legacy sessions to CAJA_CENTRAL',
    () async {
      final db = await databaseFactory.openDatabase(
        dbPath,
        options: OpenDatabaseOptions(
          version: 12,
          onCreate: (database, version) async {
            await database.execute('''
          CREATE TABLE cashier_sessions (
            id TEXT NOT NULL PRIMARY KEY,
            user_id TEXT NOT NULL,
            opened_at INTEGER NOT NULL,
            closed_at INTEGER,
            opening_balance REAL NOT NULL,
            closing_balance REAL,
            total_sales REAL,
            total_expected REAL,
            is_closed INTEGER NOT NULL
          )
        ''');
          },
        ),
      );

      await db.insert('cashier_sessions', {
        'id': 'session-1',
        'user_id': 'u-1',
        'opened_at': DateTime.now().millisecondsSinceEpoch,
        'closed_at': null,
        'opening_balance': 100.0,
        'closing_balance': null,
        'total_sales': null,
        'total_expected': null,
        'is_closed': 0,
      });

      await migration12_13.migrate(db);

      final rows = await db.query(
        'cashier_sessions',
        where: 'id = ?',
        whereArgs: ['session-1'],
      );
      expect(rows.single['tipo_modelo'], equals('CAJA_CENTRAL'));

      await db.close();
    },
  );

  test('migration21_22 adds recipe_version_id idempotently', () async {
    final db = await databaseFactory.openDatabase(
      dbPath,
      options: OpenDatabaseOptions(
        version: 21,
        onCreate: (database, version) async {
          await database.execute('''
          CREATE TABLE invoice_items (
            id TEXT NOT NULL PRIMARY KEY,
            invoice_id TEXT NOT NULL,
            product_id TEXT NOT NULL
          )
        ''');
        },
      ),
    );

    await migration21_22.migrate(db);
    await migration21_22.migrate(db);

    final columns = await db.rawQuery('PRAGMA table_info(invoice_items)');
    expect(
      columns.where((column) => column['name'] == 'recipe_version_id'),
      hasLength(1),
    );

    await db.close();
  });

  test(
    'migration28_29 backfills stable per-terminal production source sequences',
    () async {
      final db = await databaseFactory.openDatabase(
        dbPath,
        options: OpenDatabaseOptions(
          version: 28,
          onCreate: (database, version) async {
            await database.execute('''
            CREATE TABLE production_order_documents (
              id TEXT NOT NULL PRIMARY KEY,
              recipe_version_id TEXT NOT NULL,
              recipe_product_id TEXT NOT NULL,
              recipe_product_name TEXT NOT NULL,
              produced_insumo_id TEXT NOT NULL,
              produced_insumo_name TEXT NOT NULL,
              planned_quantity REAL NOT NULL,
              actual_quantity REAL NOT NULL,
              produced_batch_number TEXT NOT NULL,
              produced_expiration_date TEXT NOT NULL,
              operation_date TEXT NOT NULL,
              status TEXT NOT NULL,
              variance_reason TEXT,
              closed_at TEXT,
              movement_references_json TEXT NOT NULL,
              is_synced INTEGER NOT NULL DEFAULT 0
            )
          ''');
          },
        ),
      );

      Future<void> insertLegacy(String id, String operationDate) {
        return db.insert('production_order_documents', {
          'id': id,
          'recipe_version_id': 'rv-1',
          'recipe_product_id': 'prod-1',
          'recipe_product_name': 'Product',
          'produced_insumo_id': 'finished-1',
          'produced_insumo_name': 'Finished',
          'planned_quantity': 1.0,
          'actual_quantity': 1.0,
          'produced_batch_number': 'PB-$id',
          'produced_expiration_date': '2026-08-01T00:00:00.000',
          'operation_date': operationDate,
          'status': 'CLOSED_PENDING_SYNC',
          'movement_references_json': '[]',
          'is_synced': 0,
        });
      }

      await insertLegacy('po-later', '2026-07-09T10:02:00.000Z');
      await insertLegacy('po-earlier', '2026-07-09T10:01:00.000Z');
      await insertLegacy('po-same-time', '2026-07-09T10:01:00.000Z');

      await migration28_29.migrate(db);

      final rows = await db.query(
        'production_order_documents',
        columns: ['id', 'terminal_id', 'source_sequence'],
        orderBy: 'source_sequence ASC',
      );

      expect(rows.map((row) => row['id']), [
        'po-earlier',
        'po-same-time',
        'po-later',
      ]);
      expect(rows.map((row) => row['terminal_id']).toSet(), {'POS_LOCAL'});
      expect(rows.map((row) => row['source_sequence']), [1, 2, 3]);

      await db.close();
    },
  );

  test(
    'migration22_23 moves movement sync state out of inventory_movements',
    () async {
      final db = await databaseFactory.openDatabase(
        dbPath,
        options: OpenDatabaseOptions(
          version: 22,
          onConfigure: (database) async {
            await database.execute('PRAGMA foreign_keys = ON');
          },
          onCreate: (database, version) async {
            await database.execute('''
            CREATE TABLE inventory_movements (
              id TEXT NOT NULL PRIMARY KEY,
              insumo_id TEXT NOT NULL,
              type TEXT NOT NULL,
              quantity REAL NOT NULL,
              previous_stock REAL NOT NULL,
              new_stock REAL NOT NULL,
              timestamp TEXT NOT NULL,
              reason TEXT,
              user_id TEXT,
              is_synced INTEGER NOT NULL DEFAULT 0,
              batch_deductions TEXT
            )
          ''');
          },
        ),
      );

      await db.insert('inventory_movements', {
        'id': 'mov-pending',
        'insumo_id': 'ins-1',
        'type': 'SALE',
        'quantity': -1.0,
        'previous_stock': 5.0,
        'new_stock': 4.0,
        'timestamp': '2026-06-30T12:00:00.000Z',
        'is_synced': 0,
      });
      await db.insert('inventory_movements', {
        'id': 'mov-synced',
        'insumo_id': 'ins-1',
        'type': 'SALE',
        'quantity': -2.0,
        'previous_stock': 4.0,
        'new_stock': 2.0,
        'timestamp': '2026-06-30T12:01:00.000Z',
        'is_synced': 1,
      });
      await db.insert('inventory_movements', {
        'id': 'mov-failed',
        'insumo_id': 'ins-1',
        'type': 'SALE',
        'quantity': -1.0,
        'previous_stock': 2.0,
        'new_stock': 1.0,
        'timestamp': '2026-06-30T12:02:00.000Z',
        'is_synced': -1,
      });

      final foreignKeysEnabled = await db.rawQuery('PRAGMA foreign_keys');

      await migration22_23.migrate(db);

      final movementColumns = await db.rawQuery(
        'PRAGMA table_info(inventory_movements)',
      );
      final foreignKeyViolations = await db.rawQuery(
        'PRAGMA foreign_key_check',
      );
      final syncRows = await db.query(
        'inventory_movement_sync_state',
        orderBy: 'movement_id ASC',
      );

      expect(foreignKeysEnabled.single['foreign_keys'], 1);
      expect(
        movementColumns.where((column) => column['name'] == 'is_synced'),
        isEmpty,
      );
      expect(foreignKeyViolations, isEmpty);
      expect(syncRows, hasLength(2));
      expect(syncRows[0]['movement_id'], 'mov-failed');
      expect(syncRows[0]['sync_status'], 'failed');
      expect(syncRows[1]['movement_id'], 'mov-synced');
      expect(syncRows[1]['sync_status'], 'synced');

      await expectLater(
        db.rawUpdate('UPDATE inventory_movements SET reason = ? WHERE id = ?', [
          'tampered',
          'mov-pending',
        ]),
        throwsA(isA<Exception>()),
      );

      await db.close();
    },
  );

  test(
    'migration23_24 adds invoice_number without inventing legacy purchase identity',
    () async {
      final db = await databaseFactory.openDatabase(
        dbPath,
        options: OpenDatabaseOptions(
          version: 23,
          onCreate: (database, version) async {
            await database.execute('''
            CREATE TABLE purchases (
              id TEXT NOT NULL PRIMARY KEY,
              insumo_id TEXT NOT NULL,
              supplier_id TEXT NOT NULL,
              quantity REAL NOT NULL,
              unit_cost REAL NOT NULL,
              timestamp TEXT NOT NULL,
              invoice_date TEXT NOT NULL,
              currency TEXT NOT NULL,
              bcn_rate REAL NOT NULL,
              unit_cost_nio REAL,
              cpp_before_nio REAL,
              projected_cpp_nio REAL,
              lot_code TEXT,
              received_date TEXT,
              expiration_date TEXT,
              requires_batch_tracking INTEGER NOT NULL,
              is_synced INTEGER NOT NULL DEFAULT 0
            )
          ''');
          },
        ),
      );

      await db.insert('purchases', {
        'id': 'purchase-legacy-1',
        'insumo_id': 'ins-1',
        'supplier_id': 'sup-1',
        'quantity': 2.0,
        'unit_cost': 10.0,
        'timestamp': '2026-01-01T12:00:00.000Z',
        'invoice_date': '2026-01-01',
        'currency': 'USD',
        'bcn_rate': 36.5,
        'requires_batch_tracking': 0,
        'is_synced': 0,
      });

      await migration23_24.migrate(db);

      final columns = await db.rawQuery('PRAGMA table_info(purchases)');
      final rows = await db.query('purchases');

      expect(
        columns.where((column) => column['name'] == 'invoice_number'),
        hasLength(1),
      );
      expect(rows.single['invoice_number'], '');

      await db.close();
    },
  );

  test(
    'migration26_27 backfills deterministic movement sync metadata by replay order',
    () async {
      final db = await databaseFactory.openDatabase(
        dbPath,
        options: OpenDatabaseOptions(
          version: 26,
          onCreate: (database, version) async {
            await database.execute('''
            CREATE TABLE inventory_movements (
              id TEXT NOT NULL PRIMARY KEY,
              insumo_id TEXT NOT NULL,
              type TEXT NOT NULL,
              quantity REAL NOT NULL,
              previous_stock REAL NOT NULL,
              new_stock REAL NOT NULL,
              timestamp TEXT NOT NULL,
              reason TEXT,
              user_id TEXT,
              batch_deductions TEXT
            )
          ''');
            await database.execute('''
            CREATE TABLE inventory_movement_sync_state (
              movement_id TEXT NOT NULL PRIMARY KEY,
              sync_status TEXT NOT NULL,
              last_attempted_at TEXT,
              synced_at TEXT,
              last_error TEXT,
              FOREIGN KEY (movement_id) REFERENCES inventory_movements(id) ON DELETE CASCADE
            )
          ''');
          },
        ),
      );

      await db.insert('inventory_movements', {
        'id': 'mov-newer',
        'insumo_id': 'ins-1',
        'type': 'SALE',
        'quantity': -1.0,
        'previous_stock': 5.0,
        'new_stock': 4.0,
        'timestamp': '2026-06-30T12:01:00.000Z',
      });
      await db.insert('inventory_movements', {
        'id': 'mov-older',
        'insumo_id': 'ins-1',
        'type': 'SALE',
        'quantity': -2.0,
        'previous_stock': 4.0,
        'new_stock': 2.0,
        'timestamp': '2026-06-30T12:00:00.000Z',
      });
      await db.insert('inventory_movement_sync_state', {
        'movement_id': 'mov-older',
        'sync_status': 'failed',
        'last_error': 'timeout',
      });

      await migration26_27.migrate(db);

      final rows = await db.query(
        'inventory_movement_sync_state',
        orderBy: 'local_sequence ASC',
      );
      // pos-standalone is a legacy provenance fallback for historical rows,
      // not the runtime terminal identity used by new POS sync attempts.
      expect(rows.map((row) => row['movement_id']), ['mov-older', 'mov-newer']);
      expect(
        rows.map((row) => row['terminal_id']),
        everyElement('pos-standalone'),
      );
      expect(rows.map((row) => row['flow_type']), everyElement('inventory'));
      expect(rows.map((row) => row['local_sequence']), [1, 2]);
      expect(rows.map((row) => row['idempotency_key']), [
        'inventory:pos-standalone:mov-older',
        'inventory:pos-standalone:mov-newer',
      ]);
      expect(rows.first['sync_status'], 'failed');
      expect(rows.first['last_error'], 'timeout');

      await db.close();
    },
  );

  test(
    'migration24_25 leaves legacy purchase fxRateMode provenance unknown',
    () async {
      final db = await databaseFactory.openDatabase(
        dbPath,
        options: OpenDatabaseOptions(
          version: 24,
          onCreate: (database, version) async {
            await database.execute('''
            CREATE TABLE purchases (
              id TEXT NOT NULL PRIMARY KEY,
              insumo_id TEXT NOT NULL,
              supplier_id TEXT NOT NULL,
              invoice_number TEXT NOT NULL DEFAULT '',
              quantity REAL NOT NULL,
              unit_cost REAL NOT NULL,
              timestamp TEXT NOT NULL,
              invoice_date TEXT NOT NULL,
              currency TEXT NOT NULL,
              bcn_rate REAL NOT NULL,
              unit_cost_nio REAL,
              cpp_before_nio REAL,
              projected_cpp_nio REAL,
              lot_code TEXT,
              received_date TEXT,
              expiration_date TEXT,
              requires_batch_tracking INTEGER NOT NULL,
              is_synced INTEGER NOT NULL DEFAULT 0
            )
          ''');
          },
        ),
      );

      await db.insert('purchases', {
        'id': 'purchase-legacy-2',
        'insumo_id': 'ins-1',
        'supplier_id': 'sup-1',
        'invoice_number': 'INV-1002',
        'quantity': 2.0,
        'unit_cost': 10.0,
        'timestamp': '2026-01-01T12:00:00.000Z',
        'invoice_date': '2026-01-01',
        'currency': 'USD',
        'bcn_rate': 36.5,
        'requires_batch_tracking': 0,
        'is_synced': 0,
      });

      await migration24_25.migrate(db);

      final columns = await db.rawQuery('PRAGMA table_info(purchases)');
      final rows = await db.query('purchases');

      expect(
        columns.where((column) => column['name'] == 'fx_rate_mode'),
        hasLength(1),
      );
      expect(rows.single['fx_rate_mode'], isNull);

      await db.close();
    },
  );

  test(
    'fresh schema creates deterministic movement sync metadata indexes',
    () async {
      final database = await $FloorAppDatabase
          .inMemoryDatabaseBuilder()
          .build();
      try {
        final indexes = await database.database.rawQuery(
          "PRAGMA index_list('inventory_movement_sync_state')",
        );
        final indexNames = indexes.map((row) => row['name']).toSet();

        expect(
          indexNames,
          containsAll(const [
            'idx_movement_sync_state_stream_sequence',
            'idx_movement_sync_state_idempotency_key',
          ]),
        );
      } finally {
        await database.close();
      }
    },
  );

  test('fresh schema creates production idempotency unique index', () async {
    final database = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();
    try {
      final indexes = await database.database.rawQuery(
        "PRAGMA index_list('production_order_documents')",
      );
      final indexNames = indexes.map((row) => row['name']).toSet();
      final idempotencyIndex = indexes.singleWhere(
        (row) =>
            row['name'] == 'idx_production_order_documents_idempotency_key',
      );

      expect(
        indexNames,
        contains('idx_production_order_documents_idempotency_key'),
      );
      expect(idempotencyIndex['unique'], 1);
    } finally {
      await database.close();
    }
  });
}
