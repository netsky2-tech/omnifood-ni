import 'package:flutter_test/flutter_test.dart';
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
        '${await databaseFactory.getDatabasesPath()}/loyalty_v1_migration_test.db';
    await databaseFactory.deleteDatabase(dbPath);
  });

  tearDown(() async {
    await databaseFactory.deleteDatabase(dbPath);
  });

  test('migration39_40 creates customer_point_transactions with legacy columns',
      () async {
    final db = await databaseFactory.openDatabase(
      dbPath,
      options: OpenDatabaseOptions(
        version: 39,
        onCreate: (database, version) async {},
      ),
    );

    await migration39_40.migrate(db);

    final columns = await db.rawQuery(
      'PRAGMA table_info(customer_point_transactions)',
    );
    final colNames = columns.map((c) => c['name'] as String).toSet();

    expect(colNames, containsAll([
      'id', 'customer_id', 'invoice_id', 'type', 'points',
      'balance_after', 'conversion_rate', 'reason', 'created_at',
      'sync_status',
    ]));

    await db.close();
  });

  test('migration40_41 adds all V1 loyalty columns', () async {
    final db = await databaseFactory.openDatabase(
      dbPath,
      options: OpenDatabaseOptions(
        version: 39,
        onCreate: (database, version) async {},
      ),
    );

    await migration39_40.migrate(db);
    await migration40_41.migrate(db);

    final columns = await db.rawQuery(
      'PRAGMA table_info(customer_point_transactions)',
    );
    final colNames = columns.map((c) => c['name'] as String).toSet();

    const v1Columns = [
      'loyalty_program_id',
      'ticket_id',
      'reward_id',
      'transaction_type',
      'units',
      'reversal_of_transaction_id',
      'idempotency_key',
      'source_event_id',
      'actor_user_id',
      'branch_id',
      'terminal_id',
      'program_version',
      'reward_version',
      'commercial_snapshot',
      'origin',
      'occurred_at',
      'recorded_at',
      'legacy_imported',
    ];

    for (final col in v1Columns) {
      expect(colNames, contains(col), reason: 'Missing V1 column: $col');
    }

    await db.close();
  });

  test('migration40_41 preserves legacy columns intact', () async {
    final db = await databaseFactory.openDatabase(
      dbPath,
      options: OpenDatabaseOptions(
        version: 39,
        onCreate: (database, version) async {},
      ),
    );

    await migration39_40.migrate(db);

    await db.insert('customer_point_transactions', {
      'id': 'legacy-tx-1',
      'customer_id': 'cust-1',
      'invoice_id': 'inv-100',
      'type': 'earn',
      'points': 10.5,
      'balance_after': 110.5,
      'conversion_rate': 0.1,
      'reason': 'Acumulación por compra',
      'created_at': DateTime.now().millisecondsSinceEpoch,
      'sync_status': 'pending',
    });

    await migration40_41.migrate(db);

    final rows = await db.query('customer_point_transactions');
    expect(rows, hasLength(1));

    final row = rows.first;
    expect(row['id'], 'legacy-tx-1');
    expect(row['customer_id'], 'cust-1');
    expect(row['invoice_id'], 'inv-100');
    expect(row['type'], 'earn');
    expect(row['points'], 10.5);
    expect(row['balance_after'], 110.5);
    expect(row['reason'], 'Acumulación por compra');

    await db.close();
  });

  test('migration40_41 V1 columns are nullable', () async {
    final db = await databaseFactory.openDatabase(
      dbPath,
      options: OpenDatabaseOptions(
        version: 39,
        onCreate: (database, version) async {},
      ),
    );

    await migration39_40.migrate(db);
    await migration40_41.migrate(db);

    await db.insert('customer_point_transactions', {
      'id': 'legacy-only-tx',
      'customer_id': 'cust-2',
      'type': 'earn',
      'points': 5.0,
      'balance_after': 5.0,
      'conversion_rate': 0.1,
      'created_at': DateTime.now().millisecondsSinceEpoch,
      'sync_status': 'pending',
    });

    final rows = await db.query('customer_point_transactions');
    expect(rows, hasLength(1));

    final row = rows.first;
    expect(row['loyalty_program_id'], isNull);
    expect(row['ticket_id'], isNull);
    expect(row['reward_id'], isNull);
    expect(row['transaction_type'], isNull);
    expect(row['units'], isNull);
    expect(row['idempotency_key'], isNull);
    expect(row['legacy_imported'], 0);

    await db.close();
  });

  test('migration40_41 allows insert with V1 columns', () async {
    final db = await databaseFactory.openDatabase(
      dbPath,
      options: OpenDatabaseOptions(
        version: 39,
        onCreate: (database, version) async {},
      ),
    );

    await migration39_40.migrate(db);
    await migration40_41.migrate(db);

    await db.insert('customer_point_transactions', {
      'id': 'v1-tx-1',
      'customer_id': 'cust-3',
      'type': 'earn',
      'points': 20.0,
      'balance_after': 20.0,
      'conversion_rate': 0.1,
      'created_at': DateTime.now().millisecondsSinceEpoch,
      'sync_status': 'pending',
      'loyalty_program_id': 'prog-1',
      'ticket_id': 'ticket-abc',
      'transaction_type': 'EARN',
      'units': 20,
      'idempotency_key': 'loyalty:earn:tenant-1:ticket-abc:prog-1',
      'origin': 'POS',
      'legacy_imported': 0,
    });

    final rows = await db.query('customer_point_transactions');
    expect(rows, hasLength(1));

    final row = rows.first;
    expect(row['loyalty_program_id'], 'prog-1');
    expect(row['ticket_id'], 'ticket-abc');
    expect(row['transaction_type'], 'EARN');
    expect(row['units'], 20);
    expect(row['idempotency_key'], 'loyalty:earn:tenant-1:ticket-abc:prog-1');
    expect(row['origin'], 'POS');

    await db.close();
  });

  test('migration40_41 is idempotent', () async {
    final db = await databaseFactory.openDatabase(
      dbPath,
      options: OpenDatabaseOptions(
        version: 39,
        onCreate: (database, version) async {},
      ),
    );

    await migration39_40.migrate(db);
    await migration40_41.migrate(db);
    await migration40_41.migrate(db);

    final columns = await db.rawQuery(
      'PRAGMA table_info(customer_point_transactions)',
    );
    final v1Cols = columns
        .where((c) => [
              'loyalty_program_id',
              'ticket_id',
              'reward_id',
              'idempotency_key',
              'legacy_imported',
            ].contains(c['name']))
        .toList();

    expect(v1Cols, hasLength(5));

    await db.close();
  });
}
