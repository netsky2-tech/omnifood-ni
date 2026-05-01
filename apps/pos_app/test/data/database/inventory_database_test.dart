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

  group('Inventory Database Integration', () {
    test('should record movement and update stock in transaction-like flow', () async {
      final insumo = InsumoEntity(
        id: 'ins-1',
        name: 'Leche',
        consumptionUom: 'ml',
        stock: 1000.0,
        averageCost: 0.05,
      );

      await database.insumoDao.insertInsumos([insumo]);

      // Record a sale movement
      final movement = MovementEntity(
        id: 'mov-1',
        insumoId: 'ins-1',
        type: 'SALE',
        quantity: -200.0,
        previousStock: 1000.0,
        newStock: 800.0,
        timestamp: DateTime.now().toIso8601String(),
      );

      await database.movementDao.insertMovement(movement);
      await database.insumoDao.updateStock('ins-1', 800.0);

      // Verify
      final updatedInsumo = await database.insumoDao.findInsumoById('ins-1');
      expect(updatedInsumo?.stock, 800.0);

      final movements = await database.movementDao.findAllMovements();
      expect(movements.length, 1);
      expect(movements.first.type, 'SALE');
    });
  });
}
