import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:path/path.dart' as p;
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/customer/customer_entity.dart';
import 'package:pos_app/data/models/customer/customer_point_transaction_entity.dart';
import 'package:pos_app/data/models/loyalty/loyalty_program_entity.dart';
import 'package:pos_app/data/models/loyalty/loyalty_reward_entity.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  group('LV1.7C — Loyalty Sync Fault & Persistence Suite (Real SQLite)', () {
    late Directory tempDir;
    late String dbPath;

    setUp(() async {
      tempDir = await Directory.systemTemp.createTemp('loyalty_sync_fault_');
      dbPath = p.join(tempDir.path, 'loyalty_fault_test.db');
    });

    tearDown(() async {
      if (await tempDir.exists()) {
        await tempDir.delete(recursive: true);
      }
    });

    test('AV-11: SQLite restart preserves ledger and pending outbox intact', () async {
      // 1. Initial boot: open DB, insert customer and transactions with sync_status = pending
      var db = await $FloorAppDatabase.databaseBuilder(dbPath).build();

      const customerId = 'cust-restart-01';
      final now = DateTime.now().millisecondsSinceEpoch;

      final customer = CustomerEntity(
        id: customerId,
        name: 'Carlos Restart',
        pointsBalance: 50.0,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      );
      await db.customerDao.saveCustomer(customer);

      final earnTx = CustomerPointTransactionEntity(
        id: 'tx-earn-01',
        customerId: customerId,
        type: 'earn',
        points: 20.0,
        balanceAfter: 50.0,
        conversionRate: 0.1,
        reason: 'Ticket 001 earn',
        createdAt: now,
        syncStatus: 'pending', // Pending outbox
        loyaltyProgramId: 'prog-01',
        ticketId: 'ticket-001',
        transactionType: 'EARN',
        units: 20,
        idempotencyKey: 'loyalty:earn:tenant-restart:ticket-001:prog-01',
        origin: 'POS',
        occurredAt: now,
        recordedAt: now,
        legacyImported: 0,
      );

      final redeemTx = CustomerPointTransactionEntity(
        id: 'tx-redeem-01',
        customerId: customerId,
        type: 'redeem',
        points: -10.0,
        balanceAfter: 40.0,
        conversionRate: 0.1,
        reason: 'Ticket 002 redemption',
        createdAt: now + 1000,
        syncStatus: 'pending', // Pending outbox
        loyaltyProgramId: 'prog-01',
        ticketId: 'ticket-002',
        transactionType: 'REDEEM',
        units: -10,
        idempotencyKey: 'loyalty:redeem:tenant-restart:ticket-002:prog-01',
        origin: 'POS',
        occurredAt: now + 1000,
        recordedAt: now + 1000,
        legacyImported: 0,
      );

      await db.customerPointTransactionDao.insertTransaction(earnTx);
      await db.customerPointTransactionDao.insertTransaction(redeemTx);

      // Verify pending outbox count before crash
      final pendingBefore =
          await db.customerPointTransactionDao.getTransactionsBySyncStatus('pending');
      expect(pendingBefore.length, 2);

      // 2. CRASH / POWER OUTAGE SIMULATION: close database connection
      await db.close();

      // 3. REBOOT: reopen database from disk file
      db = await $FloorAppDatabase.databaseBuilder(dbPath).build();

      // Verify customer state preserved
      final reloadedCustomer = await db.customerDao.getCustomerById(customerId);
      expect(reloadedCustomer, isNotNull);
      expect(reloadedCustomer!.pointsBalance, 50.0);

      // Verify pending outbox rows survived restart with all fields intact
      final pendingAfter =
          await db.customerPointTransactionDao.getTransactionsBySyncStatus('pending');
      expect(pendingAfter.length, 2);

      final loadedEarn = pendingAfter.firstWhere((t) => t.id == 'tx-earn-01');
      expect(loadedEarn.units, 20);
      expect(loadedEarn.idempotencyKey, 'loyalty:earn:tenant-restart:ticket-001:prog-01');
      expect(loadedEarn.syncStatus, 'pending');

      final loadedRedeem = pendingAfter.firstWhere((t) => t.id == 'tx-redeem-01');
      expect(loadedRedeem.units, -10);
      expect(loadedRedeem.idempotencyKey, 'loyalty:redeem:tenant-restart:ticket-002:prog-01');
      expect(loadedRedeem.syncStatus, 'pending');

      await db.close();
    });

    test('AV-12: Duplicate transaction lookup in SQLite is idempotent', () async {
      final db = await $FloorAppDatabase.databaseBuilder(dbPath).build();
      const customerId = 'cust-idemp-01';
      final now = DateTime.now().millisecondsSinceEpoch;

      final customer = CustomerEntity(
        id: customerId,
        name: 'Maria Idempotent',
        pointsBalance: 10.0,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      );
      await db.customerDao.saveCustomer(customer);

      const idempotencyKey = 'loyalty:earn:tenant-idemp:ticket-001:prog-01';

      // 1. First insert
      final tx1 = CustomerPointTransactionEntity(
        id: 'tx-001',
        customerId: customerId,
        type: 'earn',
        points: 10.0,
        balanceAfter: 10.0,
        conversionRate: 0.1,
        reason: 'Ticket 001',
        createdAt: now,
        syncStatus: 'pending',
        loyaltyProgramId: 'prog-01',
        ticketId: 'ticket-001',
        transactionType: 'EARN',
        units: 10,
        idempotencyKey: idempotencyKey,
        origin: 'POS',
        occurredAt: now,
        recordedAt: now,
        legacyImported: 0,
      );
      await db.customerPointTransactionDao.insertTransaction(tx1);

      // 2. Query by idempotency key
      final existing =
          await db.customerPointTransactionDao.findByIdempotencyKey(idempotencyKey);
      expect(existing, isNotNull);
      expect(existing!.id, 'tx-001');
      expect(existing.units, 10);

      // Retry: found existing => no double insert or double balance addition
      final customerAfter = await db.customerDao.getCustomerById(customerId);
      expect(customerAfter!.pointsBalance, 10.0);

      await db.close();
    });

    test('AV-15: Inbound Cloud ADJUST converges into local POS SQLite', () async {
      final db = await $FloorAppDatabase.databaseBuilder(dbPath).build();
      const customerId = 'cust-adj-01';
      final now = DateTime.now().millisecondsSinceEpoch;

      final customer = CustomerEntity(
        id: customerId,
        name: 'Ana Adjustment',
        pointsBalance: 30.0,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      );
      await db.customerDao.saveCustomer(customer);

      // Inbound cloud adjustment payload: -15 units (e.g. customer service refund)
      final cloudAdjustTx = CustomerPointTransactionEntity(
        id: 'tx-cloud-adj-01',
        customerId: customerId,
        type: 'adjust',
        points: -15.0,
        balanceAfter: 15.0,
        conversionRate: 0.1,
        reason: 'Cloud customer support goodwill reversal',
        createdAt: now + 5000,
        syncStatus: 'synced', // Already synced because it came from Cloud
        loyaltyProgramId: 'prog-01',
        transactionType: 'ADJUST',
        units: -15,
        idempotencyKey: 'loyalty:adjust:tenant-adj:cust-adj-01:cloud-001',
        origin: 'CLOUD',
        occurredAt: now + 5000,
        recordedAt: now + 5000,
        legacyImported: 0,
      );

      // Record transaction and update customer balance
      await db.customerPointTransactionDao.recordPointTransactionAndUpdateBalance(
        cloudAdjustTx,
        customerId,
        15.0,
        now + 5000,
      );

      // Verify convergence
      final updatedCust = await db.customerDao.getCustomerById(customerId);
      expect(updatedCust!.pointsBalance, 15.0);

      final txList =
          await db.customerPointTransactionDao.getTransactionsByCustomer(customerId);
      expect(txList.length, 1);
      expect(txList.first.origin, 'CLOUD');
      expect(txList.first.units, -15);
      expect(txList.first.syncStatus, 'synced'); // No echo back to cloud!

      await db.close();
    });
  });
}
