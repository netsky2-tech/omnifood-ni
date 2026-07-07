import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/database/migrations.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/inventory/insumo_entity.dart';
import 'package:pos_app/data/models/inventory/movement_entity.dart';
import 'package:pos_app/data/models/inventory/movement_sync_state_entity.dart';
import 'package:pos_app/data/models/inventory/purchase_entity.dart';
import 'package:pos_app/data/models/inventory/batch_entity.dart';
import 'package:pos_app/data/models/inventory/count_line_entity.dart';
import 'package:pos_app/data/models/inventory/count_session_document_entity.dart';
import 'package:pos_app/data/models/inventory/recipe_version_document_entity.dart';
import 'package:pos_app/data/models/inventory/production_order_document_entity.dart';
import 'package:pos_app/data/models/inventory/forensic_alert_entity.dart';

void main() {
  late AppDatabase database;

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  setUp(() async {
    database = await $FloorAppDatabase
        .inMemoryDatabaseBuilder()
        .addCallback(inventoryMovementAppendOnlyCallback)
        .build();
  });

  tearDown(() async {
    await database.close();
  });

  group('Inventory Database Integration', () {
    test(
      'should record movement and update stock in transaction-like flow',
      () async {
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
      },
    );

    test(
      'should save and retrieve batch_deductions in MovementEntity',
      () async {
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
        final savedMovement = retrieved.firstWhere(
          (m) => m.id == 'mov-batch-1',
        );
        expect(
          savedMovement.batch_deductions,
          '[{"batchId":"b1","quantity":2.0}]',
        );
      },
    );

    test(
      'keeps movement rows immutable while sync state moves through pending failed and synced',
      () async {
        final movement = MovementEntity(
          id: 'mov-sync-1',
          insumoId: 'ins-1',
          type: 'SALE',
          quantity: -2.0,
          previousStock: 10.0,
          newStock: 8.0,
          timestamp: '2026-06-30T10:00:00.000Z',
        );

        await database.movementDao.insertMovement(movement);

        final pending = await database.movementDao.findUnsyncedMovements();
        expect(pending.map((item) => item.id), contains('mov-sync-1'));

        await database.movementSyncStateDao.upsertSyncState(
          const MovementSyncStateEntity(
            movementId: 'mov-sync-1',
            syncStatus: MovementSyncStateStatus.failed,
            lastAttemptedAt: '2026-06-30T10:01:00.000Z',
            lastError: 'timeout',
          ),
        );

        final failedState = await database.movementSyncStateDao
            .findByMovementId('mov-sync-1');
        final stillUnsynced = await database.movementDao
            .findUnsyncedMovements();
        final historyAfterFailure = await database.movementDao
            .findAllMovements();

        expect(failedState?.syncStatus, MovementSyncStateStatus.failed);
        expect(stillUnsynced.map((item) => item.id), contains('mov-sync-1'));
        expect(historyAfterFailure.single.newStock, 8.0);

        await database.movementSyncStateDao.upsertSyncState(
          const MovementSyncStateEntity(
            movementId: 'mov-sync-1',
            syncStatus: MovementSyncStateStatus.synced,
            lastAttemptedAt: '2026-06-30T10:02:00.000Z',
            syncedAt: '2026-06-30T10:02:00.000Z',
          ),
        );

        final syncedState = await database.movementSyncStateDao
            .findByMovementId('mov-sync-1');
        final unsyncedAfterSuccess = await database.movementDao
            .findUnsyncedMovements();
        final historyAfterSuccess = await database.movementDao
            .findAllMovements();

        expect(syncedState?.syncStatus, MovementSyncStateStatus.synced);
        expect(unsyncedAfterSuccess, isEmpty);
        expect(historyAfterSuccess.single.id, 'mov-sync-1');
        expect(historyAfterSuccess.single.quantity, -2.0);
      },
    );

    test('rejects direct updates and deletes on inventory_movements', () async {
      final movement = MovementEntity(
        id: 'mov-append-only',
        insumoId: 'ins-1',
        type: 'SALE',
        quantity: -1.0,
        previousStock: 5.0,
        newStock: 4.0,
        timestamp: '2026-06-30T11:00:00.000Z',
      );

      await database.movementDao.insertMovement(movement);

      await expectLater(
        database.database.rawUpdate(
          'UPDATE inventory_movements SET reason = ? WHERE id = ?',
          ['tampered', 'mov-append-only'],
        ),
        throwsA(isA<Exception>()),
      );

      await expectLater(
        database.database.rawDelete(
          'DELETE FROM inventory_movements WHERE id = ?',
          ['mov-append-only'],
        ),
        throwsA(isA<Exception>()),
      );

      final persisted = await database.movementDao.findAllMovements();
      expect(persisted.single.id, 'mov-append-only');
      expect(persisted.single.reason, isNull);
    });

    test('should find insumos by multiple ids', () async {
      final insumos = [
        InsumoEntity(
          id: 'i1',
          name: 'Insumo 1',
          consumptionUom: 'u1',
          stock: 10,
          averageCost: 0,
        ),
        InsumoEntity(
          id: 'i2',
          name: 'Insumo 2',
          consumptionUom: 'u2',
          stock: 20,
          averageCost: 0,
        ),
        InsumoEntity(
          id: 'i3',
          name: 'Insumo 3',
          consumptionUom: 'u3',
          stock: 30,
          averageCost: 0,
        ),
      ];
      await database.insumoDao.insertInsumos(insumos);

      final result = await database.insumoDao.findInsumosByIds(['i1', 'i3']);

      expect(result.length, 2);
      expect(result.any((e) => e.id == 'i1'), true);
      expect(result.any((e) => e.id == 'i3'), true);
      expect(result.any((e) => e.id == 'i2'), false);
    });

    test(
      'should persist purchase FX preview fields and batch received date',
      () async {
        await database.purchaseDao.insertPurchase(
          PurchaseEntity(
            id: 'pur-1',
            insumoId: 'ins-1',
            supplierId: 'sup-1',
            invoiceNumber: 'INV-1001',
            quantity: 12,
            unitCost: 10,
            timestamp: DateTime.now().toIso8601String(),
            invoiceDate: '2026-01-10',
            currency: 'USD',
            bcnRate: 36.5,
            fxRateMode: 'official',
            unitCostNio: 365,
            cppBeforeNio: 200,
            projectedCppNio: 250,
            lotCode: 'LOT-1',
            receivedDate: '2026-01-10',
            expirationDate: '2026-02-10',
            requiresBatchTracking: true,
          ),
        );
        await database.batchDao.insertBatch(
          BatchEntity(
            id: 'bat-1',
            insumoId: 'ins-1',
            batchNumber: 'LOT-1',
            receivedDate: '2026-01-10',
            expirationDate: '2026-02-10',
            remainingStock: 12,
            cost: 365,
          ),
        );

        final purchases = await database.purchaseDao.findAllPurchases();
        final batches = await database.batchDao.findActiveBatchesByInsumoId(
          'ins-1',
        );

        expect(purchases.single.currency, 'USD');
        expect(purchases.single.invoiceNumber, 'INV-1001');
        expect(purchases.single.fxRateMode, 'official');
        expect(purchases.single.projectedCppNio, 250);
        expect(purchases.single.requiresBatchTracking, true);
        expect(batches.single.receivedDate, '2026-01-10');
      },
    );

    test(
      'should persist recipe versions and production receipt documents',
      () async {
        await database.recipeVersionDocumentDao.upsertDocument(
          const RecipeVersionDocumentEntity(
            id: 'rv-1',
            productId: 'prod-1',
            productName: 'Vanilla Latte',
            versionNumber: 8,
            yieldQuantity: 10,
            technicalShrinkPct: 6,
            createdAt: '2026-06-02T10:00:00.000Z',
            componentsJson: '[{"ingredientId":"ins-1"}]',
          ),
        );
        await database.productionOrderDocumentDao.upsertDocument(
          const ProductionOrderDocumentEntity(
            id: 'prod-order-1',
            recipeVersionId: 'rv-1',
            recipeProductId: 'prod-1',
            recipeProductName: 'Vanilla Latte',
            producedInsumoId: 'ins-1',
            producedInsumoName: 'Base',
            plannedQuantity: 10,
            actualQuantity: 9,
            producedBatchNumber: 'PB-1',
            producedExpirationDate: '2026-07-01T00:00:00.000Z',
            operationDate: '2026-06-02T10:00:00.000Z',
            status: 'CLOSED_PENDING_SYNC',
            movementReferencesJson: '["mov-1","mov-2"]',
          ),
        );

        final recipeDocs = await database.recipeVersionDocumentDao
            .findByProductId('prod-1');
        final productionDocs = await database.productionOrderDocumentDao
            .findAllDocuments();

        expect(recipeDocs.single.versionNumber, 8);
        expect(
          productionDocs.single.movementReferencesJson,
          '["mov-1","mov-2"]',
        );
      },
    );

    test('should persist count sessions and nested count lines', () async {
      await database.countSessionDao.upsertDocument(
        const CountSessionDocumentEntity(
          id: 'count-1',
          warehouseId: 'wh-1',
          warehouseName: 'Bodega Central',
          cutoffAt: '2026-06-02T10:00:00.000Z',
          status: 'approved',
          createdAt: '2026-06-02T09:00:00.000Z',
          updatedAt: '2026-06-02T10:00:00.000Z',
          movementReferencesJson: '["count-1:line-1"]',
        ),
      );
      await database.countLineDao.insertLines(const [
        CountLineEntity(
          id: 'line-1',
          sessionId: 'count-1',
          insumoId: 'ins-1',
          insumoName: 'Leche',
          uom: 'L',
          theoreticalQuantity: 15,
          approvedEntryIndex: 1,
          entriesJson:
              '[{"countedQuantity":9,"disputed":true},{"countedQuantity":10,"disputed":false}]',
        ),
      ]);

      final sessions = await database.countSessionDao.findAllDocuments();
      final lines = await database.countLineDao.findBySessionId('count-1');

      expect(sessions.single.status, 'approved');
      expect(sessions.single.movementReferencesJson, '["count-1:line-1"]');
      expect(lines.single.approvedEntryIndex, 1);
      expect(lines.single.entriesJson, contains('countedQuantity'));
    });

    test(
      'should persist forensic alert lifecycle state and source references',
      () async {
        await database.forensicAlertDao.upsertAlert(
          const ForensicAlertEntity(
            id: 'alert-1',
            alertType: 'LOW_STOCK',
            severity: 'high',
            message: 'Stock bajo en leche.',
            createdAt: '2026-06-02T10:00:00.000Z',
            status: 'acknowledged',
            note: 'Revisado',
            actorLabel: 'manager-1',
            actedAt: '2026-06-02T10:05:00.000Z',
            sourceMovementId: 'mov-1',
            sourceDocumentId: 'purchase-1',
            sourceDocumentType: 'PURCHASE',
            metadataJson: '{"item":"Leche"}',
          ),
        );

        final alerts = await database.forensicAlertDao.findAllAlerts();
        final unsynced = await database.forensicAlertDao
            .findUnsyncedLifecycleAlerts();

        expect(alerts.single.status, 'acknowledged');
        expect(alerts.single.sourceMovementId, 'mov-1');
        expect(alerts.single.metadataJson, contains('Leche'));
        expect(unsynced.single.id, 'alert-1');
      },
    );
  });
}
