import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/models/inventory/kardex_correction_entity.dart';
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

/// D-18 widget contract: the audit-degraded state renders AMBER (never the
/// error red), keeps the outbox row company with a dedicated
/// "Registros de auditoría pendientes" row plus an explanatory note, while
/// business-domain errors keep rendering red exactly as before. The fake
/// service drives only the badge rendering paths, so no sqflite runs inside
/// the fake-async widget zone.
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
  Future<AuthorityInertRecipeReport?> getInertRecipeVerdictReport() async =>
      null;

  @override
  Future<SyncRunOutcome> triggerManualSync() async {
    manualSyncCalls++;
    return const SyncRunOutcome.complete();
  }
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
  group('CloudSyncStatusBadge — audit degraded (D-18)', () {
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
      'renders the degraded amber state (never red, never green) when the '
      'audit stream is degraded with pending audit rows',
      (tester) async {
        syncService.forcedStatus = CloudSyncStatus.auditDegraded;
        syncService.auditDegraded = true;
        syncService.pendingAudit = 3;

        await tester.pumpWidget(
          _wrapWithProviders(syncService, connectivityService),
        );
        await tester.pump();

        // Not the error red...
        expect(find.byIcon(Icons.sync_problem), findsNothing);
        // ...and not the fully-synced green while audit rows are pending.
        expect(find.byIcon(Icons.cloud_done), findsNothing);
        expect(find.byIcon(Icons.cloud_upload), findsOneWidget);
        expect(find.byTooltip('Auditoría pendiente de sincronizar — 3 registro(s)'), findsOneWidget);
      },
    );

    testWidgets(
      'dialog shows the degraded status label, the pending-audit row, and '
      'the explanatory note — without the error headline',
      (tester) async {
        syncService.forcedStatus = CloudSyncStatus.auditDegraded;
        syncService.auditDegraded = true;
        syncService.pendingAudit = 3;

        await tester.pumpWidget(
          _wrapWithProviders(syncService, connectivityService),
        );
        await tester.pump();

        await tester.tap(find.byKey(const Key('cloud_sync_status_badge_button')));
        await tester.pumpAndSettle();

        expect(
          find.text('Auditoría local pendiente de envío'),
          findsOneWidget,
        );
        expect(find.text('Registros de auditoría pendientes:'), findsOneWidget);
        expect(find.text('3 registro(s)'), findsOneWidget);
        expect(
          find.textContaining('se enviaron a la nube más tarde'),
          findsOneWidget,
        );
        expect(find.text('Error en última sincronización'), findsNothing);
      },
    );

    testWidgets(
      'a business-domain error still renders red even while the audit '
      'stream is degraded',
      (tester) async {
        syncService.forcedStatus = CloudSyncStatus.error;
        syncService.auditDegraded = true;
        syncService.forcedLastError = 'Sales';
        syncService.pendingAudit = 2;

        await tester.pumpWidget(
          _wrapWithProviders(syncService, connectivityService),
        );
        await tester.pump();

        expect(find.byIcon(Icons.sync_problem), findsOneWidget);
        expect(find.byIcon(Icons.cloud_upload), findsNothing);
      },
    );
  });
}
