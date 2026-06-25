import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/sales/invoice_entity.dart';
import 'package:pos_app/data/models/audit_log_entity.dart';
import 'package:pos_app/data/models/inventory/insumo_entity.dart';
import 'package:pos_app/data/models/inventory/movement_entity.dart';

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

  group('executeVoidTransaction atomicity', () {
    InvoiceEntity buildInvoice({required String id, required bool canceled}) =>
        InvoiceEntity(
          id: id,
          number: '001',
          createdAt: DateTime.now().millisecondsSinceEpoch,
          userId: 'u1',
          subtotal: 100,
          totalTax: 15,
          total: 115,
          isCanceled: canceled,
          syncStatus: 'synced',
          paymentStatus: 'paid',
          type: 'regular',
        );

    MovementEntity buildMovement({
      required String id,
      required String insumoId,
      required double previousStock,
      required double newStock,
}) =>
        MovementEntity(
          id: id,
          insumoId: insumoId,
          type: 'sale',
          quantity: newStock - previousStock, // positive reversal
          previousStock: previousStock,
          newStock: newStock,
          timestamp: DateTime.now().toIso8601String(),
          reason: 'Anulacion Factura: 001',
          userId: 'u1',
        );

    AuditLogEntity buildAudit(String action, int seq, String uuid) => AuditLogEntity(
          remoteRefUuid: uuid,
          userId: 'u1',
          action: action,
          timestamp: DateTime.now().toIso8601String(),
          deviceId: 'device-1',
          metadata: '{"invoice_id": "inv-void"}',
          sequenceNo: seq,
          prevHash: 'prev',
          entryHash: 'hash-$seq',
        );

    test(
      'commits reversal movement + stock + isCanceled + audit log together',
      () async {
        await database.insumoDao.insertInsumos([
          InsumoEntity(
            id: 'ins-1',
            name: 'Pan',
            consumptionUom: 'un',
            stock: 8,
            averageCost: 10,
          ),
        ]);
        await database.invoiceDao.insertInvoice(buildInvoice(id: 'inv-void', canceled: false));

        await database.salesTransactionDao.executeVoidTransaction(
          [buildMovement(id: 'mov-1', insumoId: 'ins-1', previousStock: 8, newStock: 9)],
          buildInvoice(id: 'inv-void', canceled: true),
          buildAudit('SALE_VOIDED', 1, '11111111-1111-4111-8111-111111111111'),
          false, // shouldFail
        );

        // All four writes committed as one unit.
        final invoice = await database.invoiceDao.getInvoiceById('inv-void');
        expect(invoice!.isCanceled, isTrue); // cancellation flag persisted
        final movements = await database.movementDao.findAllMovements();
        expect(movements, hasLength(1)); // reversal movement persisted
        final insumo = await database.insumoDao.findInsumoById('ins-1');
        expect(insumo!.stock, 9); // stock updated atomically
        final logs = await database.auditDao.findAllLogs();
        expect(logs, hasLength(1)); // audit persisted atomically
        expect(logs.first.action, 'SALE_VOIDED');
      },
    );

    test(
      'rolls back every write when a DAO write fails AFTER reversal movements, stock and the isCanceled flag have been written',
      () async {
        // Preconditions: two insumos (so the loop performs two
        // movement + stock writes) and one active invoice.
        await database.insumoDao.insertInsumos([
          InsumoEntity(
            id: 'ins-1',
            name: 'Pan',
            consumptionUom: 'un',
            stock: 8,
            averageCost: 10,
          ),
          InsumoEntity(
            id: 'ins-2',
            name: 'Queso',
            consumptionUom: 'gr',
            stock: 5,
            averageCost: 2,
          ),
        ]);
        await database.invoiceDao.insertInvoice(buildInvoice(id: 'inv-void', canceled: false));

        final movements = [
          buildMovement(id: 'mov-1', insumoId: 'ins-1', previousStock: 8, newStock: 9),
          buildMovement(id: 'mov-2', insumoId: 'ins-2', previousStock: 5, newStock: 6),
        ];

        // shouldFail = true throws AFTER all inner writes have run
        // (both reversal movements + both stock updates + the
        // isCanceled invoice update + the audit log insert). Floor must
        // roll the whole @transaction back, so no partial cancellation
        // / reversal / audit state can be left committed — this is the
        // exact blocker scenario (a DAO failure after a reversal
        // movement/stock write started).
        await expectLater(
          database.salesTransactionDao.executeVoidTransaction(
            movements,
            buildInvoice(id: 'inv-void', canceled: true),
            buildAudit('SALE_VOIDED', 1, '22222222-2222-4222-8222-222222222222'),
            true, // shouldFail: force failure after every inner write
          ),
          throwsA(isA<Object>()),
        );

        // No partial reversal state committed.
        final persistedMovements = await database.movementDao.findAllMovements();
        expect(persistedMovements, isEmpty); // both movements rolled back
        final ins1 = await database.insumoDao.findInsumoById('ins-1');
        expect(ins1!.stock, 8); // stock NOT mutated by the rolled-back write
        final ins2 = await database.insumoDao.findInsumoById('ins-2');
        expect(ins2!.stock, 5); // stock NOT mutated by the rolled-back write
        // No partial cancellation committed: the invoice is still active.
        final invoice = await database.invoiceDao.getInvoiceById('inv-void');
        expect(invoice!.isCanceled, isFalse); // DGI: never left canceled without reversal
        // No partial audit committed.
        final logs = await database.auditDao.findAllLogs();
        expect(logs, isEmpty);
      },
    );
  });
}
