import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/sales/invoice_entity.dart';
import 'package:pos_app/data/models/audit_log_entity.dart';

void main() {
  late AppDatabase database;

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  setUp(() async {
    database = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();
  });

  tearDown(() async {
    await database.close();
  });

  group('SalesTransactionDao Integrity', () {
    test('executeSaleTransaction should insert audit log inside transaction', () async {
      final invoice = InvoiceEntity(
        id: 'inv1',
        number: '001',
        createdAt: DateTime.now().millisecondsSinceEpoch,
        userId: 'u1',
        subtotal: 100,
        totalTax: 15,
        total: 115,
        type: 'regular',
      );

      final auditLog = AuditLogEntity(
        remoteRefUuid: '11111111-1111-4111-8111-111111111111',
        userId: 'u-1',
        action: 'SALE_CREATED',
        timestamp: DateTime.now().toIso8601String(),
        deviceId: 'device-1',
        metadata: '{"invoice_id": "${invoice.id}"}',
        sequenceNo: 1,
        prevHash: 'none',
        entryHash: 'hash',
      );

      // This will fail to compile initially because auditLog parameter doesn't exist
      await database.salesTransactionDao.executeSaleTransaction(
        invoice,
        [],
        [],
        [],
        [],
        auditLog,
        false, // shouldFail
      );

      final savedInvoice = await database.invoiceDao.getInvoiceById('inv1');
      final logs = await database.auditDao.findAllLogs();

      expect(savedInvoice, isNotNull);
      expect(logs, hasLength(1));
      expect(logs.first.action, 'SALE_CREATED');
      expect(logs.first.metadata, contains('inv1'));
    });

    test('executeSaleTransaction should rollback audit log if transaction fails', () async {
      final invoice = InvoiceEntity(
        id: 'inv1',
        number: '001',
        createdAt: DateTime.now().millisecondsSinceEpoch,
        userId: 'u1',
        subtotal: 100,
        totalTax: 15,
        total: 115,
        type: 'regular',
      );

      final auditLog = AuditLogEntity(
        remoteRefUuid: '22222222-2222-4222-8222-222222222222',
        userId: 'u-1',
        action: 'SALE_CREATED',
        timestamp: DateTime.now().toIso8601String(),
        deviceId: 'device-1',
        metadata: '{"invoice_id": "${invoice.id}"}',
        sequenceNo: 1,
        prevHash: 'none',
        entryHash: 'hash',
      );

      // Force failure by inserting duplicate invoice afterwards in the same transaction
      // Wait, Floor transactions are atomic. If I throw inside the method, it should rollback.
      
      try {
        await database.salesTransactionDao.executeSaleTransaction(
          invoice,
          [],
          [],
          [],
          [],
          auditLog,
          true, // shouldFail
        );
      } catch (_) {}

      final logs = await database.auditDao.findAllLogs();
      expect(logs, isEmpty);
    });

    test('executeSaleTransaction should throw exception if credit note exceeds original total', () async {
      final original = InvoiceEntity(
        id: 'inv1',
        number: '001',
        createdAt: DateTime.now().millisecondsSinceEpoch,
        userId: 'u1',
        subtotal: 100,
        totalTax: 0,
        total: 100,
        type: 'regular',
      );

      await database.invoiceDao.insertInvoice(original);

      final creditNote = InvoiceEntity(
        id: 'cn1',
        number: 'CN001',
        createdAt: DateTime.now().millisecondsSinceEpoch,
        userId: 'u1',
        subtotal: 110, // Exceeds original
        totalTax: 0,
        total: 110,
        type: 'creditNote',
        relatedInvoiceId: 'inv1',
      );

      expect(
        () => database.salesTransactionDao.executeSaleTransaction(
          creditNote,
          [],
          [],
          [],
          [],
          null,
          false,
        ),
        throwsA(isA<Exception>()),
      );

      final savedCN = await database.invoiceDao.getInvoiceById('cn1');
      expect(savedCN, isNull);
    });

    test('executeSaleTransaction should allow credit note if within original total', () async {
      final original = InvoiceEntity(
        id: 'inv1',
        number: '001',
        createdAt: DateTime.now().millisecondsSinceEpoch,
        userId: 'u1',
        subtotal: 100,
        totalTax: 0,
        total: 100,
        type: 'regular',
      );

      await database.invoiceDao.insertInvoice(original);

      final creditNote = InvoiceEntity(
        id: 'cn1',
        number: 'CN001',
        createdAt: DateTime.now().millisecondsSinceEpoch,
        userId: 'u1',
        subtotal: 40,
        totalTax: 0,
        total: 40,
        type: 'creditNote',
        relatedInvoiceId: 'inv1',
      );

      await database.salesTransactionDao.executeSaleTransaction(
        creditNote,
        [],
        [],
        [],
        [],
        null,
        false,
      );

      final savedCN = await database.invoiceDao.getInvoiceById('cn1');
      expect(savedCN, isNotNull);
    });
  });
}
