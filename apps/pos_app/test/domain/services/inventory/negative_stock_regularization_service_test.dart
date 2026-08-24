import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/inventory/movement_entity.dart';
import 'package:pos_app/domain/services/inventory/negative_stock_regularization_service.dart';
import 'package:pos_app/domain/services/inventory/kardex_recalculation_engine.dart';

void main() {
  late AppDatabase database;
  late NegativeStockRegularizationService service;

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  setUp(() async {
    database = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();
    service = NegativeStockRegularizationService(
      database: database,
      engine: const KardexRecalculationEngine(autoApproveThresholdNio: 1500.0),
    );
  });

  tearDown(() async {
    await database.close();
  });

  group('NegativeStockRegularizationService (Batch 6b Phase 2)', () {
    test('enqueues negative stock movement to recalculation queue when provisional', () async {
      final now = DateTime.now().toIso8601String();
      final saleMovement = MovementEntity(
        id: 'mov-neg-1',
        insumoId: 'ins-1',
        type: 'SALE',
        quantity: -10.0,
        previousStock: 0.0,
        newStock: -10.0,
        unitCostNio: 40.0,
        timestamp: now,
        estadoCosteo: 10,
      );

      await database.movementDao.insertMovement(saleMovement);
      await service.enqueueProvisionalMovement(saleMovement);

      final queue = await database.kardexRecalculateQueueDao.findQueueByStatus('PENDING');
      expect(queue.length, 1);
      expect(queue.first.originMovementId, 'mov-neg-1');
      expect(queue.first.insumoId, 'ins-1');
    });

    test('processes replenishment and regularizes pending queue item automatically', () async {
      final now = DateTime.now().toIso8601String();
      final saleMovement = MovementEntity(
        id: 'mov-neg-2',
        insumoId: 'ins-2',
        type: 'SALE',
        quantity: -5.0,
        previousStock: 0.0,
        newStock: -5.0,
        unitCostNio: 50.0,
        timestamp: now,
        estadoCosteo: 10,
      );

      await database.movementDao.insertMovement(saleMovement);
      await service.enqueueProvisionalMovement(saleMovement);

      final purchaseMovement = MovementEntity(
        id: 'mov-purch-2',
        insumoId: 'ins-2',
        type: 'PURCHASE',
        quantity: 20.0,
        previousStock: -5.0,
        newStock: 15.0,
        unitCostNio: 55.0, // Delta = 5.0, Total = 25.0 NIO (<= 1500)
        timestamp: now,
        estadoCosteo: 30,
      );

      await database.movementDao.insertMovement(purchaseMovement);
      final regularized = await service.processPendingQueueForInsumo(
        insumoId: 'ins-2',
        triggerMovement: purchaseMovement,
      );

      expect(regularized.length, 1);
      expect(regularized.first.status, 'COMPLETED');

      // Verify correction was recorded
      final corrections = await database.kardexCorrectionDao.findCorrectionsByInsumoId('ins-2');
      expect(corrections.length, 1);
      expect(corrections.first.deltaUnitCostNio, 5.0);
      expect(corrections.first.totalDeltaCostNio, 25.0);
    });

    test('blocks queue item and marks intervention when threshold is exceeded', () async {
      final now = DateTime.now().toIso8601String();
      final saleMovement = MovementEntity(
        id: 'mov-neg-3',
        insumoId: 'ins-3',
        type: 'SALE',
        quantity: -100.0,
        previousStock: 0.0,
        newStock: -100.0,
        unitCostNio: 50.0,
        timestamp: now,
        estadoCosteo: 10,
      );

      await database.movementDao.insertMovement(saleMovement);
      await service.enqueueProvisionalMovement(saleMovement);

      final purchaseMovement = MovementEntity(
        id: 'mov-purch-3',
        insumoId: 'ins-3',
        type: 'PURCHASE',
        quantity: 150.0,
        previousStock: -100.0,
        newStock: 50.0,
        unitCostNio: 80.0, // Delta = 30.0, Total = 3000.0 NIO (> 1500)
        timestamp: now,
        estadoCosteo: 30,
      );

      await database.movementDao.insertMovement(purchaseMovement);
      final results = await service.processPendingQueueForInsumo(
        insumoId: 'ins-3',
        triggerMovement: purchaseMovement,
      );

      expect(results.length, 1);
      expect(results.first.status, 'BLOCKED');

      // Supervisor approval with PIN
      final approved = await service.approveBlockedRegularization(
        queueId: results.first.id,
        supervisorId: 'super-1',
        role: 'MANAGER',
        authMethod: 'PIN',
      );

      expect(approved, isTrue);

      final queueAfter = await database.kardexRecalculateQueueDao.findQueueById(results.first.id);
      expect(queueAfter?.status, 'COMPLETED');

      final corrections = await database.kardexCorrectionDao.findCorrectionsByInsumoId('ins-3');
      expect(corrections.length, 1);
      expect(corrections.first.authorizedByUserId, 'super-1');
      expect(corrections.first.authorizationMethod, 'PIN');
    });
  });
}
