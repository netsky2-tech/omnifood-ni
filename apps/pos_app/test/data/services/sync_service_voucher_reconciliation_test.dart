import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/local_config_entity.dart';
import 'package:pos_app/data/models/sales/cashier_session_entity.dart';
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
  late List<Map<String, dynamic>> capturedShiftSyncRequests;

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
    capturedShiftSyncRequests = [];
    dio = Dio();
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          if (options.path == '/sales/shifts/sync') {
            capturedShiftSyncRequests.add(
              Map<String, dynamic>.from(options.data as Map),
            );
            final body = options.data as Map;
            final records = [
              ...(body['sessions'] as List),
              ...(body['movements'] as List),
            ];
            return handler.resolve(
              Response(
                requestOptions: options,
                statusCode: 200,
                data: {
                  'received': records.length,
                  'processed': records.length,
                  'failed': 0,
                  'results': [
                    for (final record in records)
                      {
                        'idempotencyKey': (record as Map)['id'],
                        'status': 'ACCEPTED',
                      },
                  ],
                },
              ),
            );
          }
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
    String? reconciledByUserId = 'cajero-01',
    String? overrideSupervisorRef,
    String? voucherCode,
    String? reconciliationStatus,
  }) async {
    final now = DateTime.now().millisecondsSinceEpoch;
    final isOverride = overrideSupervisorRef != null;
    final payment = PaymentEntity(
      id: id,
      invoiceId: 'inv-vsync-01',
      method: 'card',
      amount: 400.0,
      amountNio: 400.0,
      voucherCode: voucherCode ??
          (id == 'pay-recon-failed' || isOverride
              ? 'OVERRIDE: sin voucher'
              : '654321'),
      reconciliationStatus: reconciliationStatus ??
          (id == 'pay-recon-failed' || isOverride
              ? 'MANUAL_OVERRIDE'
              : 'CONCILIADO'),
      reconciliationSyncStatus: syncStatus,
      cardBrand: 'VISA',
      cardType: 'CREDITO',
      bankPos: 'BAC',
      last4: '1122',
      batchNumber: '003',
      reconciledAt: now,
      reconciledByUserId: reconciledByUserId,
      overrideSupervisorRef: overrideSupervisorRef,
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
      // A normal reconciliation never carries a supervisor credential: the
      // key is omitted entirely, never sent as null.
      expect(first.containsKey('overrideSupervisorRef'), isFalse);

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

  /// S2 (#68): seeds a shift session, an invoice bound to it, and card
  /// payments in the three reconciliation states plus a cash payment.
  Future<void> seedShiftWithVoucherState(
    String shiftId, {
    required bool isClosed,
  }) async {
    final now = DateTime.now().millisecondsSinceEpoch;
    await database.cashierSessionDao.insertSession(
      CashierSessionEntity(
        id: shiftId,
        userId: 'user-cajero',
        terminalId: 'pos-01',
        openedAt: now - 3600000,
        closedAt: isClosed ? now : null,
        isClosed: isClosed,
        expectedNio: 1000,
        syncStatus: 'pending',
      ),
    );
    await database.invoiceDao.insertInvoice(
      InvoiceEntity(
        id: 'inv-$shiftId',
        number: '001-001-01-00000077',
        createdAt: now,
        userId: 'user-cajero',
        subtotal: 1000.0,
        totalTax: 150.0,
        total: 1150.0,
        isCanceled: false,
        syncStatus: 'synced',
        paymentStatus: 'paid',
        type: 'regular',
        terminalId: 'pos-01',
        shiftId: shiftId,
      ),
    );
    await database.paymentDao.insertPayments([
      for (final (index, status) in const ['PENDIENTE', 'PENDIENTE'].indexed)
        PaymentEntity(
          id: 'pay-$shiftId-pending-$index',
          invoiceId: 'inv-$shiftId',
          method: 'card',
          amount: 100.0,
          amountNio: 100.0,
          voucherCode: 'PENDIENTE',
          reconciliationStatus: status,
          createdAt: now,
        ),
      PaymentEntity(
        id: 'pay-$shiftId-reconciled',
        invoiceId: 'inv-$shiftId',
        method: 'card',
        amount: 200.0,
        amountNio: 200.0,
        voucherCode: '654321',
        reconciliationStatus: 'CONCILIADO',
        createdAt: now,
      ),
      PaymentEntity(
        id: 'pay-$shiftId-override',
        invoiceId: 'inv-$shiftId',
        method: 'card',
        amount: 300.0,
        amountNio: 300.0,
        voucherCode: 'OVERRIDE: sin voucher',
        reconciliationStatus: 'MANUAL_OVERRIDE',
        createdAt: now,
      ),
      PaymentEntity(
        id: 'pay-$shiftId-cash',
        invoiceId: 'inv-$shiftId',
        method: 'cash',
        amount: 50.0,
        amountNio: 50.0,
        createdAt: now,
      ),
    ]);
  }

  test(
    'a CLOSED shift payload carries the shift\'s voucher reconciliation counts (S2 #68)',
    () async {
      await seedShiftWithVoucherState('shift-vsync-closed', isClosed: true);

      await syncService.triggerManualSync();

      expect(
        syncService.lastSyncError ?? '',
        isNot(contains('Turnos')),
      );
      final shiftPosts = capturedShiftSyncRequests
          .map((body) => body['sessions'] as List)
          .expand((records) => records.cast<Map>())
          .where((session) => session['id'] == 'shift-vsync-closed')
          .toList(growable: false);
      expect(shiftPosts, hasLength(1));

      final session = shiftPosts.single;
      expect(session['status'], 'CLOSED');
      // 2 pending, 1 reconciled, 1 overridden: the shift's voucher state
      // rides the close push, and the cash payment is never counted.
      expect(session['cardVouchersPending'], 2);
      expect(session['cardVouchersReconciled'], 1);
      expect(session['cardVouchersOverridden'], 1);

      // The closed session was accepted and is marked synced.
      final stored = await database.cashierSessionDao
          .getSessionById('shift-vsync-closed');
      expect(stored!.syncStatus, 'synced');
    },
  );

  test(
    'an OPEN shift payload omits the voucher counts (close-time fact only)',
    () async {
      await seedShiftWithVoucherState('shift-vsync-open', isClosed: false);

      await syncService.triggerManualSync();

      final shiftPosts = capturedShiftSyncRequests
          .map((body) => body['sessions'] as List)
          .expand((records) => records.cast<Map>())
          .where((session) => session['id'] == 'shift-vsync-open')
          .toList(growable: false);
      expect(shiftPosts, hasLength(1));

      final session = shiftPosts.single;
      expect(session['status'], 'OPEN');
      expect(session.containsKey('cardVouchersPending'), isFalse);
      expect(session.containsKey('cardVouchersReconciled'), isFalse);
      expect(session.containsKey('cardVouchersOverridden'), isFalse);

      // A still-OPEN session intentionally stays pending: the later closed
      // push carries the voucher state.
      final stored = await database.cashierSessionDao
          .getSessionById('shift-vsync-open');
      expect(stored!.syncStatus, 'pending');
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

  /// Builds a SyncService against the shared in-memory database and fake
  /// dio, with an optional sync-time acting-operator identity source —
  /// the same seam main.dart wires from AuthRepository.getCurrentUser.
  SyncService buildIdentitySyncService({
    Future<String?> Function()? resolveActingUserId,
  }) {
    return SyncService(
      _FakeAuditRepository(),
      _FakeSalesRepository(),
      _FakeInventoryRepository(),
      dio,
      database: database,
      resolveActingUserId: resolveActingUserId,
    );
  }

  Future<PaymentEntity> storedPayment(String id) async {
    final payments =
        await database.paymentDao.getPaymentsByInvoiceId('inv-vsync-01');
    return payments.singleWhere((p) => p.id == id);
  }

  test(
    'a queued reconciliation with an empty reconciledByUserId is backfilled with the resolved operator, persisted, and sent',
    () async {
      // SOHO's tablet holds rows queued since 2026-10-06 with
      // reconciled_by_user_id='' baked into the row: pre-fix writes.
      await seedReconciledPayment('pay-recon-empty-id', reconciledByUserId: '');

      final identitySyncService = buildIdentitySyncService(
        resolveActingUserId: () async => 'cajero-07',
      );

      await identitySyncService.triggerManualSync();

      expect(
        syncService.lastSyncError ?? '',
        isNot(contains('Conciliaciones')),
      );
      expect(capturedReconciliationRequests, hasLength(1));
      final batch =
          capturedReconciliationRequests.single['reconciliations'] as List;
      final pushed = batch.singleWhere(
        (r) => (r as Map)['paymentId'] == 'pay-recon-empty-id',
      ) as Map;
      // Honest attribution: the resolved operator rides the payload, never
      // the empty string that 400s the whole batch server-side.
      expect(pushed['reconciledByUserId'], 'cajero-07');

      // The repair is written through to Floor, not just to the payload.
      final stored = await storedPayment('pay-recon-empty-id');
      expect(stored.reconciledByUserId, 'cajero-07');
      expect(stored.reconciliationSyncStatus, 'synced');
    },
  );

  test(
    'an override row pushes its typed supervisor credential verbatim and a null-credential row omits the key',
    () async {
      await seedReconciledPayment(
        'pay-recon-override-ref',
        overrideSupervisorRef: 'supervisora-ana',
      );
      await seedReconciledPayment('pay-recon-normal');

      await syncService.triggerManualSync();

      expect(capturedReconciliationRequests, hasLength(1));
      final batch =
          capturedReconciliationRequests.single['reconciliations'] as List;
      final overridePayload = batch.singleWhere(
        (r) => (r as Map)['paymentId'] == 'pay-recon-override-ref',
      ) as Map;
      // The typed credential rides the payload verbatim — never validated
      // client-side, never merged into reconciledByUserId.
      expect(overridePayload['overrideSupervisorRef'], 'supervisora-ana');
      expect(overridePayload['reconciledByUserId'], 'cajero-01');
      final normalPayload = batch.singleWhere(
        (r) => (r as Map)['paymentId'] == 'pay-recon-normal',
      ) as Map;
      // Absent credential ⇒ absent key (the forbidNonWhitelisted pipe
      // accepts the legacy shape, and null is never sent).
      expect(normalPayload.containsKey('overrideSupervisorRef'), isFalse);
    },
  );

  test(
    "the queued-identity repair preserves a MANUAL_OVERRIDE row's typed supervisor credential",
    () async {
      // Pre-fix override rows on SOHO's tablet: reconciled_by_user_id='' (no
      // operator stamped) AND a supervisor credential already stored. The
      // sync-time backfill must stamp the operator WITHOUT losing the typed
      // credential — the repaired entity is a hand-built copy, so a missing
      // field there silently nulls the credential on write-through.
      await seedReconciledPayment(
        'pay-recon-empty-id',
        reconciledByUserId: '',
        overrideSupervisorRef: 'sup-07',
      );

      final identitySyncService = buildIdentitySyncService(
        resolveActingUserId: () async => 'cajero-07',
      );

      await identitySyncService.triggerManualSync();

      expect(capturedReconciliationRequests, hasLength(1));
      final batch =
          capturedReconciliationRequests.single['reconciliations'] as List;
      final pushed = batch.single as Map;
      // BOTH identities correct after the repair: operator in the id field,
      // typed supervisor credential in its own field.
      expect(pushed['reconciledByUserId'], 'cajero-07');
      expect(pushed['overrideSupervisorRef'], 'sup-07');

      // And the write-through repair persists both values, not just the id.
      final stored = await storedPayment('pay-recon-empty-id');
      expect(stored.reconciledByUserId, 'cajero-07');
      expect(stored.overrideSupervisorRef, 'sup-07');
    },
  );

  test(
    'a queued row with an empty id and no resolvable operator is deferred while valid rows in the same batch still sync (anti-poisoning)',
    () async {
      await seedReconciledPayment('pay-recon-empty-id', reconciledByUserId: '');
      await seedReconciledPayment('pay-recon-good-id');

      final identitySyncService = buildIdentitySyncService(
        resolveActingUserId: () async => null,
      );

      await identitySyncService.triggerManualSync();

      expect(capturedReconciliationRequests, hasLength(1));
      final batch =
          capturedReconciliationRequests.single['reconciliations'] as List;
      final pushedIds = batch.map((r) => (r as Map)['paymentId']).toSet();
      // The unattributable row must NOT block the batch: only the row that
      // already carries an identity is pushed.
      expect(pushedIds, {'pay-recon-good-id'});

      // The deferred row keeps its pending state for the next pass.
      final stillPending = await database.paymentDao.getPendingReconciliations();
      expect(stillPending.map((p) => p.id), contains('pay-recon-empty-id'));
      expect((await storedPayment('pay-recon-empty-id')).reconciledByUserId, '');
    },
  );

  test(
    'the identity backfill persists: a later pass reads the corrected row instead of re-deciding',
    () async {
      await seedReconciledPayment('pay-recon-empty-id', reconciledByUserId: '');

      // Pass 1: the backend rejects the record (server-side failure), so the
      // row stays pending — but the identity repair must already be durable.
      final failingDio = Dio();
      failingDio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (options, handler) {
            if (options.path == '/sales/payment-reconciliations/sync') {
              capturedReconciliationRequests.add(
                Map<String, dynamic>.from(options.data as Map),
              );
              return handler.resolve(
                Response(
                  requestOptions: options,
                  statusCode: 200,
                  data: {
                    'received': 1,
                    'processed': 0,
                    'failed': 1,
                    'results': [
                      {
                        'paymentId': 'pay-recon-empty-id',
                        'status': 'FAILED',
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
      final firstPass = SyncService(
        _FakeAuditRepository(),
        _FakeSalesRepository(),
        _FakeInventoryRepository(),
        failingDio,
        database: database,
        resolveActingUserId: () async => 'cajero-07',
      );
      await firstPass.triggerManualSync();

      final afterFirstPass = await storedPayment('pay-recon-empty-id');
      expect(afterFirstPass.reconciledByUserId, 'cajero-07');
      expect(afterFirstPass.reconciliationSyncStatus, 'pending');

      // Pass 2: no operator is resolvable anymore, but the row now carries
      // the persisted id — it must be sent with it, not re-deferred.
      final secondPass = buildIdentitySyncService(
        resolveActingUserId: () async => null,
      );
      await secondPass.triggerManualSync();

      expect(capturedReconciliationRequests, hasLength(2));
      final secondBatch =
          capturedReconciliationRequests.last['reconciliations'] as List;
      final row = secondBatch.single as Map;
      expect(row['paymentId'], 'pay-recon-empty-id');
      expect(row['reconciledByUserId'], 'cajero-07');
    },
  );

  test(
    'rows that already carry a non-empty id are never overwritten by the resolver',
    () async {
      await seedReconciledPayment('pay-recon-good-id');

      final identitySyncService = buildIdentitySyncService(
        resolveActingUserId: () async => 'cajero-07',
      );

      await identitySyncService.triggerManualSync();

      final batch =
          capturedReconciliationRequests.single['reconciliations'] as List;
      final row = batch.single as Map;
      expect(row['paymentId'], 'pay-recon-good-id');
      expect(row['reconciledByUserId'], 'cajero-01');

      final stored = await storedPayment('pay-recon-good-id');
      expect(stored.reconciledByUserId, 'cajero-01');
    },
  );
}
