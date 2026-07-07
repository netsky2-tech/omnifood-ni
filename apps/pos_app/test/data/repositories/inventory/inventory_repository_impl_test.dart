import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:mockito/annotations.dart';
import 'package:pos_app/data/repositories/inventory/inventory_repository_impl.dart';
import 'package:pos_app/data/daos/inventory/insumo_dao.dart';
import 'package:pos_app/data/daos/inventory/movement_dao.dart';
import 'package:pos_app/data/daos/inventory/movement_sync_state_dao.dart';
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
import 'package:pos_app/data/models/inventory/movement_sync_state_entity.dart';
import 'package:pos_app/data/models/inventory/insumo_entity.dart';
import 'package:pos_app/data/models/inventory/recipe_version_document_entity.dart';
import 'package:pos_app/domain/repositories/inventory/inventory_repository.dart';

import 'inventory_repository_impl_test.mocks.dart';

@GenerateMocks([
  InsumoDao,
  RecipeDao,
  RecipeVersionDocumentDao,
  ProductionOrderDocumentDao,
  MovementDao,
  MovementSyncStateDao,
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
  late MockDio mockDio;
  late MockMovementDao mockMovementDao;
  late MockMovementSyncStateDao mockMovementSyncStateDao;
  late MockInsumoDao mockInsumoDao;
  late MockRecipeVersionDocumentDao mockRecipeVersionDocumentDao;

  setUp(() {
    mockDio = MockDio();
    mockMovementDao = MockMovementDao();
    mockMovementSyncStateDao = MockMovementSyncStateDao();
    mockInsumoDao = MockInsumoDao();
    mockRecipeVersionDocumentDao = MockRecipeVersionDocumentDao();
    repository = InventoryRepositoryImpl(
      insumoDao: mockInsumoDao,
      recipeDao: MockRecipeDao(),
      recipeVersionDocumentDao: mockRecipeVersionDocumentDao,
      productionOrderDocumentDao: MockProductionOrderDocumentDao(),
      movementDao: mockMovementDao,
      movementSyncStateDao: mockMovementSyncStateDao,
      supplierDao: MockSupplierDao(),
      warehouseDao: MockWarehouseDao(),
      uomConversionDao: MockUomConversionDao(),
      batchDao: MockBatchDao(),
      purchaseDao: MockPurchaseDao(),
      forensicAlertDao: MockForensicAlertDao(),
      dio: mockDio,
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
    test('fetchOfficialBcnRateByInvoiceDate requests and parses the backend lookup', () async {
      when(
        mockDio.get(
          '/inventory/fx/bcn',
          queryParameters: {'invoiceDate': '2026-01-10'},
        ),
      ).thenAnswer(
        (_) async => Response<Map<String, dynamic>>(
          data: const {
            'invoiceDate': '2026-01-10',
            'effectiveDate': '2026-01-10',
            'rateNio': 36.7123,
          },
          requestOptions: RequestOptions(path: '/inventory/fx/bcn'),
        ),
      );

      final result = await repository.fetchOfficialBcnRateByInvoiceDate(
        DateTime(2026, 1, 10),
      );

      expect(result, 36.7123);
      verify(
        mockDio.get(
          '/inventory/fx/bcn',
          queryParameters: {'invoiceDate': '2026-01-10'},
        ),
      ).called(1);
    });

    test('fetchOfficialBcnRateByInvoiceDate surfaces 404 lookups as manual fallback guidance', () async {
      when(
        mockDio.get(
          '/inventory/fx/bcn',
          queryParameters: {'invoiceDate': '2026-01-10'},
        ),
      ).thenThrow(
        DioException(
          requestOptions: RequestOptions(path: '/inventory/fx/bcn'),
          response: Response<void>(
            statusCode: 404,
            requestOptions: RequestOptions(path: '/inventory/fx/bcn'),
          ),
        ),
      );

      await expectLater(
        () => repository.fetchOfficialBcnRateByInvoiceDate(DateTime(2026, 1, 10)),
        throwsA(
          isA<OfficialBcnRateLookupException>().having(
            (OfficialBcnRateLookupException error) => error.message,
            'message',
            'No official BCN rate is available for 2026-01-10. Enter the BCN rate manually to continue.',
          ),
        ),
      );
    });

    test('fetchOfficialBcnRateByInvoiceDate keeps manual entry available when offline', () async {
      when(
        mockDio.get(
          '/inventory/fx/bcn',
          queryParameters: {'invoiceDate': '2026-01-10'},
        ),
      ).thenThrow(
        DioException(
          requestOptions: RequestOptions(path: '/inventory/fx/bcn'),
          type: DioExceptionType.connectionError,
        ),
      );

      await expectLater(
        () => repository.fetchOfficialBcnRateByInvoiceDate(DateTime(2026, 1, 10)),
        throwsA(
          isA<OfficialBcnRateLookupException>().having(
            (OfficialBcnRateLookupException error) => error.message,
            'message',
            'Official BCN lookup is unavailable offline. Enter the BCN rate manually to continue.',
          ),
        ),
      );
    });

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

    test('markMovementAsSynced should upsert sync state', () async {
      when(
        mockMovementSyncStateDao.upsertSyncState(any),
      ).thenAnswer((_) async => {});

      await repository.markMovementAsSynced('1');

      verify(
        mockMovementSyncStateDao.upsertSyncState(
          argThat(
            isA<MovementSyncStateEntity>().having(
              (state) => state.movementId,
              'movementId',
              '1',
            ).having(
              (state) => state.syncStatus,
              'syncStatus',
              MovementSyncStateStatus.synced,
            ),
          ),
        ),
      ).called(1);
      verifyNever(mockMovementDao.findAllMovements());
    });

    test('markMovementAsFailed should upsert failed sync state', () async {
      when(
        mockMovementSyncStateDao.upsertSyncState(any),
      ).thenAnswer((_) async => {});

      await repository.markMovementAsFailed('1', error: 'timeout');

      verify(
        mockMovementSyncStateDao.upsertSyncState(
          argThat(
            isA<MovementSyncStateEntity>().having(
              (state) => state.movementId,
              'movementId',
              '1',
            ).having(
              (state) => state.syncStatus,
              'syncStatus',
              MovementSyncStateStatus.failed,
            ).having(
              (state) => state.lastError,
              'lastError',
              'timeout',
            ),
          ),
        ),
      ).called(1);
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
