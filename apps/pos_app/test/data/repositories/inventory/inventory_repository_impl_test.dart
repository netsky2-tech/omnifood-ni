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
import 'package:pos_app/data/models/inventory/production_order_document_entity.dart';
import 'package:pos_app/data/models/inventory/recipe_version_document_entity.dart';
import 'package:pos_app/domain/models/inventory/inventory_movement.dart';
import 'package:pos_app/domain/models/inventory/production_order_document.dart';
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
    test(
      'fetchOfficialBcnRateByInvoiceDate requests and parses the backend lookup',
      () async {
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
      },
    );

    test(
      'fetchOfficialBcnRateByInvoiceDate surfaces 404 lookups as manual fallback guidance',
      () async {
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
          () => repository.fetchOfficialBcnRateByInvoiceDate(
            DateTime(2026, 1, 10),
          ),
          throwsA(
            isA<OfficialBcnRateLookupException>().having(
              (OfficialBcnRateLookupException error) => error.message,
              'message',
              'No official BCN rate is available for 2026-01-10. Enter the BCN rate manually to continue.',
            ),
          ),
        );
      },
    );

    test(
      'fetchOfficialBcnRateByInvoiceDate keeps manual entry available when offline',
      () async {
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
          () => repository.fetchOfficialBcnRateByInvoiceDate(
            DateTime(2026, 1, 10),
          ),
          throwsA(
            isA<OfficialBcnRateLookupException>().having(
              (OfficialBcnRateLookupException error) => error.message,
              'message',
              'Official BCN lookup is unavailable offline. Enter the BCN rate manually to continue.',
            ),
          ),
        );
      },
    );

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
        mockMovementSyncStateDao.findByMovementId('1'),
      ).thenAnswer((_) async => null);
      when(
        mockMovementSyncStateDao.upsertSyncState(any),
      ).thenAnswer((_) async => {});

      await repository.markMovementAsSynced('1');

      verify(
        mockMovementSyncStateDao.upsertSyncState(
          argThat(
            isA<MovementSyncStateEntity>()
                .having((state) => state.movementId, 'movementId', '1')
                .having(
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
        mockMovementSyncStateDao.findByMovementId('1'),
      ).thenAnswer((_) async => null);
      when(
        mockMovementSyncStateDao.upsertSyncState(any),
      ).thenAnswer((_) async => {});

      await repository.markMovementAsFailed('1', error: 'timeout');

      verify(
        mockMovementSyncStateDao.upsertSyncState(
          argThat(
            isA<MovementSyncStateEntity>()
                .having((state) => state.movementId, 'movementId', '1')
                .having(
                  (state) => state.syncStatus,
                  'syncStatus',
                  MovementSyncStateStatus.failed,
                )
                .having((state) => state.lastError, 'lastError', 'timeout'),
          ),
        ),
      ).called(1);
    });

    test(
      'reserveMovementSyncMetadata preserves existing metadata and allocates next sequence deterministically',
      () async {
        const existing = MovementSyncStateEntity(
          movementId: 'mov-existing',
          syncStatus: MovementSyncStateStatus.failed,
          lastAttemptedAt: '2026-01-01T00:00:00.000Z',
          lastError: 'timeout',
          terminalId: 'dev-1',
          flowType: 'inventory',
          localSequence: 7,
          idempotencyKey: 'inventory:dev-1:mov-existing',
          lastResultCode: 'PRIOR_FAILURE',
        );
        when(
          mockMovementSyncStateDao.findByMovementIds([
            'mov-existing',
            'mov-new',
          ]),
        ).thenAnswer((_) async => [existing]);
        when(
          mockMovementSyncStateDao.findMaxLocalSequence('dev-1', 'inventory'),
        ).thenAnswer((_) async => 7);
        when(
          mockMovementSyncStateDao.upsertSyncState(any),
        ).thenAnswer((_) async => {});

        final result = await repository.reserveMovementSyncMetadata(
          ['mov-existing', 'mov-new'],
          terminalId: 'dev-1',
          flowType: 'inventory',
        );

        expect(result.map((metadata) => metadata.movementId), [
          'mov-existing',
          'mov-new',
        ]);
        expect(result.first.localSequence, 7);
        expect(result.first.lastResultCode, 'PRIOR_FAILURE');
        expect(result.first.lastError, 'timeout');
        expect(result.last.localSequence, 8);
        expect(result.last.idempotencyKey, 'inventory:dev-1:mov-new');
        verify(
          mockMovementSyncStateDao.findByMovementIds([
            'mov-existing',
            'mov-new',
          ]),
        ).called(1);
        verify(
          mockMovementSyncStateDao.findMaxLocalSequence('dev-1', 'inventory'),
        ).called(1);
        verify(
          mockMovementSyncStateDao.upsertSyncState(
            argThat(
              isA<MovementSyncStateEntity>()
                  .having((state) => state.movementId, 'movementId', 'mov-new')
                  .having((state) => state.syncStatus, 'syncStatus', 'pending')
                  .having((state) => state.terminalId, 'terminalId', 'dev-1')
                  .having((state) => state.flowType, 'flowType', 'inventory')
                  .having((state) => state.localSequence, 'localSequence', 8)
                  .having(
                    (state) => state.idempotencyKey,
                    'idempotencyKey',
                    'inventory:dev-1:mov-new',
                  ),
            ),
          ),
        ).called(1);
      },
    );

    test(
      'recordMovementRetryState retains metadata and records last result code and error',
      () async {
        const existing = MovementSyncStateEntity(
          movementId: 'mov-retry',
          syncStatus: MovementSyncStateStatus.pending,
          terminalId: 'dev-1',
          flowType: 'inventory',
          localSequence: 9,
          idempotencyKey: 'inventory:dev-1:mov-retry',
        );
        when(
          mockMovementSyncStateDao.findByMovementId('mov-retry'),
        ).thenAnswer((_) async => existing);
        when(
          mockMovementSyncStateDao.upsertSyncState(any),
        ).thenAnswer((_) async => {});

        await repository.recordMovementRetryState(
          'mov-retry',
          resultCode: 'INVALID_DELTA',
          error: 'bad quantity',
        );

        verify(
          mockMovementSyncStateDao.findByMovementId('mov-retry'),
        ).called(1);
        verify(
          mockMovementSyncStateDao.upsertSyncState(
            argThat(
              isA<MovementSyncStateEntity>()
                  .having(
                    (state) => state.movementId,
                    'movementId',
                    'mov-retry',
                  )
                  .having(
                    (state) => state.syncStatus,
                    'syncStatus',
                    MovementSyncStateStatus.failed,
                  )
                  .having(
                    (state) => state.lastError,
                    'lastError',
                    'bad quantity',
                  )
                  .having(
                    (state) => state.lastResultCode,
                    'lastResultCode',
                    'INVALID_DELTA',
                  )
                  .having((state) => state.terminalId, 'terminalId', 'dev-1')
                  .having((state) => state.flowType, 'flowType', 'inventory')
                  .having((state) => state.localSequence, 'localSequence', 9)
                  .having(
                    (state) => state.idempotencyKey,
                    'idempotencyKey',
                    'inventory:dev-1:mov-retry',
                  )
                  .having(
                    (state) => state.lastAttemptedAt,
                    'lastAttemptedAt',
                    isNotNull,
                  ),
            ),
          ),
        ).called(1);
      },
    );

    test(
      'persists sync metadata and retry state through generated Floor DAOs',
      () async {
        final database = await $FloorAppDatabase
            .inMemoryDatabaseBuilder()
            .build();
        final floorRepository = InventoryRepositoryImpl(
          insumoDao: database.insumoDao,
          recipeDao: database.recipeDao,
          recipeVersionDocumentDao: database.recipeVersionDocumentDao,
          productionOrderDocumentDao: database.productionOrderDocumentDao,
          movementDao: database.movementDao,
          movementSyncStateDao: database.movementSyncStateDao,
          supplierDao: database.supplierDao,
          warehouseDao: database.warehouseDao,
          uomConversionDao: database.uomConversionDao,
          batchDao: database.batchDao,
          purchaseDao: database.purchaseDao,
          forensicAlertDao: database.forensicAlertDao,
          dio: mockDio,
          database: database,
        );

        try {
          await database.movementDao.insertMovement(
            MovementEntity(
              id: 'mov-existing',
              insumoId: 'i-1',
              type: 'SALE',
              quantity: -1,
              previousStock: 10,
              newStock: 9,
              timestamp: '2026-01-01T10:00:00.000Z',
            ),
          );
          await database.movementDao.insertMovement(
            MovementEntity(
              id: 'mov-new',
              insumoId: 'i-1',
              type: 'SALE',
              quantity: -1,
              previousStock: 9,
              newStock: 8,
              timestamp: '2026-01-01T10:01:00.000Z',
            ),
          );
          await database.movementSyncStateDao.upsertSyncState(
            const MovementSyncStateEntity(
              movementId: 'mov-existing',
              syncStatus: MovementSyncStateStatus.failed,
              lastAttemptedAt: '2026-01-01T00:00:00.000Z',
              lastError: 'timeout',
              terminalId: 'dev-1',
              flowType: 'inventory',
              localSequence: 7,
              idempotencyKey: 'inventory:dev-1:mov-existing',
              lastResultCode: 'PRIOR_FAILURE',
            ),
          );

          final reserved = await floorRepository.reserveMovementSyncMetadata(
            ['mov-existing', 'mov-new'],
            terminalId: 'dev-1',
            flowType: 'inventory',
          );
          final persistedRows = await database.movementSyncStateDao
              .findByMovementIds(['mov-existing', 'mov-new']);
          final maxSequence = await database.movementSyncStateDao
              .findMaxLocalSequence('dev-1', 'inventory');

          expect(reserved.map((metadata) => metadata.movementId), [
            'mov-existing',
            'mov-new',
          ]);
          expect(reserved.first.localSequence, 7);
          expect(reserved.last.localSequence, 8);
          expect(maxSequence, 8);
          expect(persistedRows, hasLength(2));
          expect(
            persistedRows.where((row) => row.movementId == 'mov-new').single,
            isA<MovementSyncStateEntity>()
                .having((state) => state.syncStatus, 'syncStatus', 'pending')
                .having((state) => state.terminalId, 'terminalId', 'dev-1')
                .having((state) => state.flowType, 'flowType', 'inventory')
                .having((state) => state.localSequence, 'localSequence', 8)
                .having(
                  (state) => state.idempotencyKey,
                  'idempotencyKey',
                  'inventory:dev-1:mov-new',
                ),
          );

          await floorRepository.recordMovementRetryState(
            'mov-new',
            resultCode: 'INVALID_DELTA',
            error: 'bad quantity',
          );
          final retried = await database.movementSyncStateDao.findByMovementId(
            'mov-new',
          );

          expect(
            retried,
            isA<MovementSyncStateEntity>()
                .having(
                  (state) => state.syncStatus,
                  'syncStatus',
                  MovementSyncStateStatus.failed,
                )
                .having(
                  (state) => state.lastResultCode,
                  'lastResultCode',
                  'INVALID_DELTA',
                )
                .having((state) => state.lastError, 'lastError', 'bad quantity')
                .having((state) => state.terminalId, 'terminalId', 'dev-1')
                .having((state) => state.flowType, 'flowType', 'inventory')
                .having((state) => state.localSequence, 'localSequence', 8)
                .having(
                  (state) => state.idempotencyKey,
                  'idempotencyKey',
                  'inventory:dev-1:mov-new',
                ),
          );
        } finally {
          await database.close();
        }
      },
    );

    test(
      'reserves production source sequence from persisted terminal order',
      () async {
        final database = await $FloorAppDatabase
            .inMemoryDatabaseBuilder()
            .build();
        final floorRepository = InventoryRepositoryImpl(
          insumoDao: database.insumoDao,
          recipeDao: database.recipeDao,
          recipeVersionDocumentDao: database.recipeVersionDocumentDao,
          productionOrderDocumentDao: database.productionOrderDocumentDao,
          productionTransactionDao: database.productionTransactionDao,
          movementDao: database.movementDao,
          movementSyncStateDao: database.movementSyncStateDao,
          supplierDao: database.supplierDao,
          warehouseDao: database.warehouseDao,
          uomConversionDao: database.uomConversionDao,
          batchDao: database.batchDao,
          purchaseDao: database.purchaseDao,
          forensicAlertDao: database.forensicAlertDao,
          dio: mockDio,
          database: database,
        );

        try {
          await database.productionOrderDocumentDao.upsertDocument(
            const ProductionOrderDocumentEntity(
              id: 'prod-close-7',
              recipeVersionId: 'rv-1',
              recipeProductId: 'prod-1',
              recipeProductName: 'Jarabe Casa',
              producedInsumoId: 'insumo-1',
              producedInsumoName: 'Jarabe Casa',
              plannedQuantity: 4,
              actualQuantity: 4,
              producedBatchNumber: 'PB-7',
              producedExpirationDate: '2026-07-01T00:00:00.000Z',
              operationDate: '2026-06-01T08:30:00.000Z',
              status: 'CLOSED_PENDING_SYNC',
              terminalId: 'terminal-local',
              sourceSequence: 7,
              movementReferencesJson: '[]',
            ),
          );
          await database.productionOrderDocumentDao.upsertDocument(
            const ProductionOrderDocumentEntity(
              id: 'prod-close-other-terminal',
              recipeVersionId: 'rv-1',
              recipeProductId: 'prod-1',
              recipeProductName: 'Jarabe Casa',
              producedInsumoId: 'insumo-1',
              producedInsumoName: 'Jarabe Casa',
              plannedQuantity: 4,
              actualQuantity: 4,
              producedBatchNumber: 'PB-99',
              producedExpirationDate: '2026-07-01T00:00:00.000Z',
              operationDate: '2026-06-01T08:31:00.000Z',
              status: 'CLOSED_PENDING_SYNC',
              terminalId: 'OTHER_POS',
              sourceSequence: 99,
              movementReferencesJson: '[]',
            ),
          );

          final nextLocal = await floorRepository
              .reserveProductionSourceSequence('terminal-local');
          final firstOther = await floorRepository
              .reserveProductionSourceSequence('NEW_POS');

          expect(nextLocal, 8);
          expect(firstOther, 1);
        } finally {
          await database.close();
        }
      },
    );

    test('production close models keep terminal identity explicit', () {
      final document = ProductionOrderDocument(
        id: 'po-default-sequence',
        recipeVersionId: 'rv-1',
        recipeProductId: 'prod-1',
        recipeProductName: 'Product',
        producedInsumoId: 'finished-1',
        producedInsumoName: 'Finished',
        plannedQuantity: 1,
        actualQuantity: 1,
        producedBatchNumber: 'PB-1',
        producedExpirationDate: DateTime(2026, 8, 1),
        operationDate: DateTime.parse('2026-07-09T10:00:00Z'),
        status: 'CLOSED_PENDING_SYNC',
        terminalId: 'terminal-default-sequence',
      );
      const entity = ProductionOrderDocumentEntity(
        id: 'po-default-sequence',
        recipeVersionId: 'rv-1',
        recipeProductId: 'prod-1',
        recipeProductName: 'Product',
        producedInsumoId: 'finished-1',
        producedInsumoName: 'Finished',
        plannedQuantity: 1,
        actualQuantity: 1,
        producedBatchNumber: 'PB-1',
        producedExpirationDate: '2026-08-01T00:00:00.000',
        operationDate: '2026-07-09T10:00:00.000Z',
        status: 'CLOSED_PENDING_SYNC',
        terminalId: 'terminal-default-sequence',
        movementReferencesJson: '[]',
      );

      expect(document.sourceSequence, 0);
      expect(entity.sourceSequence, 0);
      expect(document.terminalId, 'terminal-default-sequence');
      expect(entity.terminalId, 'terminal-default-sequence');
      expect(
        document.idempotencyKey,
        'production:terminal-default-sequence:po-default-sequence',
      );
      expect(
        entity.idempotencyKey,
        'production:terminal-default-sequence:po-default-sequence',
      );
    });

    test(
      'legacy production document json requires migrated terminal identity',
      () {
        expect(
          () => ProductionOrderDocument.fromJson({
            'id': 'po-legacy-json',
            'recipeVersionId': 'rv-1',
            'recipeProductId': 'prod-1',
            'recipeProductName': 'Product',
            'producedInsumoId': 'finished-1',
            'producedInsumoName': 'Finished',
            'plannedQuantity': 1,
            'actualQuantity': 1,
            'producedBatchNumber': 'PB-1',
            'producedExpirationDate': '2026-08-01T00:00:00.000',
            'operationDate': '2026-07-09T10:00:00.000Z',
            'status': 'CLOSED_PENDING_SYNC',
          }),
          throwsA(
            isA<FormatException>().having(
              (error) => error.message,
              'message',
              contains('terminalId is required'),
            ),
          ),
        );
      },
    );

    test(
      'rolls back production close movements, stock, and document on transaction failure',
      () async {
        final database = await $FloorAppDatabase
            .inMemoryDatabaseBuilder()
            .build();
        final floorRepository = InventoryRepositoryImpl(
          insumoDao: database.insumoDao,
          recipeDao: database.recipeDao,
          recipeVersionDocumentDao: database.recipeVersionDocumentDao,
          productionOrderDocumentDao: database.productionOrderDocumentDao,
          productionTransactionDao: database.productionTransactionDao,
          movementDao: database.movementDao,
          movementSyncStateDao: database.movementSyncStateDao,
          supplierDao: database.supplierDao,
          warehouseDao: database.warehouseDao,
          uomConversionDao: database.uomConversionDao,
          batchDao: database.batchDao,
          purchaseDao: database.purchaseDao,
          forensicAlertDao: database.forensicAlertDao,
          dio: mockDio,
          database: database,
        );

        try {
          await database.insumoDao.insertInsumos([
            InsumoEntity(
              id: 'input-1',
              name: 'Input',
              consumptionUom: 'kg',
              stock: 10,
              averageCost: 5,
            ),
          ]);
          final movement = InventoryMovement(
            id: 'mov-production-out',
            insumoId: 'input-1',
            type: MovementType.production,
            quantity: -2,
            previousStock: 10,
            newStock: 8,
            timestamp: DateTime.parse('2026-07-09T10:00:00.000Z'),
            reason: 'PRODUCTION_CLOSE:po-atomic',
          );
          final document = ProductionOrderDocument(
            id: 'po-atomic',
            recipeVersionId: 'rv-1',
            recipeProductId: 'prod-1',
            recipeProductName: 'Product',
            producedInsumoId: 'finished-1',
            producedInsumoName: 'Finished',
            plannedQuantity: 1,
            actualQuantity: 1,
            producedBatchNumber: 'PB-1',
            producedExpirationDate: DateTime(2026, 8, 1),
            operationDate: DateTime.parse('2026-07-09T10:00:00.000Z'),
            status: 'CLOSED_PENDING_SYNC',
            terminalId: 'pos-terminal-rollback',
            movementReferences: const ['mov-production-out'],
          );

          await expectLater(
            () => floorRepository.saveProductionCloseTransaction(document, [
              movement,
            ], debugFailAfterWrites: true),
            throwsException,
          );

          final input = await database.insumoDao.findInsumoById('input-1');
          final movements = await database.movementDao.findAllMovements();
          final documents = await database.productionOrderDocumentDao
              .findAllDocuments();

          expect(input?.stock, 10);
          expect(movements, isEmpty);
          expect(documents, isEmpty);
        } finally {
          await database.close();
        }
      },
    );

    test(
      'assigns production source sequence inside the transaction and orders unsynced documents by stream',
      () async {
        final database = await $FloorAppDatabase
            .inMemoryDatabaseBuilder()
            .build();
        final floorRepository = InventoryRepositoryImpl(
          insumoDao: database.insumoDao,
          recipeDao: database.recipeDao,
          recipeVersionDocumentDao: database.recipeVersionDocumentDao,
          productionOrderDocumentDao: database.productionOrderDocumentDao,
          productionTransactionDao: database.productionTransactionDao,
          movementDao: database.movementDao,
          movementSyncStateDao: database.movementSyncStateDao,
          supplierDao: database.supplierDao,
          warehouseDao: database.warehouseDao,
          uomConversionDao: database.uomConversionDao,
          batchDao: database.batchDao,
          purchaseDao: database.purchaseDao,
          forensicAlertDao: database.forensicAlertDao,
          dio: mockDio,
          database: database,
        );

        ProductionOrderDocument document(String id, DateTime operationDate) =>
            ProductionOrderDocument(
              id: id,
              recipeVersionId: 'rv-1',
              recipeProductId: 'prod-1',
              recipeProductName: 'Product',
              producedInsumoId: 'finished-1',
              producedInsumoName: 'Finished',
              plannedQuantity: 1,
              actualQuantity: 1,
              producedBatchNumber: 'PB-$id',
              producedExpirationDate: DateTime(2026, 8, 1),
              operationDate: operationDate,
              status: 'CLOSED_PENDING_SYNC',
              terminalId: 'terminal-local',
              sourceSequence: 0,
              movementReferences: const [],
            );

        try {
          await floorRepository.saveProductionCloseTransaction(
            document('po-second', DateTime.parse('2026-07-09T10:00:00Z')),
            const [],
          );
          await floorRepository.saveProductionCloseTransaction(
            document('po-first', DateTime.parse('2026-07-09T09:00:00Z')),
            const [],
          );

          final unsynced = await floorRepository.getUnsyncedProductionOrders();

          expect(unsynced.map((doc) => doc.id), ['po-second', 'po-first']);
          expect(unsynced.map((doc) => doc.sourceSequence), [1, 2]);
        } finally {
          await database.close();
        }
      },
    );

    test(
      'ignores caller-provided production source sequence for new local closes',
      () async {
        final database = await $FloorAppDatabase
            .inMemoryDatabaseBuilder()
            .build();
        final floorRepository = InventoryRepositoryImpl(
          insumoDao: database.insumoDao,
          recipeDao: database.recipeDao,
          recipeVersionDocumentDao: database.recipeVersionDocumentDao,
          productionOrderDocumentDao: database.productionOrderDocumentDao,
          productionTransactionDao: database.productionTransactionDao,
          movementDao: database.movementDao,
          movementSyncStateDao: database.movementSyncStateDao,
          supplierDao: database.supplierDao,
          warehouseDao: database.warehouseDao,
          uomConversionDao: database.uomConversionDao,
          batchDao: database.batchDao,
          purchaseDao: database.purchaseDao,
          forensicAlertDao: database.forensicAlertDao,
          dio: mockDio,
          database: database,
        );

        ProductionOrderDocument document(String id) => ProductionOrderDocument(
          id: id,
          recipeVersionId: 'rv-1',
          recipeProductId: 'prod-1',
          recipeProductName: 'Product',
          producedInsumoId: 'finished-1',
          producedInsumoName: 'Finished',
          plannedQuantity: 1,
          actualQuantity: 1,
          producedBatchNumber: 'PB-$id',
          producedExpirationDate: DateTime(2026, 8, 1),
          operationDate: DateTime.parse('2026-07-09T10:00:00Z'),
          status: 'CLOSED_PENDING_SYNC',
          terminalId: 'terminal-local',
          sourceSequence: 1,
          movementReferences: const [],
        );

        try {
          await floorRepository.saveProductionCloseTransaction(
            document('po-first'),
            const [],
          );
          await floorRepository.saveProductionCloseTransaction(
            document('po-second'),
            const [],
          );

          final unsynced = await floorRepository.getUnsyncedProductionOrders();

          expect(unsynced.map((doc) => doc.id), ['po-first', 'po-second']);
          expect(unsynced.map((doc) => doc.sourceSequence), [1, 2]);
          expect(
            unsynced.map((doc) => doc.idempotencyKey).toSet(),
            hasLength(2),
          );
        } finally {
          await database.close();
        }
      },
    );
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
