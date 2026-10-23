import 'package:flutter/widgets.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/database/migrations.dart';
import 'package:pos_app/data/mappers/customer_mapper.dart';
import 'package:pos_app/data/models/customer/customer_entity.dart';
import 'package:sqflite/sqflite.dart';

/// On-device verification entrypoint (#952).
///
/// Runs against the REAL Android SQLite engine and reports the outcome through
/// logcat, avoiding the VM-Service/DDS bridge that is unreliable under WSL2.
///
///   flutter build apk --debug -t tool/customer_type_device_check.dart
///   adb install -r build/app/outputs/flutter-apk/app-debug.apk
///   adb shell am start -n com.nhilos.pos_app/.MainActivity
///   adb logcat -d | grep CT_E2E_RESULT
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final log = <String>[];
  var ok = true;

  void check(bool condition, String label) {
    ok = ok && condition;
    log.add('${condition ? 'OK' : 'FAIL'}:$label');
  }

  const freshDb = 'ct_device_fresh.db';
  const upgradeDb = 'ct_device_upgrade.db';

  Future<void> clean(String name) async {
    final path = await databaseFactory.getDatabasesPath();
    await databaseFactory.deleteDatabase('$path/$name');
  }

  try {
    // 1. Fresh install: schema + EMPRESA round-trip.
    await clean(freshDb);
    final fresh = await $FloorAppDatabase
        .databaseBuilder(freshDb)
        .addMigrations(allMigrations)
        .build();
    try {
      final columns =
          await fresh.database.rawQuery('PRAGMA table_info(customers)');
      check(
        columns.where((c) => c['name'] == 'customer_type').length == 1,
        'fresh_has_customer_type_column',
      );

      final empresa = CustomerEntity(
        id: 'cust-empresa',
        name: 'Distribuidora Central S.A.',
        pointsBalance: 0.0,
        createdAt: 0,
        updatedAt: 0,
        syncStatus: 'pending',
        customerType: 'EMPRESA',
      );
      await fresh.customerDao.saveCustomer(empresa);
      final read = await fresh.customerDao.getCustomerById('cust-empresa');
      check(read?.customerType == 'EMPRESA', 'persist_empresa');
      check(
        CustomerMapper.toDomain(read!).customerType == 'EMPRESA',
        'mapper_empresa',
      );
    } finally {
      await fresh.close();
      await clean(freshDb);
    }

    // 2. Upgrade v74 -> v75: column added, legacy row preserved.
    await clean(upgradeDb);
    final base = await databaseFactory.getDatabasesPath();
    final raw = await openDatabase(
      '$base/$upgradeDb',
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
        await db.insert('customers', {
          'id': 'c-legacy',
          'name': 'Cliente Antiguo',
          'points_balance': 0.0,
          'is_active': 1,
          'created_at': 0,
          'updated_at': 0,
          'sync_status': 'synced',
        });
      },
    );
    await raw.close();

    final upgraded = await $FloorAppDatabase
        .databaseBuilder(upgradeDb)
        .addMigrations(allMigrations)
        .build();
    try {
      final columns =
          await upgraded.database.rawQuery('PRAGMA table_info(customers)');
      check(
        columns.where((c) => c['name'] == 'customer_type').length == 1,
        'upgrade_has_customer_type_column',
      );
      final legacy = await upgraded.customerDao.getCustomerById('c-legacy');
      check(legacy != null && legacy.customerType == null, 'upgrade_legacy_row');
    } finally {
      await upgraded.close();
      await clean(upgradeDb);
    }
  } catch (e, st) {
    ok = false;
    log.add('EXCEPTION:$e');
    debugPrint('CT_E2E_STACK $st');
  }

  debugPrint('CT_E2E_RESULT ${ok ? 'PASS' : 'FAIL'} :: ${log.join(' | ')}');
  runApp(const SizedBox.shrink());
}
