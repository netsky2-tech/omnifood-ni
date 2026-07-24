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
    dbPath = '${await databaseFactory.getDatabasesPath()}/audit_v3_migration.db';
    await databaseFactory.deleteDatabase(dbPath);
  });

  tearDown(() async {
    await databaseFactory.deleteDatabase(dbPath);
  });

  test('migration33_34 preserves full v33 audit storage without assigning history', () async {
    final db = await databaseFactory.openDatabase(
      dbPath,
      options: OpenDatabaseOptions(
        version: 33,
        onCreate: (database, version) async {
          await database.execute('''
            CREATE TABLE audit_logs (
              id INTEGER PRIMARY KEY,
              user_id TEXT NOT NULL,
              action TEXT NOT NULL,
              timestamp TEXT NOT NULL,
              device_id TEXT NOT NULL,
              metadata TEXT,
              is_synced INTEGER NOT NULL,
              sequence_no INTEGER NOT NULL,
              prev_hash TEXT NOT NULL,
              entry_hash TEXT NOT NULL,
              metodo_autorizacion TEXT,
              usuario_autorizador_id TEXT,
              remote_ref_uuid TEXT NOT NULL,
              hash_version TEXT,
              has_metodo_autorizacion INTEGER,
              has_usuario_autorizador_id INTEGER
            )
          ''');
        },
      ),
    );
    final historicalRows = <Map<String, Object?>>[
      <String, Object?>{
      'id': 7,
      'user_id': 'legacy-user',
      'action': 'DRAWER_OPEN',
      'timestamp': '2026-07-23T12:00:00.000Z',
      'device_id': 'legacy-device',
      'metadata': '{"legacy":true}',
      'is_synced': 0,
      'sequence_no': 42,
      'prev_hash': 'legacy-prev-hash',
      'entry_hash': 'legacy-entry-hash',
      'metodo_autorizacion': 'PIN',
      'usuario_autorizador_id': null,
      'remote_ref_uuid': 'legacy-ref',
      'hash_version': 'v2',
      'has_metodo_autorizacion': 1,
      'has_usuario_autorizador_id': null,
    },
      <String, Object?>{
        'id': 8,
        'user_id': 'legacy-user-2',
        'action': 'VOID_INVOICE',
        'timestamp': '2026-07-23T12:01:00.000Z',
        'device_id': 'legacy-device',
        'metadata': null,
        'is_synced': 1,
        'sequence_no': 43,
        'prev_hash': 'legacy-entry-hash',
        'entry_hash': 'legacy-entry-hash-2',
        'metodo_autorizacion': null,
        'usuario_autorizador_id': 'authorizer-1',
        'remote_ref_uuid': 'legacy-ref-2',
        'hash_version': null,
        'has_metodo_autorizacion': null,
        'has_usuario_autorizador_id': 0,
      },
    ];
    for (final historicalRow in historicalRows) {
      await db.insert('audit_logs', historicalRow);
    }
    final fingerprintBefore = await auditLogStorageFingerprint(db);

    await migration33_34.migrate(db);

    final columns = await db.rawQuery('PRAGMA table_info(audit_logs)');
    final columnNames = columns.map((column) => column['name'] as String).toSet();
    final fingerprintAfter = await auditLogStorageFingerprint(db);
    expect(fingerprintAfter, fingerprintBefore);
    expect(columnNames, containsAll(_legacyColumns));
    expect(columnNames.difference(_legacyColumns.toSet()), <String>{
      'tenant_id',
      'metadata_raw',
    });
    final migratedRows = await db.query('audit_logs', orderBy: 'id ASC');
    expect(migratedRows, hasLength(2));
    for (final row in migratedRows) {
      expect(row['tenant_id'], isNull);
      expect(row['metadata_raw'], isNull);
    }

    await db.close();
  });
}

const _legacyColumns = <String>[
  'id',
  'user_id',
  'action',
  'timestamp',
  'device_id',
  'metadata',
  'is_synced',
  'sequence_no',
  'prev_hash',
  'entry_hash',
  'metodo_autorizacion',
  'usuario_autorizador_id',
  'remote_ref_uuid',
  'hash_version',
  'has_metodo_autorizacion',
  'has_usuario_autorizador_id',
];

Future<List<Map<String, Object?>>> auditLogStorageFingerprint(
  DatabaseExecutor database,
) {
  final projections = _legacyColumns
      .map(
        (column) =>
            'typeof($column) AS ${column}_type, '
            'quote($column) AS ${column}_quote, '
            'hex(CAST($column AS BLOB)) AS ${column}_hex',
      )
      .join(', ');
  return database.rawQuery(
    'SELECT $projections FROM audit_logs ORDER BY id ASC',
  );
}
