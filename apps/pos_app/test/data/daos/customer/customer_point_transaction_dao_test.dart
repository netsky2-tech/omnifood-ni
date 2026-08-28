import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/customer/customer_entity.dart';
import 'package:pos_app/data/models/customer/customer_point_transaction_entity.dart';
import 'package:pos_app/data/mappers/customer_mapper.dart';
import 'package:pos_app/domain/models/sales/customer_point_transaction.dart';
import 'package:pos_app/domain/models/sales/invoice.dart';

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

  group('CustomerPointTransactionDao - Floor SQLite Integration Tests', () {
    test('registra transacción y actualiza atómicamente el saldo del cliente', () async {
      // 1. Crear cliente inicial con 100 puntos
      final now = DateTime.now().millisecondsSinceEpoch;
      final customer = CustomerEntity(
        id: 'cust-1',
        name: 'Roberto Gómez',
        taxId: '001-200390-0002A',
        phone: '88889999',
        email: 'roberto@gmail.com',
        address: 'Managua, Nicaragua',
        pointsBalance: 100.0,
        isActive: true,
        createdAt: now,
        updatedAt: now,
        syncStatus: 'synced',
      );
      await database.customerDao.saveCustomer(customer);

      // 2. Ejecutar transacción de redención de 50 puntos (queda en 50.0)
      final txRedeem = CustomerPointTransactionEntity(
        id: 'tx-001',
        customerId: 'cust-1',
        invoiceId: 'inv-001',
        type: 'redeem',
        points: -50.0,
        balanceAfter: 50.0,
        conversionRate: 0.1,
        reason: 'Redención en checkout',
        createdAt: now + 1000,
        syncStatus: 'pending',
      );

      await database.customerPointTransactionDao
          .recordPointTransactionAndUpdateBalance(
        txRedeem,
        'cust-1',
        50.0,
        now + 1000,
      );

      // Verificar que el saldo del cliente se actualizó en la tabla customers
      final updatedCust = await database.customerDao.getCustomerById('cust-1');
      expect(updatedCust?.pointsBalance, equals(50.0));

      // Verificar que la transacción quedó en el ledger
      final history = await database.customerPointTransactionDao
          .getTransactionsByCustomer('cust-1');
      expect(history.length, equals(1));
      expect(history.first.id, equals('tx-001'));
      expect(history.first.points, equals(-50.0));
      expect(history.first.balanceAfter, equals(50.0));
    });

    test('preserva historial inmutable ordenado por created_at DESC', () async {
      final now = DateTime.now().millisecondsSinceEpoch;
      final tx1 = CustomerPointTransactionEntity(
        id: 'tx-1',
        customerId: 'cust-2',
        type: 'earn',
        points: 20.0,
        balanceAfter: 20.0,
        conversionRate: 0.1,
        createdAt: now,
      );
      final tx2 = CustomerPointTransactionEntity(
        id: 'tx-2',
        customerId: 'cust-2',
        type: 'earn',
        points: 30.0,
        balanceAfter: 50.0,
        conversionRate: 0.1,
        createdAt: now + 5000,
      );

      await database.customerPointTransactionDao.insertTransactions([tx1, tx2]);

      final history = await database.customerPointTransactionDao
          .getTransactionsByCustomer('cust-2');

      expect(history.length, equals(2));
      // El más reciente (tx-2) primero
      expect(history.first.id, equals('tx-2'));
      expect(history.last.id, equals('tx-1'));
    });

    test('CustomerMapper convierte bidireccionalmente entre dominio y entidad', () {
      final domain = CustomerPointTransaction(
        id: 'tx-map',
        customerId: 'cust-map',
        invoiceId: 'inv-map',
        type: PointTransactionType.redeem,
        points: -30.0,
        balanceAfter: 70.0,
        conversionRate: 0.1,
        reason: 'Descuento aplicado',
        createdAt: DateTime.fromMillisecondsSinceEpoch(1760000000000),
        syncStatus: SyncStatus.pending,
      );

      final entity = CustomerMapper.toPointTransactionEntity(domain);
      expect(entity.id, equals('tx-map'));
      expect(entity.type, equals('redeem'));
      expect(entity.points, equals(-30.0));

      final roundtrip = CustomerMapper.toPointTransactionDomain(entity);
      expect(roundtrip, equals(domain));
    });
  });
}
