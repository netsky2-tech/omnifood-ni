import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/local_config_entity.dart';
import 'package:pos_app/data/models/sales/invoice_entity.dart';
import 'package:pos_app/data/models/sales/payment_entity.dart';
import 'package:pos_app/data/services/sync_service.dart';
import 'package:pos_app/domain/models/inventory/count_session_document.dart';
import 'package:pos_app/domain/models/inventory/forensic_alert.dart';
import 'package:pos_app/domain/models/inventory/inventory_movement.dart';
import 'package:pos_app/domain/models/inventory/production_order_document.dart';
import 'package:pos_app/domain/models/inventory/purchase.dart';
import 'package:pos_app/domain/models/inventory/recipe_version_document.dart';
import 'package:pos_app/domain/repositories/audit_repository.dart';
import 'package:pos_app/domain/repositories/inventory/inventory_repository.dart';
import 'package:pos_app/domain/repositories/sales/sales_repository.dart';

class _FakeSalesRepository implements SalesRepository {
  @override
  dynamic noSuchMethod(Invocation invocation) => throw UnimplementedError();

  @override
  Future<List<Map<String, dynamic>>> getUnsyncedAggregates() async => [];
}

class _FakeAuditRepository implements AuditRepository {
  @override
  dynamic noSuchMethod(Invocation invocation) => throw UnimplementedError();

  @override
  Future<AuditSyncOutcome> syncLogs() async =>
      const AuditSyncOutcome.complete();
}

class _FakeInventoryRepository implements InventoryRepository {
  @override
  dynamic noSuchMethod(Invocation invocation) => throw UnimplementedError();

  @override
  Future<List<InventoryMovement>> getUnsyncedMovements() async => [];

  @override
  Future<List<Purchase>> getUnsyncedPurchases() async => [];

  @override
  Future<List<CountSessionDocument>> getUnsyncedCountSessionDocuments() async =>
      [];

  @override
  Future<List<ProductionOrderDocument>> getUnsyncedProductionOrders() async => [];

  @override
  Future<List<RecipeVersionDocument>> getUnsyncedRecipeVersionDocuments() async =>
      [];

  @override
  Future<List<ForensicAlert>> getUnsyncedForensicAlerts() async => [];
}

void main() {
  late AppDatabase database;
  late Dio dio;
  late SyncService syncService;
  late List<Map<String, dynamic>> capturedReconciliationRequests;

  setUp(() async {
    database = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();

    await database.localConfigDao.saveConfig(
      LocalConfigEntity(key: 'tenant_id', value: 'tenant-test-1'),
    );

    await database.invoiceDao.insertInvoice(
      InvoiceEntity(
        id: 'inv-vsync-01',
        number: '001-001-01-00000042',
        createdAt: DateTime.now().millisecondsSinceEpoch,
        userId: 'user-cajero',
        subtotal: 1000.0,
        totalTax: 150.0,
        total: 1150.0,
        isCanceled: false,
        // Already synced: the reconciliation push is the only outbound path
        // left for these payments' voucher state (S1a, backlog #68).
        syncStatus: 'synced',
        paymentStatus: 'paid',
        type: 'regular',
        terminalId: 'pos-01',
        sourceSequence: 1,
        idempotencyKey: 'idemp-vsync-1',
        payloadHash: 'hash-vsync-1',
        bcnOfficialRate: 36.6241,
        commercialRate: 36.50,
        totalUsd: 31.51,
      ),
    );

    capturedReconciliationRequests = [];
    dio = Dio();
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          if (options.path == '/sales/payment-reconciliations/sync') {
            capturedReconciliationRequests.add(
              Map<String, dynamic>.from(options.data as Map),
            );
            final batch = (options.data as Map)['reconciliations'] as List;
            return handler.resolve(
              Response(
                requestOptions: options,
                statusCode: 200,
                data: {
                  'received': batch.length,
                  'processed': batch.length - 1,
                  'failed': 1,
                  'results': [
                    for (final record in batch)
                      {
                        'paymentId': (record as Map)['paymentId'],
                        // The last record of the batch is rejected the way
                        // the backend rejects an unknown payment id, so a
                        // failed record must stay pending for retry.
                        'status':
                            record['paymentId'] == 'pay-recon-failed'
                                ? 'FAILED'
                                : 'ACCEPTED',
                      },
                  ],
                },
              ),
            );
          }
          if (options.path.startsWith('/v1/catalog') ||
              options.path.startsWith('/v1/alerts')) {
            return handler.resolve(
              Response(
                requestOptions: options,
                statusCode: 200,
                data: {
                  'products': [],
                  'catalogValues': [],
                  'insumos': [],
                  'recipes': [],
                  'users': [],
                  'securityProfiles': [],
                  'alerts': [],
                  'version': 1,
                },
              ),
            );
          }
          return handler.next(options);
        },
      ),
    );

    syncService = SyncService(
      _FakeAuditRepository(),
      _FakeSalesRepository(),
      _FakeInventoryRepository(),
      dio,
      database: database,
    );
  });

  tearDown(() async {
    await database.close();
  });

  Future<PaymentEntity> seedReconciledPayment(
    String id, {
    String syncStatus = 'pending',
  }) async {
    final now = DateTime.now().millisecondsSinceEpoch;
    final payment = PaymentEntity(
      id: id,
      invoiceId: 'inv-vsync-01',
      method: 'card',
      amount: 400.0,
      amountNio: 400.0,
      voucherCode: id == 'pay-recon-failed' ? 'OVERRIDE: sin voucher' : '654321',
      reconciliationStatus:
          id == 'pay-recon-failed' ? 'MANUAL_OVERRIDE' : 'CONCILIADO',
      reconciliationSyncStatus: syncStatus,
      cardBrand: 'VISA',
      cardType: 'CREDITO',
      bankPos: 'BAC',
      last4: '1122',
      batchNumber: '003',
      reconciledAt: now,
      reconciledByUserId: 'cajero-01',
      createdAt: now,
    );
    await database.paymentDao.insertPayments([payment]);
    return payment;
  }

  test(
    'pushes pending reconciliations and marks ACCEPTED rows synced while a FAILED row stays pending',
    () async {
      await seedReconciledPayment('pay-recon-ok-1');
      await seedReconciledPayment('pay-recon-ok-2');
      await seedReconciledPayment('pay-recon-failed');

      await syncService.triggerManualSync();

      expect(
        syncService.lastSyncError ?? '',
        isNot(contains('Conciliaciones')),
      );
      expect(capturedReconciliationRequests, hasLength(1));

      final batch =
          capturedReconciliationRequests.single['reconciliations'] as List;
      expect(batch, hasLength(3));
      final payloadIds = batch.map((r) => (r as Map)['paymentId']).toSet();
      expect(payloadIds, {'pay-recon-ok-1', 'pay-recon-ok-2', 'pay-recon-failed'});

      final first = batch.first as Map;
      expect(first['invoiceId'], 'inv-vsync-01');
      expect(first['reconciledByUserId'], 'cajero-01');
      expect(first['reconciledAt'], isA<String>());
      // Optional correlation fields ride along.
      expect(first['batchNumber'], '003');
      expect(first['last4'], '1122');

      final payments =
          await database.paymentDao.getPaymentsByInvoiceId('inv-vsync-01');
      final byId = {for (final p in payments) p.id: p};
      expect(byId['pay-recon-ok-1']!.reconciliationSyncStatus, 'synced');
      expect(byId['pay-recon-ok-2']!.reconciliationSyncStatus, 'synced');
      // A backend-rejected record keeps its pending state and its payload
      // intact for the next pass.
      expect(byId['pay-recon-failed']!.reconciliationSyncStatus, 'pending');
      expect(byId['pay-recon-failed']!.reconciliationStatus, 'MANUAL_OVERRIDE');
      expect(byId['pay-recon-failed']!.voucherCode, 'OVERRIDE: sin voucher');
    },
  );

  test(
    'a payment with no pending reconciliation outbox work is never pushed',
    () async {
      // Default sync status is 'synced': a payment reconciled at checkout
      // travels inside the sale sync and must not create outbox work.
      await seedReconciledPayment('pay-recon-default', syncStatus: 'synced');

      await syncService.triggerManualSync();

      expect(capturedReconciliationRequests, isEmpty);
      expect(
        await database.paymentDao.getPendingReconciliations(),
        isEmpty,
      );
    },
  );

  test(
    'pending reconciliations are counted in getPendingOutboxCount',
    () async {
      expect(await syncService.getPendingOutboxCount(), 0);

      await seedReconciledPayment('pay-recon-count-1');
      await seedReconciledPayment('pay-recon-count-2');

      expect(await syncService.getPendingOutboxCount(), 2);

      await database.paymentDao
          .updateReconciliationSyncStatus('pay-recon-count-1', 'synced');
      expect(await syncService.getPendingOutboxCount(), 1);
    },
  );

  test(
    'pending reconciliations age feeds getOldestPendingItemAge for R-16 stall detection',
    () async {
      expect(await syncService.getOldestPendingItemAge(), isNull);

      await seedReconciledPayment('pay-recon-age-1');

      final age = await syncService.getOldestPendingItemAge();
      expect(age, isNotNull);
      expect(age!.inSeconds, greaterThanOrEqualTo(0));
    },
  );
}
