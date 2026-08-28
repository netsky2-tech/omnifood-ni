import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:dio/dio.dart';
import 'package:mockito/mockito.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/repositories/inventory/inventory_repository_impl.dart';
import 'package:pos_app/domain/models/inventory/insumo.dart';
import 'package:pos_app/domain/models/inventory/inventory_movement.dart';
import 'package:pos_app/domain/models/inventory/purchase.dart';
import 'package:pos_app/domain/models/inventory/forensic_alert.dart';
import 'package:pos_app/data/models/inventory/insumo_entity.dart';
import 'package:pos_app/data/models/inventory/movement_entity.dart';
import 'package:pos_app/domain/services/inventory/kardex_recalculation_engine.dart';
import 'package:pos_app/domain/services/inventory/negative_stock_regularization_service.dart';
import 'package:pos_app/data/services/sync_service.dart';
import 'package:pos_app/domain/repositories/audit_repository.dart';
import 'package:pos_app/domain/repositories/sales/sales_repository.dart';
import 'package:pos_app/domain/repositories/inventory/inventory_repository.dart';
import 'package:pos_app/ui/features/inventory/kardex/kardex_view.dart';
import 'package:pos_app/ui/features/inventory/kardex/kardex_view_model.dart';
import 'package:provider/provider.dart';

class MockAuditRepository extends Mock implements AuditRepository {
  @override
  Future<AuditSyncOutcome> syncLogs() => super.noSuchMethod(
        Invocation.method(#syncLogs, []),
        returnValue: Future.value(const AuditSyncOutcome.complete()),
        returnValueForMissingStub:
            Future.value(const AuditSyncOutcome.complete()),
      );

  @override
  String get deviceId => 'test-pos-terminal-1';
}

class MockSalesRepository extends Mock implements SalesRepository {
  @override
  Future<List<Map<String, dynamic>>> getUnsyncedAggregates() =>
      super.noSuchMethod(
        Invocation.method(#getUnsyncedAggregates, []),
        returnValue: Future.value(<Map<String, dynamic>>[]),
        returnValueForMissingStub: Future.value(<Map<String, dynamic>>[]),
      );
}

class MockDio extends Mock implements Dio {
  @override
  Future<Response<T>> post<T>(
    String path, {
    Object? data,
    Map<String, dynamic>? queryParameters,
    Options? options,
    CancelToken? cancelToken,
    ProgressCallback? onSendProgress,
    ProgressCallback? onReceiveProgress,
  }) =>
      super.noSuchMethod(
        Invocation.method(#post, [path], {
          #data: data,
          #queryParameters: queryParameters,
          #options: options,
          #cancelToken: cancelToken,
          #onSendProgress: onSendProgress,
          #onReceiveProgress: onReceiveProgress,
        }),
        returnValue: Future.value(Response<T>(
          requestOptions: RequestOptions(path: path),
          statusCode: 200,
          data: {'syncedCount': 1, 'duplicatesCount': 0} as dynamic,
        )),
        returnValueForMissingStub: Future.value(Response<T>(
          requestOptions: RequestOptions(path: path),
          statusCode: 200,
          data: {'syncedCount': 1, 'duplicatesCount': 0} as dynamic,
        )),
      );

  @override
  Future<Response<T>> get<T>(
    String path, {
    Object? data,
    Map<String, dynamic>? queryParameters,
    Options? options,
    CancelToken? cancelToken,
    ProgressCallback? onReceiveProgress,
  }) =>
      super.noSuchMethod(
        Invocation.method(#get, [path], {
          #data: data,
          #queryParameters: queryParameters,
          #options: options,
          #cancelToken: cancelToken,
          #onReceiveProgress: onReceiveProgress,
        }),
        returnValue: Future.value(Response<T>(
          requestOptions: RequestOptions(path: path),
          statusCode: 200,
          data: {'alerts': []} as dynamic,
        )),
        returnValueForMissingStub: Future.value(Response<T>(
          requestOptions: RequestOptions(path: path),
          statusCode: 200,
          data: {'alerts': []} as dynamic,
        )),
      );
}

class MockInventoryRepositoryForUI extends Mock implements InventoryRepository {
  @override
  Future<List<InventoryMovement>> getAllMovements() => super.noSuchMethod(
        Invocation.method(#getAllMovements, []),
        returnValue: Future.value(<InventoryMovement>[]),
        returnValueForMissingStub: Future.value(<InventoryMovement>[]),
      );

  @override
  Future<List<Insumo>> getInsumosByIds(List<String>? ids) => super.noSuchMethod(
        Invocation.method(#getInsumosByIds, [ids]),
        returnValue: Future.value(<Insumo>[]),
        returnValueForMissingStub: Future.value(<Insumo>[]),
      );

  @override
  Future<List<Purchase>> getPurchaseHistory() => super.noSuchMethod(
        Invocation.method(#getPurchaseHistory, []),
        returnValue: Future.value(<Purchase>[]),
        returnValueForMissingStub: Future.value(<Purchase>[]),
      );

  @override
  Future<List<ForensicAlert>> getForensicAlerts() => super.noSuchMethod(
        Invocation.method(#getForensicAlerts, []),
        returnValue: Future.value(<ForensicAlert>[]),
        returnValueForMissingStub: Future.value(<ForensicAlert>[]),
      );
}

void main() {
  late AppDatabase database;
  late InventoryRepositoryImpl repository;
  late NegativeStockRegularizationService regularizationService;
  late MockAuditRepository auditRepo;
  late MockSalesRepository salesRepo;
  late MockDio dio;
  late SyncService syncService;

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  setUp(() async {
    database = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();
    dio = MockDio();
    auditRepo = MockAuditRepository();
    salesRepo = MockSalesRepository();

    repository = InventoryRepositoryImpl(
      insumoDao: database.insumoDao,
      recipeDao: database.recipeDao,
      movementDao: database.movementDao,
      movementSyncStateDao: database.movementSyncStateDao,
      supplierDao: database.supplierDao,
      warehouseDao: database.warehouseDao,
      countSessionDao: database.countSessionDao,
      countLineDao: database.countLineDao,
      forensicAlertDao: database.forensicAlertDao,
      uomConversionDao: database.uomConversionDao,
      batchDao: database.batchDao,
      purchaseDao: database.purchaseDao,
      recipeVersionDocumentDao: database.recipeVersionDocumentDao,
      productionOrderDocumentDao: database.productionOrderDocumentDao,
      dio: dio,
      database: database,
    );

    regularizationService = NegativeStockRegularizationService(
      database: database,
      engine: const KardexRecalculationEngine(autoApproveThresholdNio: 1500.0),
    );

    syncService = SyncService(auditRepo, salesRepo, repository, dio);
  });

  tearDown(() async {
    await database.close();
  });

  group('Batch 6b E2E Vertical Slice: Complete Lifecycle Flow', () {
    test(
      'Full End-to-End Flow: Negative Sale -> Purchase Replenishment -> Supervisor Approval -> Outbox Sync',
      () async {
        final now = DateTime.now().toIso8601String();

        // 1. Seed initial Insumo (Carne Molida)
        final insumo = InsumoEntity(
          id: 'ins-carne-1',
          name: 'Carne Molida Especial',
          consumptionUom: 'kg',
          stock: 0.0,
          averageCost: 100.0,
          isActive: true,
        );
        await database.insumoDao.insertInsumos([insumo]);

        // 2. Step 1: Sale in negative stock occurs (-100 kg at provisional cost C$100.00)
        final saleMovement = MovementEntity(
          id: 'mov-sale-neg-1',
          insumoId: 'ins-carne-1',
          type: 'SALE',
          quantity: -100.0,
          previousStock: 0.0,
          newStock: -100.0,
          unitCostNio: 100.0,
          timestamp: now,
          estadoCosteo: 10, // PROVISIONAL
        );
        await database.movementDao.insertMovement(saleMovement);
        await regularizationService.enqueueProvisionalMovement(saleMovement);

        // Verify enqueued in Floor DB
        final queuePending = await database.kardexRecalculateQueueDao.findQueueByStatus('PENDING');
        expect(queuePending.length, 1);
        expect(queuePending.first.originMovementId, 'mov-sale-neg-1');

        // 3. Step 2: Replenishment Purchase enters (+150 kg at new cost C$120.00)
        // Delta = C$20.00/kg * 100 kg = C$2,000.00 (> C$1,500.00 threshold -> Requires Intervention)
        final purchaseMovement = MovementEntity(
          id: 'mov-purch-trig-1',
          insumoId: 'ins-carne-1',
          type: 'PURCHASE',
          quantity: 150.0,
          previousStock: -100.0,
          newStock: 50.0,
          unitCostNio: 120.0,
          timestamp: now,
          estadoCosteo: 30,
        );
        await database.movementDao.insertMovement(purchaseMovement);

        final processed = await regularizationService.processPendingQueueForInsumo(
          insumoId: 'ins-carne-1',
          triggerMovement: purchaseMovement,
        );

        expect(processed.length, 1);
        expect(processed.first.status, 'BLOCKED');

        // 4. Step 3: Supervisor overrides and authorizes the blocked regularization
        final approved = await regularizationService.approveBlockedRegularization(
          queueId: processed.first.id,
          supervisorId: 'user-supervisor-99',
          role: 'MANAGER',
          authMethod: 'PIN',
        );
        expect(approved, isTrue);

        // Verify immutable correction was persisted
        final corrections = await database.kardexCorrectionDao.findCorrectionsByInsumoId('ins-carne-1');
        expect(corrections.length, 1);
        expect(corrections.first.deltaUnitCostNio, 20.0);
        expect(corrections.first.totalDeltaCostNio, 2000.0);
        expect(corrections.first.authorizedByUserId, 'user-supervisor-99');
        expect(corrections.first.authorizationMethod, 'PIN');
        expect(corrections.first.lineageHash, isNotEmpty);

        // 5. Step 4: Outbox Sync pass sends correction to cloud backend
        when(dio.post(
          '/inventory/regularization/sync',
          data: anyNamed('data'),
        )).thenAnswer((_) async => Response(
              requestOptions: RequestOptions(path: '/inventory/regularization/sync'),
              statusCode: 200,
              data: {'syncedCount': 1, 'duplicatesCount': 0},
            ));

        await syncService.triggerManualSync();

        verify(dio.post(
          '/inventory/regularization/sync',
          data: argThat(
            isA<Map<String, dynamic>>().having(
              (m) => (m['corrections'] as List).length,
              'corrections length',
              1,
            ),
            named: 'data',
          ),
        )).called(1);
      },
    );

    testWidgets('Kardex UI renders regularized movements with costing badges and details', (tester) async {
      final mockRepo = MockInventoryRepositoryForUI();
      when(mockRepo.getAllMovements()).thenAnswer(
        (_) async => [
          InventoryMovement(
            id: 'mov-sale-reg-1',
            insumoId: 'ins-carne-1',
            type: MovementType.sale,
            quantity: -100.0,
            previousStock: 0.0,
            newStock: -100.0,
            unitCostNio: 120.0,
            timestamp: DateTime.now(),
            estadoCosteo: 30, // REGULARIZED
          ),
        ],
      );

      when(mockRepo.getInsumosByIds(any)).thenAnswer(
        (_) async => const [
          Insumo(
            id: 'ins-carne-1',
            name: 'Carne Molida Especial',
            consumptionUom: 'kg',
            stock: 50.0,
            averageCost: 120.0,
          ),
        ],
      );

      final viewModel = KardexViewModel(mockRepo);

      await tester.pumpWidget(
        MaterialApp(
          home: ChangeNotifierProvider<KardexViewModel>.value(
            value: viewModel,
            child: const KardexView(),
          ),
        ),
      );

      await tester.pumpAndSettle();

      expect(find.text('Carne Molida Especial'), findsWidgets);
      expect(find.text('Estado Costeo'), findsOneWidget);
      expect(find.text('Regularizado'), findsWidgets);
    });
  });
}
