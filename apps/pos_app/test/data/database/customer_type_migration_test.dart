import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/database/migrations.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

/// Covers the `customers.customer_type` schema guarantee (#952).
///
/// The entity gained `customer_type` for the loyalty EMPRESA gate. Devices
/// upgrading from schema v74 must receive the column via migration; a fresh
/// install gets it from the onCreate DDL. This exercises the migration
/// directly against a database at v74 (the drift case).
void main() {
  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  var dbSeq = 0;
  final openedPaths = <String>[];

  tearDown(() async {
    for (final path in openedPaths) {
      final file = File(path);
      if (file.existsSync()) {
        await file.delete();
      }
    }
    openedPaths.clear();
  });

  Future<Database> openAt74({Future<void> Function(Database db)? seed}) async {
    final path =
        '${Directory.systemTemp.path}/customer_type_mig_${dbSeq++}.db';
    openedPaths.add(path);
    return openDatabase(
      path,
      version: 74,
      onCreate: (db, version) async {
        await db.execute('''
          CREATE TABLE customers (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            tax_id TEXT,
            phone TEXT,
            email TEXT,
            address TEXT,
            points_balance REAL NOT NULL,
            is_active INTEGER NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            sync_status TEXT NOT NULL,
            customer_code TEXT
          )
        ''');
        if (seed != null) {
          await seed(db);
        }
      },
    );
  }

  group('migration74_75 — customers.customer_type guarantee', () {
    test('adds the missing column to an upgraded database', () async {
      final db = await openAt74();
      await migration74_75.migrate(db);

      final columns = await db.rawQuery('PRAGMA table_info(customers)');
      expect(
        columns.where((c) => c['name'] == 'customer_type'),
        hasLength(1),
        reason: 'the guarded column add must not duplicate customer_type',
      );
    });

    test('is idempotent: running twice keeps a single column', () async {
      final db = await openAt74();
      await migration74_75.migrate(db);
      await migration74_75.migrate(db);

      final columns = await db.rawQuery('PRAGMA table_info(customers)');
      expect(
        columns.where((c) => c['name'] == 'customer_type'),
        hasLength(1),
      );
    });

    test('preserves existing rows (legacy null = PERSONA)', () async {
      final db = await openAt74(
        seed: (db) => db.insert('customers', {
          'id': 'c-legacy',
          'name': 'Cliente Antiguo',
          'tax_id': null,
          'phone': null,
          'email': null,
          'address': null,
          'points_balance': 0.0,
          'is_active': 1,
          'created_at': 0,
          'updated_at': 0,
          'sync_status': 'synced',
        }),
      );
      await migration74_75.migrate(db);

      final rows = await db.query('customers', where: 'id = ?', whereArgs: ['c-legacy']);
      expect(rows, hasLength(1));
      expect(rows.first['customer_type'], isNull);
    });
  });
}
