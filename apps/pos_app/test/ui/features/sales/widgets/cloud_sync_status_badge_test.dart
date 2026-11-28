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
import 'package:pos_app/domain/models/sync/quarantined_sync_document.dart';
import 'package:pos_app/domain/repositories/audit_repository.dart';
import 'package:pos_app/domain/repositories/inventory/inventory_repository.dart';
import 'package:pos_app/domain/repositories/sales/sales_repository.dart';
import 'package:pos_app/ui/design_system/nhilos_tokens.dart';
import 'package:pos_app/ui/features/sales/widgets/cloud_sync_status_badge.dart';
import 'package:provider/provider.dart';

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
  DateTime? forcedLastSyncTime = DateTime(2026, 11, 26, 12, 0);
  int pendingOutbox = 0;
  List<QuarantinedSyncDocument> quarantinedDocs = const [];
  final List<String> retriedInvoiceIds = [];

  @override
  CloudSyncStatus get status => forcedStatus;

  @override
  DateTime? get lastSyncTime => forcedLastSyncTime;

  @override
  Future<int> getPendingOutboxCount() async => pendingOutbox;

  @override
  Future<int> getPendingAuditCount() async => 0;

  @override
  Future<Duration?> getOldestPendingItemAge() async => null;

  @override
  Future<int> getQuarantinedCount() async => quarantinedDocs.length;

  @override
  Future<List<QuarantinedSyncDocument>> getQuarantinedDocuments() async =>
      quarantinedDocs;

  @override
  Future<void> retryQuarantinedDocument(String invoiceId) async {
    retriedInvoiceIds.add(invoiceId);
    quarantinedDocs =
        quarantinedDocs.where((d) => d.invoiceId != invoiceId).toList();
  }
}

class _FakeConnectivityService implements NetworkConnectivityService {
  @override
  bool get isOnline => true;

  @override
  Stream<bool> get onConnectivityChanged => const Stream.empty();

  @override
  dynamic noSuchMethod(Invocation invocation) => null;
}

void main() {
  Future<void> pumpBadge(
    WidgetTester tester,
    _FakeSyncService syncService,
  ) async {
    await tester.pumpWidget(
      MultiProvider(
        providers: [
          Provider<SyncService>.value(value: syncService),
          Provider<NetworkConnectivityService>.value(
            value: _FakeConnectivityService(),
          ),
        ],
        child: const MaterialApp(
          home: Scaffold(
            body: Center(child: CloudSyncStatusBadge()),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets('clean state renders green cloud_done without quarantine alert',
      (tester) async {
    final syncService = _FakeSyncService();
    await pumpBadge(tester, syncService);

    final icon = tester.widget<Icon>(find.byIcon(Icons.cloud_done));
    expect(icon.color, NhilosColors.success);
  });

  testWidgets(
      'quarantined documents surface calm NHILOS warning badge, count, and accessible label',
      (tester) async {
    final syncService = _FakeSyncService()
      ..quarantinedDocs = [
        const QuarantinedSyncDocument(
          invoiceId: 'cn-q-1',
          invoiceNumber: 'NC-001-001-01-00000042',
          documentType: 'CREDIT_NOTE',
          total: 115.0,
          reason: 'Supervisor sin rol MANAGER/OWNER',
          code: 'FORBIDDEN',
        ),
      ];

    await pumpBadge(tester, syncService);

    final button = tester.widget<IconButton>(
      find.byKey(const Key('cloud_sync_status_badge_button')),
    );
    expect(button.tooltip, contains('cuarentena'));
    expect(find.text('1'), findsOneWidget);
    final warningIcon = tester.widget<Icon>(
      find.byIcon(Icons.warning_amber_rounded),
    );
    expect(warningIcon.color, NhilosColors.warning);
    expect(warningIcon.color, isNot(NhilosColors.danger));
  });

  testWidgets(
      'sync detail dialog lists quarantined documents with reason and Reintentar action',
      (tester) async {
    final syncService = _FakeSyncService()
      ..quarantinedDocs = [
        const QuarantinedSyncDocument(
          invoiceId: 'cn-q-1',
          invoiceNumber: 'NC-001-001-01-00000042',
          documentType: 'CREDIT_NOTE',
          total: 115.0,
          reason: 'Supervisor sin rol MANAGER/OWNER',
          code: 'FORBIDDEN',
        ),
      ];

    await pumpBadge(tester, syncService);

    await tester.tap(find.byKey(const Key('cloud_sync_status_badge_button')));
    await tester.pumpAndSettle();

    expect(find.text('NC-001-001-01-00000042'), findsOneWidget);
    expect(find.text('Supervisor sin rol MANAGER/OWNER'), findsOneWidget);

    final retryBtn = find.byKey(const Key('retry_quarantined_doc_cn-q-1'));
    expect(retryBtn, findsOneWidget);

    await tester.tap(retryBtn);
    await tester.pumpAndSettle();

    expect(syncService.retriedInvoiceIds, ['cn-q-1']);
    expect(find.text('NC-001-001-01-00000042'), findsNothing);
  });
}
