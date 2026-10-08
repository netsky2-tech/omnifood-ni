import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/customer/customer_point_transaction_entity.dart';
import 'package:pos_app/data/models/customer/customer_entity.dart';
import 'package:pos_app/data/models/fulfillment/fulfillment_persistence_entities.dart';
import 'package:pos_app/data/models/inventory/kardex_correction_entity.dart';
import 'package:pos_app/data/models/sales/cash_movement_entity.dart';
import 'package:pos_app/data/models/sales/cashier_session_entity.dart';
import 'package:pos_app/data/services/network_connectivity_service.dart';
import 'package:pos_app/data/services/sync_service.dart';
import 'package:pos_app/domain/models/audit_log.dart';
import 'package:pos_app/domain/models/inventory/count_session_document.dart';
import 'package:pos_app/domain/models/inventory/forensic_alert.dart';
import 'package:pos_app/domain/models/inventory/inventory_movement.dart';
import 'package:pos_app/domain/models/inventory/production_order_document.dart';
import 'package:pos_app/domain/models/inventory/purchase.dart';
import 'package:pos_app/domain/models/inventory/recipe_version_document.dart';
import 'package:pos_app/domain/repositories/audit_repository.dart';
import 'package:pos_app/domain/repositories/inventory/inventory_repository.dart';
import 'package:pos_app/domain/repositories/sales/sales_repository.dart';
import 'package:pos_app/ui/features/sales/widgets/cloud_sync_status_badge.dart';
import 'package:provider/provider.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart' hide Batch;

/// R-16 truth-in-the-badge widget contract.
///
/// Production defect: the automatic sync stalled for 68 minutes while cash
/// movements and a closed shift never reached the backend, yet the badge
/// stayed green and the dialog said "Nube Sincronizada al 100%". These tests
/// pin the three fixes:
///
/// 1. The stall signal: while online, pending work older than
///    [SyncService.pendingStallThreshold] must render "Sync detenido"
///    (never green) regardless of the cached `status` — a stale pre-sleep
///    idle/success cannot paint green.
/// 2. Fresh pending work is normal: pending items younger than the threshold
///    keep the ordinary amber pending state.
/// 3. Offline and audit-degraded behaviour is unchanged.
///
/// The widget-level tests drive the badge through a fake service so no
/// sqflite runs inside the fake-async widget zone (same pattern as the
/// D-18 audit-degraded test). The *real* pending-count blind spots (cash
/// movements, cash sessions, loyalty transactions) are pinned at the
/// service level in the second group below, against an in-memory Floor
/// database.
class _FakeAuditRepository implements AuditRepository {
  @override
  dynamic noSuchMethod(Invocation invocation) => throw UnimplementedError();

  @override
  Future<AuditSyncOutcome> syncLogs() async =>
      const AuditSyncOutcome.complete();
}

class _FakeSalesRepository implements SalesRepository {
  @override
  dynamic noSuchMethod(Invocation invocation) => throw UnimplementedError();

  @override
  Future<List<Map<String, dynamic>>> getUnsyncedAggregates() async => [];
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
  Future<List<ProductionOrderDocument>> getUnsyncedProductionOrders() async =>
      [];

  @override
  Future<List<RecipeVersionDocument>>
  getUnsyncedRecipeVersionDocuments() async => [];

  @override
  Future<List<ForensicAlert>> getUnsyncedForensicAlerts() async => [];

  @override
  Future<List<KardexCorrectionEntity>> getKardexCorrections() async => [];
}

class _FakeSyncService extends SyncService {
  _FakeSyncService()
    : super(
        _FakeAuditRepository(),
        _FakeSalesRepository(),
        _FakeInventoryRepository(),
        Dio(),
      );

  CloudSyncStatus forcedStatus = CloudSyncStatus.idle;
  bool auditDegraded = false;
  String? forcedLastError;
  int pendingOutbox = 0;
  int pendingAudit = 0;

  /// Age of the oldest unconfirmed pending item, as the real service would
  /// report it. Null when nothing is pending.
  Duration? oldestPendingAge;

  int manualSyncCalls = 0;

  @override
  CloudSyncStatus get status => forcedStatus;

  @override
  bool get isAuditStreamDegraded => auditDegraded;

  @override
  String? get lastSyncError => forcedLastError;

  @override
  Future<int> getPendingOutboxCount() async => pendingOutbox;

  @override
  Future<int> getPendingAuditCount() async => pendingAudit;

  @override
  Future<Duration?> getOldestPendingItemAge() async => oldestPendingAge;

  @override
  Future<AuthorityInertRecipeReport?> getInertRecipeVerdictReport() async =>
      null;

  @override
  Future<SyncRunOutcome> triggerManualSync() async {
    manualSyncCalls++;
    return const SyncRunOutcome.complete();
  }
}

Duration _stalledAge() =>
    SyncService.pendingStallThreshold + const Duration(minutes: 5);

Duration _freshAge() => SyncService.pendingStallThreshold ~/ 5;

Widget _wrapWithProviders(
  SyncService syncService,
  NetworkConnectivityService connectivityService,
) {
  return MaterialApp(
    home: MultiProvider(
      providers: [
        Provider<SyncService>.value(value: syncService),
        Provider<NetworkConnectivityService>.value(value: connectivityService),
      ],
      child: const Scaffold(
        appBar: PreferredSize(
          preferredSize: Size.fromHeight(56),
          child: CloudSyncStatusBadge(),
        ),
      ),
    ),
  );
}

void main() {
  group('CloudSyncStatusBadge — R-16 truth (stall + blind spots)', () {
    late _FakeSyncService syncService;
    late NetworkConnectivityService connectivityService;

    setUp(() {
      final dio = Dio();
      dio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (options, handler) => handler.resolve(
            Response<dynamic>(
              statusCode: 200,
              requestOptions: options,
              data: <String, dynamic>{'ok': true, 'data': []},
            ),
          ),
        ),
      );
      connectivityService = NetworkConnectivityService(dio);
      connectivityService.setOnlineStateForTest(true);
      syncService = _FakeSyncService();
    });

    tearDown(() {
      syncService.dispose();
      connectivityService.dispose();
    });

    testWidgets(
      'shows up to date (green) when online with nothing pending',
      (tester) async {
        syncService.pendingOutbox = 0;
        syncService.oldestPendingAge = null;

        await tester.pumpWidget(
          _wrapWithProviders(syncService, connectivityService),
        );
        await tester.pump();

        expect(find.byIcon(Icons.cloud_done), findsOneWidget);
        expect(find.byIcon(Icons.sync_disabled), findsNothing);
        expect(find.byIcon(Icons.cloud_upload), findsNothing);
      },
    );

    testWidgets(
      'R-16 regression: stale idle + old unconfirmed work renders '
      '"Sync detenido", never green',
      (tester) async {
        // The incident: status kept the pre-sleep `idle` while cash work sat
        // unconfirmed for over an hour. The cached status alone must never
        // produce green.
        syncService.forcedStatus = CloudSyncStatus.idle;
        syncService.pendingOutbox = 2;
        syncService.oldestPendingAge = _stalledAge();

        await tester.pumpWidget(
          _wrapWithProviders(syncService, connectivityService),
        );
        await tester.pump();

        expect(find.byIcon(Icons.cloud_done), findsNothing);
        expect(find.byIcon(Icons.sync_disabled), findsOneWidget);
        expect(
          find.byTooltip(
            'Sync detenido — trabajo sin confirmar hace '
            '${_stalledAge().inMinutes} min',
          ),
          findsOneWidget,
        );
      },
    );

    testWidgets(
      'a stale success status cannot paint green with old unconfirmed work '
      '(status is not the sole source)',
      (tester) async {
        syncService.forcedStatus = CloudSyncStatus.success;
        syncService.pendingOutbox = 1;
        syncService.oldestPendingAge = _stalledAge();

        await tester.pumpWidget(
          _wrapWithProviders(syncService, connectivityService),
        );
        await tester.pump();

        expect(find.byIcon(Icons.cloud_done), findsNothing);
        expect(find.byIcon(Icons.sync_disabled), findsOneWidget);
      },
    );

    testWidgets(
      'stalled dialog keeps Último Sync Exitoso and adds the stall reason '
      'with the force-sync action',
      (tester) async {
        syncService.forcedStatus = CloudSyncStatus.idle;
        syncService.pendingOutbox = 2;
        syncService.oldestPendingAge = _stalledAge();

        await tester.pumpWidget(
          _wrapWithProviders(syncService, connectivityService),
        );
        await tester.pump();

        await tester.tap(
          find.byKey(const Key('cloud_sync_status_badge_button')),
        );
        await tester.pumpAndSettle();

        expect(find.text('Sync detenido'), findsOneWidget);
        expect(
          find.textContaining(
            '${_stalledAge().inMinutes} minutos sin confirmarse',
          ),
          findsOneWidget,
        );
        // The one honest field stays exactly as it was.
        expect(find.text('Último Sync Exitoso:'), findsOneWidget);
        expect(find.byKey(const Key('force_sync_button')), findsOneWidget);
        // The incident lie must be unreachable in this state.
        expect(find.text('Nube Sincronizada al 100%'), findsNothing);
      },
    );

    testWidgets(
      'blind-spot regression: a pending cash movement (counted by the '
      'service) is never shown as up to date',
      (tester) async {
        // The service-level group below proves the real count includes cash
        // movements; here the badge must render the ordinary pending state
        // (amber, with the count) when that work exists and is fresh.
        syncService.pendingOutbox = 1;
        syncService.oldestPendingAge = null;

        await tester.pumpWidget(
          _wrapWithProviders(syncService, connectivityService),
        );
        await tester.pump();

        expect(find.byIcon(Icons.cloud_done), findsNothing);
        expect(find.byIcon(Icons.cloud_upload), findsOneWidget);
        expect(find.text('1'), findsOneWidget);
      },
    );

    testWidgets(
      'fresh pending work younger than the threshold is the normal pending '
      'state, not stalled',
      (tester) async {
        syncService.pendingOutbox = 2;
        syncService.oldestPendingAge = _freshAge();

        await tester.pumpWidget(
          _wrapWithProviders(syncService, connectivityService),
        );
        await tester.pump();

        expect(find.byIcon(Icons.cloud_upload), findsOneWidget);
        expect(find.text('2'), findsOneWidget);
        expect(find.byIcon(Icons.sync_disabled), findsNothing);
        expect(find.byIcon(Icons.cloud_done), findsNothing);
      },
    );

    testWidgets(
      'offline behaviour unchanged: grey cloud_off even with old pending work',
      (tester) async {
        connectivityService.setOnlineStateForTest(false);
        syncService.pendingOutbox = 1;
        syncService.oldestPendingAge = _stalledAge();

        await tester.pumpWidget(
          _wrapWithProviders(syncService, connectivityService),
        );
        await tester.pump();

        expect(find.byIcon(Icons.cloud_off), findsOneWidget);
        expect(find.byIcon(Icons.sync_disabled), findsNothing);
        expect(find.byIcon(Icons.cloud_done), findsNothing);
      },
    );

    testWidgets(
      'audit-degraded still renders amber (D-18 preserved)',
      (tester) async {
        syncService.forcedStatus = CloudSyncStatus.auditDegraded;
        syncService.auditDegraded = true;
        syncService.pendingAudit = 3;

        await tester.pumpWidget(
          _wrapWithProviders(syncService, connectivityService),
        );
        await tester.pump();

        expect(find.byIcon(Icons.sync_problem), findsNothing);
        expect(find.byIcon(Icons.sync_disabled), findsNothing);
        expect(find.byIcon(Icons.cloud_done), findsNothing);
        expect(find.byIcon(Icons.cloud_upload), findsOneWidget);
        expect(
          find.byTooltip(
            'Auditoría pendiente de sincronizar — 3 registro(s)',
          ),
          findsOneWidget,
        );
      },
    );
  });

  group('SyncService pending truth — R-16 blind spots (real database)', () {
    late AppDatabase database;
    late SyncService syncService;

    setUpAll(() {
      sqfliteFfiInit();
      databaseFactory = databaseFactoryFfi;
    });

    setUp(() async {
      database = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();
      syncService = SyncService(
        _FakeAuditRepository(),
        _FakeSalesRepository(),
        _FakeInventoryRepository(),
        Dio(),
        database: database,
      );
    });

    tearDown(() async {
      syncService.dispose();
      await database.close();
    });

    int nowMinus(Duration age) =>
        DateTime.now().subtract(age).millisecondsSinceEpoch;

    test('getPendingOutboxCount counts a pending cash movement (blind spot)',
        () async {
      await database.cashMovementDao.insertMovement(
        CashMovementEntity(
          id: 'cm-1',
          shiftId: 'shift-1',
          terminalId: 'terminal-1',
          type: 'CASH_OUT',
          amountNio: 500,
          reason: 'Compra insumos',
          timestamp: nowMinus(const Duration(minutes: 20)),
        ),
      );

      final count = await syncService.getPendingOutboxCount();

      // The night of the incident the badge read zero exactly because this
      // domain was missing from the count.
      expect(count, 1);
    });

    test(
        'getPendingOutboxCount counts a closed pending cash session '
        '(blind spot)', () async {
      await database.cashierSessionDao.insertSession(
        CashierSessionEntity(
          id: 'cs-1',
          userId: 'user-1',
          openedAt: nowMinus(const Duration(minutes: 30)),
          isClosed: true,
        ),
      );

      final count = await syncService.getPendingOutboxCount();

      expect(count, 1);
    });

    test(
        'getPendingOutboxCount does not count an open shift session still '
        'being re-pushed', () async {
      // An OPEN session stays sync_status='pending' by design until closure
      // and is re-pushed (idempotently) on every pass — counting it would
      // keep the badge permanently above zero during every open shift. The
      // closure is the unconfirmed work, and cash movements inside the
      // shift remain counted independently.
      await database.cashierSessionDao.insertSession(
        CashierSessionEntity(
          id: 'cs-open',
          userId: 'user-1',
          openedAt: nowMinus(const Duration(hours: 2)),
          isClosed: false,
        ),
      );

      final count = await syncService.getPendingOutboxCount();

      expect(count, 0);
    });

    test(
        'getPendingOutboxCount counts a pending loyalty point transaction '
        '(blind spot)', () async {
      await database.customerPointTransactionDao.insertTransaction(
        CustomerPointTransactionEntity(
          id: 'pt-1',
          customerId: 'customer-1',
          type: 'earn',
          points: 10,
          balanceAfter: 10,
          conversionRate: 1,
          createdAt: nowMinus(const Duration(minutes: 10)),
        ),
      );

      final count = await syncService.getPendingOutboxCount();

      expect(count, 1);
    });

    test(
        'getPendingOutboxCount counts a pending fulfillment outbox event '
        '(blind spot #103)', () async {
      await database.fulfillmentPersistenceDao.insertOutboxEvent(
        OutboxEventEntity(
          eventId: 'fe-1',
          tenantId: 'tenant-1',
          deviceId: 'device-1',
          sourceSequence: 1,
          aggregateType: 'ORDER',
          aggregateId: 'order-1',
          idempotencyKey: 'idemp-fe-1',
          payloadHash: 'hash-fe-1',
          topologyRevision: 1,
          state: 'PENDING',
          attempts: 0,
        ),
      );

      final count = await syncService.getPendingOutboxCount();

      expect(count, 1);
    });

    test(
        'getOldestPendingItemAge returns the age of the oldest pending '
        'cash movement', () async {
      await database.cashMovementDao.insertMovement(
        CashMovementEntity(
          id: 'cm-old',
          shiftId: 'shift-1',
          terminalId: 'terminal-1',
          type: 'CASH_IN',
          amountNio: 100,
          reason: 'Fondo',
          timestamp: nowMinus(const Duration(minutes: 20)),
        ),
      );
      await database.cashMovementDao.insertMovement(
        CashMovementEntity(
          id: 'cm-new',
          shiftId: 'shift-1',
          terminalId: 'terminal-1',
          type: 'CASH_OUT',
          amountNio: 50,
          reason: 'Gasto',
          timestamp: nowMinus(const Duration(minutes: 1)),
        ),
      );

      final age = await syncService.getOldestPendingItemAge();

      expect(age, isNotNull);
      expect(age!.inMinutes, greaterThanOrEqualTo(19));
      expect(age.inMinutes, lessThanOrEqualTo(21));
    });

    test(
        'getOldestPendingItemAge ignores an open session so a running shift '
        'never reads as stalled', () async {
      await database.cashierSessionDao.insertSession(
        CashierSessionEntity(
          id: 'cs-open',
          userId: 'user-1',
          openedAt: nowMinus(const Duration(hours: 2)),
          isClosed: false,
        ),
      );

      final age = await syncService.getOldestPendingItemAge();

      expect(age, isNull);
    });

    test('getOldestPendingItemAge returns null when nothing is pending',
        () async {
      final age = await syncService.getOldestPendingItemAge();

      expect(age, isNull);
    });

    test(
        'getPendingOutboxCount counts a pending customer created locally (D-1 / FU-4 blind spot)',
        () async {
      await database.customerDao.saveCustomer(
        CustomerEntity(
          id: 'cust-pending-outbox',
          name: 'Cliente Outbox',
          createdAt: nowMinus(const Duration(minutes: 10)),
          updatedAt: nowMinus(const Duration(minutes: 10)),
          syncStatus: 'pending',
        ),
      );

      final count = await syncService.getPendingOutboxCount();

      expect(count, 1);
    });

    test(
        'getOldestPendingItemAge returns the age of the oldest pending customer',
        () async {
      await database.customerDao.saveCustomer(
        CustomerEntity(
          id: 'cust-old',
          name: 'Cliente Viejo',
          createdAt: nowMinus(const Duration(minutes: 25)),
          updatedAt: nowMinus(const Duration(minutes: 25)),
          syncStatus: 'pending',
        ),
      );

      final age = await syncService.getOldestPendingItemAge();

      expect(age, isNotNull);
      expect(age!.inMinutes, greaterThanOrEqualTo(24));
      expect(age.inMinutes, lessThanOrEqualTo(26));
    });
  });
}
