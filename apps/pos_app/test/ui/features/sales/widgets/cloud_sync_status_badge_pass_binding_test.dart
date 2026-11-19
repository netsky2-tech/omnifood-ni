import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/models/inventory/kardex_correction_entity.dart';
import 'package:pos_app/data/services/network_connectivity_service.dart';
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
import 'package:pos_app/ui/features/sales/widgets/cloud_sync_status_badge.dart';
import 'package:provider/provider.dart';

/// R3-003 — the green "Nube Sincronizada" state must be bound to the sync
/// pass, never outlive the evidence that produced it.
///
/// Finding: the badge derived `lastPassAcceptedByServer` from
/// `lastSyncTime != null` plus a denylist (`!= error && != syncing`).
/// `lastSyncTime` is a wall-clock timestamp set by an accepted pass, but it
/// survives everything that happens afterwards: a later failed pass does not
/// clear it, and any status the denylist forgot about — notably
/// `auditDegraded`, the settled state of a pass that did NOT fully confirm
/// the device — kept the green alive.
///
/// Contract pinned here:
/// 1. Pass accepted, then a failed pass, queue empty → NOT green.
/// 2. Pass accepted, then a new pass starts → NOT green.
/// 3. Pass accepted, no further events, queue empty → green.
/// 4. Queue non-empty at any point → never green.
/// 5. A degraded (audit) pass after acceptance → NOT green (the hole the
///    denylist left open; the allowlist closes it).
/// 6. A network drop AFTER acceptance (status `offline`) keeps green: the
///    evidence still stands — no new pass has run.
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

  /// Null mirrors a device that has never completed an accepted pass; the
  /// badge must treat that as "sync not acknowledged".
  DateTime? forcedLastSyncTime;
  int pendingOutbox = 0;
  int pendingAudit = 0;
  Duration? oldestPendingAge;

  @override
  CloudSyncStatus get status => forcedStatus;

  @override
  bool get isAuditStreamDegraded => auditDegraded;

  @override
  String? get lastSyncError => forcedLastError;

  @override
  DateTime? get lastSyncTime => forcedLastSyncTime;

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
  Future<SyncRunOutcome> triggerManualSync() async =>
      const SyncRunOutcome.complete();
}

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
    syncService = _FakeSyncService();
  });

  tearDown(() {
    syncService.dispose();
    connectivityService.dispose();
  });

  /// The common setup for the stale-offline window: the advisory
  /// connectivity flag is stale-offline while the service carries the truth
  /// of the last pass (issue #987 scenario, where green is governed by
  /// `lastPassAcceptedByServer`).
  void pumpStaleOfflineWindow({
    required CloudSyncStatus status,
    required DateTime? lastSyncTime,
    int pendingOutbox = 0,
    int pendingAudit = 0,
  }) {
    connectivityService.setOnlineStateForTest(false);
    syncService.pendingOutbox = pendingOutbox;
    syncService.pendingAudit = pendingAudit;
    syncService.oldestPendingAge = null;
    syncService.forcedLastSyncTime = lastSyncTime;
    syncService.forcedStatus = status;
  }

  group('CloudSyncStatusBadge — R3-003 green bound to the sync pass', () {
    testWidgets(
      '1. pass accepted, then a failed pass, queue empty → NOT green',
      (tester) async {
        pumpStaleOfflineWindow(
          status: CloudSyncStatus.error,
          lastSyncTime: DateTime.now(),
        );

        await tester.pumpWidget(
          _wrapWithProviders(syncService, connectivityService),
        );
        await tester.pump();

        expect(find.byIcon(Icons.cloud_done), findsNothing);
        expect(find.byTooltip('Nube Sincronizada'), findsNothing);
      },
    );

    testWidgets(
      '2. pass accepted, then a new pass starts → NOT green while it runs',
      (tester) async {
        pumpStaleOfflineWindow(
          status: CloudSyncStatus.syncing,
          lastSyncTime: DateTime.now(),
        );

        await tester.pumpWidget(
          _wrapWithProviders(syncService, connectivityService),
        );
        await tester.pump();

        expect(find.byIcon(Icons.cloud_done), findsNothing);
        expect(find.byTooltip('Nube Sincronizada'), findsNothing);
      },
    );

    testWidgets(
      '3. pass accepted, no further events, queue empty → green',
      (tester) async {
        pumpStaleOfflineWindow(
          status: CloudSyncStatus.idle,
          lastSyncTime: DateTime.now(),
        );

        await tester.pumpWidget(
          _wrapWithProviders(syncService, connectivityService),
        );
        await tester.pump();

        expect(find.byIcon(Icons.cloud_done), findsOneWidget);
        expect(find.byTooltip('Nube Sincronizada'), findsOneWidget);
      },
    );

    testWidgets(
      '4. queue non-empty at any point → never green',
      (tester) async {
        pumpStaleOfflineWindow(
          status: CloudSyncStatus.idle,
          lastSyncTime: DateTime.now(),
          pendingOutbox: 2,
        );

        await tester.pumpWidget(
          _wrapWithProviders(syncService, connectivityService),
        );
        await tester.pump();

        expect(find.byIcon(Icons.cloud_done), findsNothing);
        expect(find.byTooltip('Nube Sincronizada'), findsNothing);
        expect(
          find.byTooltip('Venta local protegida — 2 pendiente(s)'),
          findsOneWidget,
        );
      },
    );

    testWidgets(
      '5. pass accepted, then a degraded (audit) pass → NOT green: a '
      'degraded pass also stamps lastSyncTime but did not fully confirm '
      'the device, so it invalidates the green claim',
      (tester) async {
        pumpStaleOfflineWindow(
          status: CloudSyncStatus.auditDegraded,
          lastSyncTime: DateTime.now(),
        );

        await tester.pumpWidget(
          _wrapWithProviders(syncService, connectivityService),
        );
        await tester.pump();

        expect(find.byIcon(Icons.cloud_done), findsNothing);
        expect(find.byTooltip('Nube Sincronizada'), findsNothing);
      },
    );

    testWidgets(
      '6. network drop AFTER acceptance (status offline) keeps green: no '
      'new pass has run, the acceptance evidence still stands',
      (tester) async {
        pumpStaleOfflineWindow(
          status: CloudSyncStatus.offline,
          lastSyncTime: DateTime.now(),
        );

        await tester.pumpWidget(
          _wrapWithProviders(syncService, connectivityService),
        );
        await tester.pump();

        expect(find.byIcon(Icons.cloud_done), findsOneWidget);
        expect(find.byTooltip('Nube Sincronizada'), findsOneWidget);
      },
    );

    testWidgets(
      '7. an empty queue with no accepted pass (never synced) → never green',
      (tester) async {
        pumpStaleOfflineWindow(status: CloudSyncStatus.idle, lastSyncTime: null);

        await tester.pumpWidget(
          _wrapWithProviders(syncService, connectivityService),
        );
        await tester.pump();

        expect(find.byIcon(Icons.cloud_done), findsNothing);
        expect(find.byTooltip('Nube Sincronizada'), findsNothing);
      },
    );
  });
}
