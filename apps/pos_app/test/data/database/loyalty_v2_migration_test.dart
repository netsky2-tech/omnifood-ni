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
        '${await databaseFactory.getDatabasesPath()}/loyalty_v2_migration_test.db';
    await databaseFactory.deleteDatabase(dbPath);
  });

  tearDown(() async {
    await databaseFactory.deleteDatabase(dbPath);
  });

  test('migration41_42 creates loyalty_programs table', () async {
    final db = await databaseFactory.openDatabase(
      dbPath,
      options: OpenDatabaseOptions(
        version: 41,
        onCreate: (database, version) async {},
      ),
    );

    await migration41_42.migrate(db);

    final tables = await db.rawQuery(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='loyalty_programs'",
    );
    expect(tables, hasLength(1));

    final columns = await db.rawQuery('PRAGMA table_info(loyalty_programs)');
    final colNames = columns.map((c) => c['name'] as String).toSet();

    expect(colNames, containsAll([
      'id',
      'tenant_id',
      'name',
      'program_type',
      'status',
      'starts_at',
      'ends_at',
      'earning_rule_json',
      'eligibility_rule_json',
      'config_version',
      'created_at',
      'updated_at',
    ]));

    await db.close();
  });

  test('migration41_42 creates loyalty_rewards table', () async {
    final db = await databaseFactory.openDatabase(
      dbPath,
      options: OpenDatabaseOptions(
        version: 41,
        onCreate: (database, version) async {},
      ),
    );

    await migration41_42.migrate(db);

    final tables = await db.rawQuery(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='loyalty_rewards'",
    );
    expect(tables, hasLength(1));

    final columns = await db.rawQuery('PRAGMA table_info(loyalty_rewards)');
    final colNames = columns.map((c) => c['name'] as String).toSet();

    expect(colNames, containsAll([
      'id',
      'tenant_id',
      'loyalty_program_id',
      'name',
      'reward_type',
      'cost_units',
      'benefit_config_json',
      'status',
      'starts_at',
      'ends_at',
      'presentation_order',
      'config_version',
      'created_at',
      'updated_at',
    ]));

    await db.close();
  });

  test('migration41_42 creates correct indices on loyalty_programs', () async {
    final db = await databaseFactory.openDatabase(
      dbPath,
      options: OpenDatabaseOptions(
        version: 41,
        onCreate: (database, version) async {},
      ),
    );

    await migration41_42.migrate(db);

    final indices = await db.rawQuery(
      "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='loyalty_programs'",
    );
    final indexNames = indices.map((i) => i['name'] as String).toSet();

    expect(indexNames, containsAll([
      'idx_loyalty_programs_tenant_id',
      'idx_loyalty_programs_status',
      'idx_loyalty_programs_program_type',
    ]));

    await db.close();
  });

  test('migration41_42 creates correct indices on loyalty_rewards', () async {
    final db = await databaseFactory.openDatabase(
      dbPath,
      options: OpenDatabaseOptions(
        version: 41,
        onCreate: (database, version) async {},
      ),
    );

    await migration41_42.migrate(db);

    final indices = await db.rawQuery(
      "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='loyalty_rewards'",
    );
    final indexNames = indices.map((i) => i['name'] as String).toSet();

    expect(indexNames, containsAll([
      'idx_loyalty_rewards_tenant_id',
      'idx_loyalty_rewards_program_id',
      'idx_loyalty_rewards_status',
    ]));

    await db.close();
  });

  test('migration41_42 allows insert into loyalty_programs', () async {
    final db = await databaseFactory.openDatabase(
      dbPath,
      options: OpenDatabaseOptions(
        version: 41,
        onCreate: (database, version) async {},
      ),
    );

    await migration41_42.migrate(db);

    await db.insert('loyalty_programs', {
      'id': 'prog-1',
      'tenant_id': 'tenant-1',
      'name': 'Puntos SOHO',
      'program_type': 'SPEND_POINTS',
      'status': 'ACTIVE',
      'earning_rule_json': '{"spendBlockNio":10,"pointsPerBlock":1}',
      'eligibility_rule_json': '{}',
      'config_version': 1,
      'created_at': DateTime.now().millisecondsSinceEpoch,
      'updated_at': DateTime.now().millisecondsSinceEpoch,
    });

    final rows = await db.query('loyalty_programs');
    expect(rows, hasLength(1));
    expect(rows.first['name'], 'Puntos SOHO');
    expect(rows.first['program_type'], 'SPEND_POINTS');
    expect(rows.first['status'], 'ACTIVE');

    await db.close();
  });

  test('migration41_42 allows insert into loyalty_rewards', () async {
    final db = await databaseFactory.openDatabase(
      dbPath,
      options: OpenDatabaseOptions(
        version: 41,
        onCreate: (database, version) async {},
      ),
    );

    await migration41_42.migrate(db);

    // First insert a program
    await db.insert('loyalty_programs', {
      'id': 'prog-1',
      'tenant_id': 'tenant-1',
      'name': 'Puntos SOHO',
      'program_type': 'SPEND_POINTS',
      'status': 'ACTIVE',
      'earning_rule_json': '{}',
      'eligibility_rule_json': '{}',
      'config_version': 1,
      'created_at': DateTime.now().millisecondsSinceEpoch,
      'updated_at': DateTime.now().millisecondsSinceEpoch,
    });

    await db.insert('loyalty_rewards', {
      'id': 'rw-1',
      'tenant_id': 'tenant-1',
      'loyalty_program_id': 'prog-1',
      'name': 'C\$50 descuento',
      'reward_type': 'DISCOUNT_AMOUNT',
      'cost_units': 100,
      'benefit_config_json': '{"amountNio":50}',
      'status': 'ACTIVE',
      'presentation_order': 0,
      'config_version': 1,
      'created_at': DateTime.now().millisecondsSinceEpoch,
      'updated_at': DateTime.now().millisecondsSinceEpoch,
    });

    final rows = await db.query('loyalty_rewards');
    expect(rows, hasLength(1));
    expect(rows.first['name'], 'C\$50 descuento');
    expect(rows.first['reward_type'], 'DISCOUNT_AMOUNT');
    expect(rows.first['cost_units'], 100);

    await db.close();
  });

  test('migration41_42 is idempotent', () async {
    final db = await databaseFactory.openDatabase(
      dbPath,
      options: OpenDatabaseOptions(
        version: 41,
        onCreate: (database, version) async {},
      ),
    );

    await migration41_42.migrate(db);
    await migration41_42.migrate(db);

    final tables = await db.rawQuery(
      "SELECT name FROM sqlite_master WHERE type='table' AND (name='loyalty_programs' OR name='loyalty_rewards')",
    );
    expect(tables, hasLength(2));

    await db.close();
  });

  test('migration41_42 nullable columns default correctly', () async {
    final db = await databaseFactory.openDatabase(
      dbPath,
      options: OpenDatabaseOptions(
        version: 41,
        onCreate: (database, version) async {},
      ),
    );

    await migration41_42.migrate(db);

    await db.insert('loyalty_programs', {
      'id': 'prog-2',
      'tenant_id': 'tenant-1',
      'name': 'Sellos Café',
      'program_type': 'PRODUCT_STAMPS',
      'status': 'DRAFT',
      'earning_rule_json': '{}',
      'eligibility_rule_json': '{}',
      'config_version': 1,
      'created_at': DateTime.now().millisecondsSinceEpoch,
      'updated_at': DateTime.now().millisecondsSinceEpoch,
    });

    final rows = await db.query('loyalty_programs');
    final row = rows.first;
    expect(row['starts_at'], isNull);
    expect(row['ends_at'], isNull);

    await db.close();
  });
}
