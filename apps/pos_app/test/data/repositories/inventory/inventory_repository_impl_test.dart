import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:mockito/annotations.dart';
import 'package:pos_app/data/repositories/inventory/inventory_repository_impl.dart';
import 'package:pos_app/data/daos/inventory/insumo_dao.dart';
import 'package:pos_app/data/daos/inventory/movement_dao.dart';
import 'package:pos_app/data/daos/inventory/recipe_dao.dart';
import 'package:pos_app/data/daos/inventory/recipe_version_document_dao.dart';
import 'package:pos_app/data/daos/inventory/production_order_document_dao.dart';
import 'package:pos_app/data/daos/inventory/supplier_dao.dart';
import 'package:pos_app/data/daos/inventory/warehouse_dao.dart';
import 'package:pos_app/data/daos/inventory/uom_conversion_dao.dart';
import 'package:pos_app/data/daos/inventory/batch_dao.dart';
import 'package:pos_app/data/daos/inventory/purchase_dao.dart';
import 'package:pos_app/data/daos/inventory/forensic_alert_dao.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:dio/dio.dart';
import 'package:pos_app/data/models/inventory/movement_entity.dart';
import 'package:pos_app/data/models/inventory/insumo_entity.dart';
import 'package:pos_app/data/models/inventory/recipe_version_document_entity.dart';

import 'inventory_repository_impl_test.mocks.dart';

@GenerateMocks([
  InsumoDao,
  RecipeDao,
  RecipeVersionDocumentDao,
  ProductionOrderDocumentDao,
  MovementDao,
  SupplierDao,
  WarehouseDao,
  UomConversionDao,
  BatchDao,
  PurchaseDao,
  ForensicAlertDao,
  Dio,
  AppDatabase,
])
void main() {
  late InventoryRepositoryImpl repository;
  late MockMovementDao mockMovementDao;
  late MockInsumoDao mockInsumoDao;
  late MockRecipeVersionDocumentDao mockRecipeVersionDocumentDao;

  setUp(() {
    mockMovementDao = MockMovementDao();
    mockInsumoDao = MockInsumoDao();
    mockRecipeVersionDocumentDao = MockRecipeVersionDocumentDao();
    repository = InventoryRepositoryImpl(
      insumoDao: mockInsumoDao,
      recipeDao: MockRecipeDao(),
      recipeVersionDocumentDao: mockRecipeVersionDocumentDao,
      productionOrderDocumentDao: MockProductionOrderDocumentDao(),
      movementDao: mockMovementDao,
      supplierDao: MockSupplierDao(),
      warehouseDao: MockWarehouseDao(),
      uomConversionDao: MockUomConversionDao(),
      batchDao: MockBatchDao(),
      purchaseDao: MockPurchaseDao(),
      forensicAlertDao: MockForensicAlertDao(),
      dio: MockDio(),
      database: MockAppDatabase(),
    );
  });

  group('InventoryRepositoryImpl - Insumos', () {
    test('getInsumosByIds should call InsumoDao', () async {
      final entities = [
        InsumoEntity(
          id: 'i1',
          name: 'Insumo 1',
          consumptionUom: 'u1',
          stock: 10,
          averageCost: 0,
        ),
      ];

      when(
        mockInsumoDao.findInsumosByIds(['i1']),
      ).thenAnswer((_) async => entities);

      final result = await repository.getInsumosByIds(['i1']);

      expect(result.length, 1);
      expect(result[0].id, 'i1');
      verify(mockInsumoDao.findInsumosByIds(['i1'])).called(1);
    });
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

      when(
        mockMovementDao.findUnsyncedMovements(),
      ).thenAnswer((_) async => entities);

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

  group('InventoryRepositoryImpl - recipe versions', () {
    test(
      'returns latest published recipe version and ignores newer drafts',
      () async {
        when(
          mockRecipeVersionDocumentDao.findByProductId('burger-1'),
        ).thenAnswer(
          (_) async => [
            const RecipeVersionDocumentEntity(
              id: 'rv-draft-v3',
              productId: 'burger-1',
              productName: 'Burger',
              versionNumber: 3,
              yieldQuantity: 1,
              technicalShrinkPct: 0,
              createdAt: '2026-06-03T00:00:00.000',
              componentsJson: '[]',
            ),
            const RecipeVersionDocumentEntity(
              id: 'rv-published-v2',
              productId: 'burger-1',
              productName: 'Burger',
              versionNumber: 2,
              yieldQuantity: 1,
              technicalShrinkPct: 0,
              createdAt: '2026-06-02T00:00:00.000',
              publishedAt: '2026-06-02T01:00:00.000',
              componentsJson: '[]',
            ),
          ],
        );

        final result = await repository.getActiveRecipeVersionId('burger-1');

        expect(result, 'rv-published-v2');
      },
    );

    test('returns null when only draft recipe versions exist', () async {
      when(mockRecipeVersionDocumentDao.findByProductId('burger-1')).thenAnswer(
        (_) async => [
          const RecipeVersionDocumentEntity(
            id: 'rv-draft-v1',
            productId: 'burger-1',
            productName: 'Burger',
            versionNumber: 1,
            yieldQuantity: 1,
            technicalShrinkPct: 0,
            createdAt: '2026-06-01T00:00:00.000',
            componentsJson: '[]',
          ),
        ],
      );

      final result = await repository.getActiveRecipeVersionId('burger-1');

      expect(result, isNull);
    });
  });
}
