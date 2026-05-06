import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:pos_app/data/database/app_database.dart';
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

  group('InventoryDao Integration', () {
    test('processInventoryMovements should apply all movements and update stocks', () async {
      // 1. Setup initial stock
      await database.insumoDao.insertInsumos([
        InsumoEntity(id: 'i1', name: 'Insumo 1', consumptionUom: 'gr', stock: 100.0, averageCost: 1.0),
        InsumoEntity(id: 'i2', name: 'Insumo 2', consumptionUom: 'gr', stock: 50.0, averageCost: 2.0),
      ]);

      final movements = [
        MovementEntity(
          id: 'm1',
          insumoId: 'i1',
          type: 'SALE',
          quantity: -10.0,
          previousStock: 100.0,
          newStock: 90.0,
          timestamp: DateTime.now().toIso8601String(),
        ),
        MovementEntity(
          id: 'm2',
          insumoId: 'i2',
          type: 'SALE',
          quantity: -5.0,
          previousStock: 50.0,
          newStock: 45.0,
          timestamp: DateTime.now().toIso8601String(),
        ),
      ];

      // 2. Execute
      await database.inventoryDao.processInventoryMovements(movements);

      // 3. Verify
      final i1 = await database.insumoDao.findInsumoById('i1');
      final i2 = await database.insumoDao.findInsumoById('i2');
      expect(i1?.stock, 90.0);
      expect(i2?.stock, 45.0);

      final movs = await database.movementDao.findAllMovements();
      expect(movs.length, 2);
    });

    test('processInventoryMovements should rollback everything if one movement fails', () async {
      // 1. Setup initial stock
      await database.insumoDao.insertInsumos([
        InsumoEntity(id: 'i1', name: 'Insumo 1', consumptionUom: 'gr', stock: 100.0, averageCost: 1.0),
      ]);

      // Create a movement that will succeed
      final m1 = MovementEntity(
        id: 'm1',
        insumoId: 'i1',
        type: 'SALE',
        quantity: -10.0,
        previousStock: 100.0,
        newStock: 90.0,
        timestamp: DateTime.now().toIso8601String(),
      );

      // Create a movement that will fail (duplicate ID)
      final m2 = MovementEntity(
        id: 'm1', // Duplicate ID!
        insumoId: 'i1',
        type: 'SALE',
        quantity: -5.0,
        previousStock: 90.0,
        newStock: 85.0,
        timestamp: DateTime.now().toIso8601String(),
      );

      // 2. Execute & Expect error
      bool failed = false;
      try {
        await database.inventoryDao.processInventoryMovements([m1, m2]);
      } catch (e) {
        failed = true;
      }
      expect(failed, true, reason: 'Transaction should have failed due to duplicate ID');

      // 3. Verify rollback: Stock should still be 100, no movements should be saved
      final i1 = await database.insumoDao.findInsumoById('i1');
      expect(i1?.stock, 100.0);

      final movs = await database.movementDao.findAllMovements();
      expect(movs.isEmpty, true);
    });
  });
}
