import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:mockito/annotations.dart';
import 'package:pos_app/data/repositories/inventory/inventory_repository_impl.dart';
import 'package:pos_app/data/daos/inventory/insumo_dao.dart';
import 'package:pos_app/data/daos/inventory/movement_dao.dart';
import 'package:pos_app/data/daos/inventory/recipe_dao.dart';
import 'package:pos_app/data/daos/inventory/supplier_dao.dart';
import 'package:pos_app/data/daos/inventory/warehouse_dao.dart';
import 'package:pos_app/data/daos/inventory/uom_conversion_dao.dart';
import 'package:pos_app/data/daos/inventory/batch_dao.dart';
import 'package:pos_app/data/daos/inventory/purchase_dao.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:dio/dio.dart';
import 'package:pos_app/data/models/inventory/movement_entity.dart';

import 'inventory_repository_impl_test.mocks.dart';

@GenerateMocks([
  InsumoDao,
  RecipeDao,
  MovementDao,
  SupplierDao,
  WarehouseDao,
  UomConversionDao,
  BatchDao,
  PurchaseDao,
  Dio,
  AppDatabase,
])
void main() {
  late InventoryRepositoryImpl repository;
  late MockMovementDao mockMovementDao;

  setUp(() {
    mockMovementDao = MockMovementDao();
    repository = InventoryRepositoryImpl(
      insumoDao: MockInsumoDao(),
      recipeDao: MockRecipeDao(),
      movementDao: mockMovementDao,
      supplierDao: MockSupplierDao(),
      warehouseDao: MockWarehouseDao(),
      uomConversionDao: MockUomConversionDao(),
      batchDao: MockBatchDao(),
      purchaseDao: MockPurchaseDao(),
      dio: MockDio(),
      database: MockAppDatabase(),
    );
  });

  group('InventoryRepositoryImpl - Sync', () {
    test('getUnsyncedMovements should call MovementDao', () async {
      final entities = [
        MovementEntity(
          id: '1',
          insumoId: 'ins-1',
          type: 'SALE',
          quantity: 1,
          previousStock: 10,
          newStock: 9,
          timestamp: DateTime.now().toIso8601String(),
          isSynced: false,
        ),
      ];

      when(mockMovementDao.findUnsyncedMovements())
          .thenAnswer((_) async => entities);

      final result = await repository.getUnsyncedMovements();

      expect(result.length, 1);
      expect(result[0].id, '1');
      verify(mockMovementDao.findUnsyncedMovements()).called(1);
    });

    test('markMovementAsSynced should call MovementDao', () async {
      when(mockMovementDao.markAsSynced(any)).thenAnswer((_) async => {});

      await repository.markMovementAsSynced('1');

      verify(mockMovementDao.markAsSynced('1')).called(1);
    });
  });
}
