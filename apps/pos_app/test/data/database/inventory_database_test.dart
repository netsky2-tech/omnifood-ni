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

    test('should save and retrieve batch_deductions in MovementEntity', () async {
      final movement = MovementEntity(
        id: 'mov-batch-1',
        insumoId: 'ins-1',
        type: 'SALE',
        quantity: -2.0,
        previousStock: 10.0,
        newStock: 8.0,
        timestamp: DateTime.now().toIso8601String(),
        batch_deductions: '[{"batchId":"b1","quantity":2.0}]',
      );

      await database.movementDao.insertMovement(movement);

      final retrieved = await database.movementDao.findAllMovements();
      final savedMovement = retrieved.firstWhere((m) => m.id == 'mov-batch-1');
      expect(savedMovement.batch_deductions, '[{"batchId":"b1","quantity":2.0}]');
    });

    test('should find insumos by multiple ids', () async {
      final insumos = [
        InsumoEntity(id: 'i1', name: 'Insumo 1', consumptionUom: 'u1', stock: 10, averageCost: 0),
        InsumoEntity(id: 'i2', name: 'Insumo 2', consumptionUom: 'u2', stock: 20, averageCost: 0),
        InsumoEntity(id: 'i3', name: 'Insumo 3', consumptionUom: 'u3', stock: 30, averageCost: 0),
      ];
      await database.insumoDao.insertInsumos(insumos);

      final result = await database.insumoDao.findInsumosByIds(['i1', 'i3']);

      expect(result.length, 2);
      expect(result.any((e) => e.id == 'i1'), true);
      expect(result.any((e) => e.id == 'i3'), true);
      expect(result.any((e) => e.id == 'i2'), false);
    });
  });
}

