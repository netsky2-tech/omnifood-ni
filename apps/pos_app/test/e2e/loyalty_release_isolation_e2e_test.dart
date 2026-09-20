import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/customer/customer_entity.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

import '../support/loyalty_release_harness.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  const deviceTenantId = 'tenant-foodpark-losrobles-01';
  const customerId = 'c-customer-9842';
  const customerCode = '01B1TEST00000001';
  const programId = 'prog-spend-device-tenant';

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  Future<LoyaltyReleaseHarness> createHarness() async {
    final directory = await Directory.systemTemp.createTemp(
      'loyalty_release_probe_',
    );
    final harness = LoyaltyReleaseHarness(directory);
    await harness.createLegacyV10Database();
    return harness;
  }

  Future<void> disposeHarness(LoyaltyReleaseHarness harness) async {
    await harness.close();
    if (harness.directory.existsSync()) {
      await harness.directory.delete(recursive: true);
    }
  }

  group('Loyalty release harness — migrated file-backed SQLite baseline', () {
    test('[CONTROL-sqlite-schema] migrations 10->53 build the Loyalty schema '
        'and it survives close/reopen', () async {
      final harness = await createHarness();
      try {
        // Pre-open guard: the file must be the untouched v10 baseline, so a
        // missing/empty file cannot silently fall into Floor onCreate.
        await harness.verifyLegacyBaseline();
        final db = await harness.openMigratedDatabase();
        expect(
          await LoyaltyReleaseHarness.userVersion(db),
          LoyaltyReleaseHarness.currentSchemaVersion,
          reason: 'the migrated file must reach the current schema version',
        );
        final expected = LoyaltyReleaseHarness.requiredLoyaltyColumns;
        for (final entry in expected.entries) {
          expect(
            await LoyaltyReleaseHarness.tableColumns(db, entry.key),
            containsAll(entry.value),
            reason: 'migrated ${entry.key} must expose all probe columns',
          );
        }
        await harness.close();

        // Restart boundary: reopen the same file through Floor; the Loyalty
        // schema must survive and real DAOs must run against it.
        final reopened = await harness.openMigratedDatabase();
        for (final table in expected.keys) {
          expect(
            await LoyaltyReleaseHarness.tableColumns(reopened, table),
            containsAll(expected[table]!),
          );
        }
        expect(
          await reopened.loyaltyProgramDao.getActivePrograms(deviceTenantId),
          isEmpty,
          reason: 'real DAO queries must run against the migrated schema',
        );
      } finally {
        await disposeHarness(harness);
      }
    });

    test('[B4-sqlite] migrated SQLite rejects two ledger movements with '
        'distinct ids sharing one idempotency key', () async {
      final harness = await createHarness();
      try {
        final db = await harness.openMigratedDatabase();
        final now = DateTime.now().millisecondsSinceEpoch;
        Map<String, Object?> movement(String id) => {
          'id': id,
          'customer_id': customerId,
          'type': 'earn',
          'points': 15.0,
          'balance_after': 15.0,
          'conversion_rate': 0.1,
          'created_at': now,
          'sync_status': 'pending',
          'loyalty_program_id': programId,
          'ticket_id': 'ticket-b4-1',
          'transaction_type': 'EARN',
          'units': 15,
          'idempotency_key': 'loyalty:earn:$deviceTenantId:ticket-b4-1',
          'origin': 'POS',
        };

        await db.database.insert(
          'customer_point_transactions',
          movement('ledger-b4-first'),
        );

        // Correct behavior: the database must enforce ledger idempotency
        // (arch §5.3) with a real SQLite uniqueness violation. RED until T2
        // adds the migrated unique constraint; today the duplicate is
        // accepted, so no DatabaseException is emitted at all.
        await expectLater(
          db.database.insert(
            'customer_point_transactions',
            movement('ledger-b4-duplicate'),
          ),
          throwsA(
            isA<DatabaseException>().having(
              (error) => error.toString(),
              'resultCode',
              contains('UNIQUE constraint failed'),
            ),
          ),
          reason: '[B4-sqlite] duplicate idempotency key must be rejected by '
              'the migrated SQLite ledger with a uniqueness violation',
        );
      } finally {
        await disposeHarness(harness);
      }
    });

    test('[B9] migrated customers table supports real CustomerDao '
        'save/read by customer_code', () async {
      final harness = await createHarness();
      try {
        final db = await harness.openMigratedDatabase();

        // Correct behavior: the production customer path (save + Crockford
        // code lookup) must work on a migrated database. RED today because
        // no migration 10->53 creates `customers.customer_code` (the column
        // only exists on Floor-onCreate fresh installs), so the generated
        // saveCustomer INSERT fails on the migrated schema.
        await db.customerDao.saveCustomer(
          CustomerEntity(
            id: customerId,
            name: 'Cliente Aislado B9',
            taxId: '001-150692-0003K',
            phone: '88990011',
            pointsBalance: 120.0,
            isActive: true,
            customerCode: customerCode,
            createdAt: DateTime.now().millisecondsSinceEpoch,
            updatedAt: DateTime.now().millisecondsSinceEpoch,
          ),
        );

        final loaded = await db.customerDao.getCustomerByCode(customerCode);
        expect(
          loaded,
          isNotNull,
          reason: '[B9] customer saved through the real DAO must be readable '
              'by customer_code on the migrated database',
        );
        expect(loaded!.id, customerId);
      } finally {
        await disposeHarness(harness);
      }
    });
  });
}
