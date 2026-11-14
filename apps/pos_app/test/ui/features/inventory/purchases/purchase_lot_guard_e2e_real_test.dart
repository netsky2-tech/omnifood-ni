import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart' hide Batch;
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/repositories/inventory/inventory_repository_impl.dart';
import 'package:pos_app/domain/models/inventory/batch.dart';
import 'package:pos_app/domain/models/inventory/insumo.dart';
import 'package:pos_app/domain/models/inventory/purchase.dart';
import 'package:pos_app/domain/models/inventory/supplier.dart';
import 'package:pos_app/domain/models/inventory/uom_conversion.dart';
import 'package:pos_app/domain/services/inventory/movement_engine_impl.dart';
import 'package:pos_app/presentation/services/alert_service_impl.dart';
import 'package:pos_app/ui/features/inventory/purchases/purchase_view_model.dart';

/// Real end-to-end for the #938 lot guard on the POS side: a real Floor/SQLite
/// database, the real inventory repository, the real movement engine and the
/// real purchase view model. **Zero mocks for persistence.**
///
/// The invariant under test is `insumos.stock == SUM(batches.remaining_stock)`
/// for an insumo that is tracked by lot. It is the invariant the outflow guard
/// (`batch-allocation.ts`) depends on: when the aggregate rises without a lot,
/// the next sale is refused with "Batch balances cannot cover the outflow" and
/// the counter stops. A unit test with a mocked repository can only prove that
/// the code asked; only a real database proves nothing moved.
void main() {
  late AppDatabase database;
  late InventoryRepositoryImpl repository;
  late PurchaseViewModel viewModel;

  const insumoId = 'ins-lot-guard';
  const supplierId = 'sup-lot-guard';
  const conversionId = 'conv-lot-guard';

  Future<void> seedInsumo({
    required bool isPerishable,
    bool isBatchManaged = false,
  }) async {
    await repository.saveInsumo(
      Insumo(
        id: insumoId,
        name: 'Leche Entera',
        consumptionUom: 'ML',
        stock: 0,
        averageCost: 0,
        isPerishable: isPerishable,
        isBatchManaged: isBatchManaged,
      ),
    );
    await repository.saveSupplier(
      const Supplier(id: supplierId, name: 'Distribuidora Nica'),
    );
    // One purchase unit = 1000 consumption units, so the quantities below are
    // easy to reason about in the assertions.
    await repository.saveConversion(
      const UomConversion(
        id: conversionId,
        insumoId: insumoId,
        unitName: 'L',
        factor: 1000,
        isDefault: true,
      ),
    );
  }

  /// A batch-tracked insumo starts COHERENT: aggregate == sum of lots.
  Future<void> seedExistingLot({required double remainingStock}) async {
    await repository.saveBatch(
      Batch(
        id: 'batch-seed',
        insumoId: insumoId,
        batchNumber: 'LOT-SEED',
        receivedDate: DateTime(2026, 1, 1),
        expirationDate: DateTime(2026, 12, 31),
        remainingStock: remainingStock,
        cost: 10,
      ),
    );
    await repository.updateInsumoStock(insumoId, remainingStock);
  }

  Future<double> aggregateStock() async {
    final insumo = await repository.getInsumoById(insumoId);
    return insumo!.stock;
  }

  Future<double> lotBalance() async {
    final batches = await repository.getBatchesByInsumoId(insumoId);
    return batches.fold<double>(0, (sum, b) => sum + b.remainingStock);
  }

  Future<List<Purchase>> purchases() => repository.getPurchaseHistory();

  Future<int> kardexRows() async {
    final rows = await database.movementDao.findAllMovements();
    return rows.length;
  }

  Future<void> record({
    required String invoiceNumber,
    double quantity = 2,
    String? lotCode,
    DateTime? receivedDate,
    DateTime? expirationDate,
  }) {
    return viewModel.recordPurchase(
      insumoId: insumoId,
      supplierId: supplierId,
      invoiceNumber: invoiceNumber,
      uomConversionId: conversionId,
      quantity: quantity,
      unitCost: 50,
      invoiceDate: DateTime(2026, 1, 3),
      currency: 'NIO',
      lotCode: lotCode,
      receivedDate: receivedDate,
      expirationDate: expirationDate,
    );
  }

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  setUp(() async {
    database = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();
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
      productionTransactionDao: database.productionTransactionDao,
      dio: Dio(),
      database: database,
    );
    viewModel = PurchaseViewModel(
      repository,
      MovementEngineImpl(repository, AlertServiceImpl(repository)),
    );
  });

  tearDown(() async {
    await database.close();
  });

  test(
    'a purchase without a lot on an insumo that already carries one is refused '
    'and NOTHING moves in the database',
    () async {
      await seedInsumo(isPerishable: false);
      await seedExistingLot(remainingStock: 5);
      // The lot requirement must be visible to the operator before saving.
      await viewModel.loadInitialData(insumoId: insumoId);
      final preview = viewModel.buildPurchaseReview(
        insumoId: insumoId,
        uomConversionId: conversionId,
        quantity: 2,
        unitCost: 50,
        currency: 'NIO',
      );
      expect(preview.requiresBatchTracking, isTrue);
      expect(preview.trackedByExistingBatches, isTrue);

      await expectLater(
        record(invoiceNumber: 'F-REFUSED'),
        throwsA(
          isA<ArgumentError>().having(
            (e) => e.message,
            'message',
            contains('already tracked by lot'),
          ),
        ),
      );

      // The whole point: a refusal that wrote anything would BE the divergence.
      expect(await aggregateStock(), 5);
      expect(await lotBalance(), 5);
      expect(await purchases(), isEmpty);
      expect(await kardexRows(), 0);
    },
  );

  test(
    'a purchase WITH a lot records it and keeps stock equal to the sum of lots',
    () async {
      await seedInsumo(isPerishable: false);
      await seedExistingLot(remainingStock: 5);
      await viewModel.loadInitialData(insumoId: insumoId);

      await record(
        invoiceNumber: 'F-ACCEPTED',
        lotCode: 'LOT-NEW',
        receivedDate: DateTime(2026, 1, 3),
        expirationDate: DateTime(2026, 6, 3),
      );

      // 2 purchase units x 1000 = 2000 consumption units on top of 5.
      expect(await aggregateStock(), 2005);
      expect(await lotBalance(), 2005);
      expect(await purchases(), hasLength(1));
      expect((await purchases()).single.lotCode, 'LOT-NEW');
      expect((await purchases()).single.requiresBatchTracking, isTrue);

      final batches = await repository.getBatchesByInsumoId(insumoId);
      expect(batches, hasLength(2));
      expect(
        batches.map((b) => b.batchNumber),
        containsAll(<String>['LOT-SEED', 'LOT-NEW']),
      );
    },
  );

  test(
    'a fully consumed lot still forces a lot on the next purchase',
    () async {
      // remaining_stock = 0 is still proof of lot tracking, and the outflow
      // guard keeps reading that row. Counting only lots with balance would
      // reopen the divergence this guard exists to close.
      await seedInsumo(isPerishable: false);
      await seedExistingLot(remainingStock: 0);
      await viewModel.loadInitialData(insumoId: insumoId);

      expect(
        viewModel
            .buildPurchaseReview(
              insumoId: insumoId,
              uomConversionId: conversionId,
              quantity: 2,
              unitCost: 50,
              currency: 'NIO',
            )
            .requiresBatchTracking,
        isTrue,
      );

      await expectLater(
        record(invoiceNumber: 'F-CONSUMED'),
        throwsA(isA<ArgumentError>()),
      );

      expect(await aggregateStock(), 0);
      expect(await purchases(), isEmpty);
    },
  );

  test(
    'a NON-perishable insumo with no lots keeps buying without any lot field',
    () async {
      // The regression direction: the guard must not turn every purchase into
      // a lot-bearing one.
      await seedInsumo(isPerishable: false);
      await viewModel.loadInitialData(insumoId: insumoId);

      expect(
        viewModel
            .buildPurchaseReview(
              insumoId: insumoId,
              uomConversionId: conversionId,
              quantity: 2,
              unitCost: 50,
              currency: 'NIO',
            )
            .requiresBatchTracking,
        isFalse,
      );

      await record(invoiceNumber: 'F-NO-LOTS');

      expect(await aggregateStock(), 2000);
      expect(await repository.getBatchesByInsumoId(insumoId), isEmpty);
      expect(await purchases(), hasLength(1));
      expect((await purchases()).single.requiresBatchTracking, isFalse);
    },
  );

  test(
    'a perishable insumo without a lot keeps the previous behaviour',
    () async {
      await seedInsumo(isPerishable: true);
      await viewModel.loadInitialData(insumoId: insumoId);

      await expectLater(
        record(invoiceNumber: 'F-PERISHABLE'),
        throwsA(
          isA<ArgumentError>().having(
            (e) => e.message,
            'message',
            contains('batch-managed items'),
          ),
        ),
      );

      expect(await aggregateStock(), 0);
      expect(await purchases(), isEmpty);
    },
  );

  test(
    'a lot code of only whitespace is treated as NO lot and is refused',
    () async {
      // The form does not trim, so `'   '` would otherwise pass the
      // missing-lot check and store a batch number nobody can read back.
      await seedInsumo(isPerishable: false);
      await seedExistingLot(remainingStock: 5);
      await viewModel.loadInitialData(insumoId: insumoId);

      await expectLater(
        record(
          invoiceNumber: 'F-BLANK-LOT',
          lotCode: '   ',
          receivedDate: DateTime(2026, 1, 3),
          expirationDate: DateTime(2026, 6, 3),
        ),
        throwsA(isA<ArgumentError>()),
      );

      expect(await aggregateStock(), 5);
      expect(await lotBalance(), 5);
      expect(await purchases(), isEmpty);
    },
  );

  test(
    'the stored lot code is trimmed, not the raw field value',
    () async {
      await seedInsumo(isPerishable: false);
      await seedExistingLot(remainingStock: 5);
      await viewModel.loadInitialData(insumoId: insumoId);

      await record(
        invoiceNumber: 'F-TRIM',
        lotCode: '  LOT-TRIMMED  ',
        receivedDate: DateTime(2026, 1, 3),
        expirationDate: DateTime(2026, 6, 3),
      );

      expect((await purchases()).single.lotCode, 'LOT-TRIMMED');
      expect(
        (await repository.getBatchesByInsumoId(insumoId))
            .map((b) => b.batchNumber),
        contains('LOT-TRIMMED'),
      );
    },
  );

  test(
    'the cloud flag `isBatchManaged` forces a lot even with no local batch rows',
    () async {
      // The real terminal case: the inbound sync sends `isBatchManaged` (a
      // derived flag) and NOT the batch rows, so on a freshly synced device the
      // local `batches` table is empty while the cloud holds lots. Reading only
      // the local table would let the operator save a lot-less purchase locally
      // and fail later in the cloud.
      await seedInsumo(isPerishable: false, isBatchManaged: true);
      await viewModel.loadInitialData(insumoId: insumoId);
      expect(await repository.getBatchesByInsumoId(insumoId), isEmpty);

      final preview = viewModel.buildPurchaseReview(
        insumoId: insumoId,
        uomConversionId: conversionId,
        quantity: 2,
        unitCost: 50,
        currency: 'NIO',
      );
      expect(preview.requiresBatchTracking, isTrue);
      expect(preview.trackedByExistingBatches, isTrue);

      await expectLater(
        record(invoiceNumber: 'F-CLOUD-FLAG'),
        throwsA(
          isA<ArgumentError>().having(
            (e) => e.message,
            'message',
            contains('already tracked by lot'),
          ),
        ),
      );

      expect(await aggregateStock(), 0);
      expect(await purchases(), isEmpty);
    },
  );

  test(
    'queues the purchase with a UUID id, not a numeric timestamp',
    () async {
      // The cloud column is `uuid`; a numeric id made every purchase fail the
      // sync with `invalid input syntax for type uuid` and retry forever.
      await seedInsumo(isPerishable: false);
      await viewModel.loadInitialData(insumoId: insumoId);

      await record(invoiceNumber: 'F-UUID');

      final queued = (await purchases()).single;
      expect(
        RegExp(
          r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
        ).hasMatch(queued.id),
        isTrue,
        reason: 'purchase id must be a UUID, got ${queued.id}',
      );
    },
  );

  test(
    'the preview and the save agree on every insumo shape',
    () async {
      // A preview that says "no lot needed" while the save refuses would send
      // the operator into a form that cannot succeed.
      await seedInsumo(isPerishable: false);
      await viewModel.loadInitialData(insumoId: insumoId);

      Future<bool> previewSaysLotRequired() async {
        await viewModel.loadInitialData(insumoId: insumoId);
        return viewModel
            .buildPurchaseReview(
              insumoId: insumoId,
              uomConversionId: conversionId,
              quantity: 2,
              unitCost: 50,
              currency: 'NIO',
            )
            .requiresBatchTracking;
      }

      Future<bool> saveRefusedWithoutLot(String invoiceNumber) async {
        try {
          await record(invoiceNumber: invoiceNumber);
          return false;
        } on ArgumentError {
          return true;
        }
      }

      // No lots: both say no.
      expect(await previewSaysLotRequired(), isFalse);
      expect(await saveRefusedWithoutLot('F-AGREE-1'), isFalse);

      // One lot appears: both flip to yes, in the same direction.
      await seedExistingLot(remainingStock: 5);
      expect(await previewSaysLotRequired(), isTrue);
      expect(await saveRefusedWithoutLot('F-AGREE-2'), isTrue);
    },
  );
}
