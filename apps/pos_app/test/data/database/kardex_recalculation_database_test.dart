import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/inventory/kardex_recalculate_queue_entity.dart';
import 'package:pos_app/data/models/inventory/kardex_correction_entity.dart';
import 'package:pos_app/data/models/inventory/movement_entity.dart';

void main() {
  late AppDatabase database;

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  setUp(() async {
    database = await $FloorAppDatabase
        .inMemoryDatabaseBuilder()
        .build();
  });

  tearDown(() async {
    await database.close();
  });

  group('Kardex Recalculation Database Contracts (Batch 6b Phase 1)', () {
    test('inserts and queries movement with 5 costing lifecycle fields', () async {
      final now = DateTime.now().toIso8601String();
      final movement = MovementEntity(
        id: 'mov-costing-1',
        insumoId: 'ins-1',
        type: 'SALE',
        quantity: -5.0,
        previousStock: 0.0,
        newStock: -5.0,
        timestamp: now,
        estadoCosteo: 10, // PROVISIONAL
        intentosCount: 1,
        bloqueoMotivo: 'NEGATIVE_STOCK_TRIGGER',
        autorizadoPorUsuarioId: 'user-supervisor-1',
        fechaAutorizacion: now,
      );

      await database.movementDao.insertMovement(movement);

      final movements = await database.movementDao.findAllMovements();
      expect(movements.length, 1);
      expect(movements.first.id, 'mov-costing-1');
      expect(movements.first.estadoCosteo, 10);
      expect(movements.first.intentosCount, 1);
      expect(movements.first.bloqueoMotivo, 'NEGATIVE_STOCK_TRIGGER');
      expect(movements.first.autorizadoPorUsuarioId, 'user-supervisor-1');
    });

    test('enforces queue persistence, query by status and positional claim transaction', () async {
      final now = DateTime.now().toIso8601String();
      final queueItem = KardexRecalculateQueueEntity(
        id: 'queue-uuid-1',
        insumoId: 'ins-100',
        originMovementId: 'mov-origin-1',
        triggerMovementId: 'mov-trigger-1',
        status: 'PENDING',
        attempts: 0,
        createdAt: now,
        updatedAt: now,
      );

      await database.kardexRecalculateQueueDao.insertQueueItem(queueItem);

      final pending = await database.kardexRecalculateQueueDao.findQueueByStatus('PENDING');
      expect(pending.length, 1);
      expect(pending.first.id, 'queue-uuid-1');

      // Claim queue item using positional transaction arguments
      final claimedAt = DateTime.now().toIso8601String();
      await database.kardexRecalculateQueueDao.claimQueueItem(
        'queue-uuid-1',
        'PROCESSING',
        claimedAt,
        1,
      );

      final processing = await database.kardexRecalculateQueueDao.findQueueByStatus('PROCESSING');
      expect(processing.length, 1);
      expect(processing.first.status, 'PROCESSING');
      expect(processing.first.attempts, 1);
      expect(processing.first.claimedAt, claimedAt);
    });

    test('records correction and enforces idempotent lineage hash behavior', () async {
      final now = DateTime.now().toIso8601String();
      final correction = KardexCorrectionEntity(
        id: 'corr-uuid-1',
        insumoId: 'ins-100',
        originMovementId: 'mov-origin-1',
        triggerMovementId: 'mov-trigger-1',
        previousUnitCostNio: 100.0,
        recalculatedUnitCostNio: 115.5,
        deltaUnitCostNio: 15.5,
        totalDeltaCostNio: 77.5,
        affectedQuantity: 5.0,
        lineageHash: 'sha256-lineage-alpha-1',
        authorizedByUserId: 'user-admin',
        authorizedByRole: 'MANAGER',
        authorizationMethod: 'PIN',
        createdAt: now,
      );

      await database.kardexCorrectionDao.recordCorrectionWithLineage(correction);

      final corrections = await database.kardexCorrectionDao.findCorrectionsByInsumoId('ins-100');
      expect(corrections.length, 1);
      expect(corrections.first.id, 'corr-uuid-1');
      expect(corrections.first.deltaUnitCostNio, 15.5);

      // Re-recording the same lineage hash should be idempotent
      final duplicateCorrection = KardexCorrectionEntity(
        id: 'corr-uuid-2',
        insumoId: 'ins-100',
        originMovementId: 'mov-origin-1',
        triggerMovementId: 'mov-trigger-1',
        previousUnitCostNio: 100.0,
        recalculatedUnitCostNio: 115.5,
        deltaUnitCostNio: 15.5,
        totalDeltaCostNio: 77.5,
        affectedQuantity: 5.0,
        lineageHash: 'sha256-lineage-alpha-1', // Same hash
        createdAt: now,
      );

      await database.kardexCorrectionDao.recordCorrectionWithLineage(duplicateCorrection);

      final afterDuplicate = await database.kardexCorrectionDao.findCorrectionsByInsumoId('ins-100');
      expect(afterDuplicate.length, 1);
      expect(afterDuplicate.first.id, 'corr-uuid-1');
    });
  });
}
