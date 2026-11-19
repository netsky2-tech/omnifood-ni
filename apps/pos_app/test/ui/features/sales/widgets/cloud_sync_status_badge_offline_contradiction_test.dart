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

/// Issue #987 — the badge must never claim "Venta local protegida" while the
/// cloud has already confirmed every record.
///
/// Production defect: the advisory connectivity flag
/// ([NetworkConnectivityService.isOnline]) can stay `false` for up to a full
/// 30 s health-poll cycle after the backend is actually reachable (the native
/// signal only flips the state UP after an HTTP verification, and never fires
/// when the WiFi link itself never dropped). Because
/// `SyncService.triggerManualSync()` has no connectivity gate, a sync pass can
/// fully drain the outbox inside that window; the badge's amber branch keyed
/// only on `!isOnline || status == offline` and kept rendering
/// "Venta local protegida — 0 pendiente(s)" — a self-contradiction — until the
/// next poll flipped the flag.
///
/// Contract pinned here:
/// 1. Queue empty + last pass accepted → green immediately (no poll/timer).
/// 2. Queue non-empty → the local-protection amber stays, regardless of the
///    (stale) connectivity flag and the connectivity service's opinion.
/// 3. The contradictory combination (amber offline colour with a zero pending
///    count) is not renderable in any state.
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

/// The contradictory tooltip: "locally protected" with zero pending work.
final Finder _contradictoryTooltip =
    find.byTooltip('Venta local protegida — 0 pendiente(s)');

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

  group('CloudSyncStatusBadge — issue #987 stale-offline contradiction', () {
    testWidgets(
      'queue empty + sync acknowledged while the connectivity flag is still '
      'stale-offline → green immediately, without waiting for a poll or timer',
      (tester) async {
        // The reported defect state: the server just accepted the pass that
        // drained the outbox, but the advisory flag has not caught up.
        connectivityService.setOnlineStateForTest(false);
        syncService.pendingOutbox = 0;
        syncService.pendingAudit = 0;
        syncService.oldestPendingAge = null;
        syncService.forcedLastSyncTime = DateTime.now();
        syncService.forcedStatus = CloudSyncStatus.idle;

        await tester.pumpWidget(
          _wrapWithProviders(syncService, connectivityService),
        );
        // One pump = the first build after the state exists. No simulated
        // poll tick, no timer advance: the badge must be green NOW.
        await tester.pump();

        expect(find.byIcon(Icons.cloud_done), findsOneWidget);
        expect(find.byTooltip('Nube Sincronizada'), findsOneWidget);
        expect(find.byIcon(Icons.cloud_off), findsNothing);
        expect(_contradictoryTooltip, findsNothing);

        // It stays green across a full poll cycle: the truth does not depend
        // on the next health probe.
        await tester.pump(const Duration(seconds: 30));
        await tester.pump();

        expect(find.byIcon(Icons.cloud_done), findsOneWidget);
        expect(_contradictoryTooltip, findsNothing);
      },
    );

    testWidgets(
      'reverse honesty: queue empty but the sync was never acknowledged '
      '(no accepted pass yet) → NOT green; an unacknowledged device never '
      'claims the cloud confirmed it',
      (tester) async {
        connectivityService.setOnlineStateForTest(false);
        syncService.pendingOutbox = 0;
        syncService.pendingAudit = 0;
        syncService.oldestPendingAge = null;
        syncService.forcedLastSyncTime = null;
        syncService.forcedStatus = CloudSyncStatus.idle;

        await tester.pumpWidget(
          _wrapWithProviders(syncService, connectivityService),
        );
        await tester.pump();

        expect(find.byIcon(Icons.cloud_done), findsNothing);
        expect(find.byTooltip('Nube Sincronizada'), findsNothing);
      },
    );

    testWidgets(
      'queue non-empty with a stale-offline connectivity flag → stays in the '
      'local-protection amber state',
      (tester) async {
        connectivityService.setOnlineStateForTest(false);
        syncService.pendingOutbox = 2;
        syncService.oldestPendingAge = null;
        syncService.forcedLastSyncTime = DateTime.now();

        await tester.pumpWidget(
          _wrapWithProviders(syncService, connectivityService),
        );
        await tester.pump();

        expect(find.byIcon(Icons.cloud_off), findsOneWidget);
        expect(find.byIcon(Icons.cloud_done), findsNothing);
        expect(
          find.byTooltip('Venta local protegida — 2 pendiente(s)'),
          findsOneWidget,
        );
      },
    );

    testWidgets(
      'queue non-empty while the SyncService flag itself says offline → '
      'local-protection amber, regardless of the connectivity flag',
      (tester) async {
        connectivityService.setOnlineStateForTest(true);
        syncService.forcedStatus = CloudSyncStatus.offline;
        syncService.pendingOutbox = 1;
        syncService.oldestPendingAge = null;
        syncService.forcedLastSyncTime = DateTime.now();

        await tester.pumpWidget(
          _wrapWithProviders(syncService, connectivityService),
        );
        await tester.pump();

        expect(find.byIcon(Icons.cloud_off), findsOneWidget);
        expect(find.byIcon(Icons.cloud_done), findsNothing);
        expect(
          find.byTooltip('Venta local protegida — 1 pendiente(s)'),
          findsOneWidget,
        );
      },
    );

    testWidgets(
      'queue non-empty online → never green, work is still unconfirmed',
      (tester) async {
        connectivityService.setOnlineStateForTest(true);
        syncService.pendingOutbox = 3;
        syncService.oldestPendingAge = null;
        syncService.forcedLastSyncTime = DateTime.now();

        await tester.pumpWidget(
          _wrapWithProviders(syncService, connectivityService),
        );
        await tester.pump();

        expect(find.byIcon(Icons.cloud_done), findsNothing);
        expect(find.byIcon(Icons.cloud_upload), findsOneWidget);
      },
    );

    testWidgets(
      'the contradictory combination (amber offline colour with a zero '
      'pending count) is not renderable: never-synced device shows plain '
      'offline, without the false protection claim or the false count',
      (tester) async {
        connectivityService.setOnlineStateForTest(false);
        syncService.pendingOutbox = 0;
        syncService.pendingAudit = 0;
        syncService.forcedLastSyncTime = null;

        await tester.pumpWidget(
          _wrapWithProviders(syncService, connectivityService),
        );
        await tester.pump();

        expect(find.byIcon(Icons.cloud_off), findsOneWidget);
        expect(_contradictoryTooltip, findsNothing);
        expect(find.byTooltip('Sin Conexión (Offline)'), findsOneWidget);
      },
    );

    testWidgets(
      'the contradictory combination is not renderable after a failed pass '
      'either: an errored last pass blocks the green escape',
      (tester) async {
        connectivityService.setOnlineStateForTest(false);
        syncService.pendingOutbox = 0;
        syncService.pendingAudit = 0;
        syncService.forcedLastSyncTime = DateTime.now();
        syncService.forcedStatus = CloudSyncStatus.error;

        await tester.pumpWidget(
          _wrapWithProviders(syncService, connectivityService),
        );
        await tester.pump();

        expect(find.byIcon(Icons.cloud_done), findsNothing);
        expect(find.byTooltip('Nube Sincronizada'), findsNothing);
        expect(_contradictoryTooltip, findsNothing);
      },
    );

    testWidgets(
      'audit rows still pending → no green escape while offline: the '
      'audit-degraded truth must not be painted over',
      (tester) async {
        connectivityService.setOnlineStateForTest(false);
        syncService.pendingOutbox = 0;
        syncService.pendingAudit = 4;
        syncService.forcedLastSyncTime = DateTime.now();

        await tester.pumpWidget(
          _wrapWithProviders(syncService, connectivityService),
        );
        await tester.pump();

        expect(find.byIcon(Icons.cloud_done), findsNothing);
        expect(_contradictoryTooltip, findsNothing);
      },
    );
  });
}
