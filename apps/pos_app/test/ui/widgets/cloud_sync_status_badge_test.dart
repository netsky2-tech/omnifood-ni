import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:dio/dio.dart';
import 'package:pos_app/data/services/sync_service.dart';
import 'package:pos_app/data/services/network_connectivity_service.dart';
import 'package:pos_app/ui/features/sales/widgets/cloud_sync_status_badge.dart';
import 'package:pos_app/domain/repositories/audit_repository.dart';
import 'package:pos_app/domain/repositories/sales/sales_repository.dart';
import 'package:pos_app/domain/repositories/inventory/inventory_repository.dart';
import 'package:pos_app/domain/models/audit_log.dart';
import 'package:pos_app/domain/models/inventory/inventory_movement.dart';
import 'package:pos_app/domain/models/inventory/purchase.dart';
import 'package:pos_app/domain/models/inventory/recipe_version_document.dart';
import 'package:pos_app/domain/models/inventory/production_order_document.dart';
import 'package:pos_app/domain/models/inventory/count_session_document.dart';
import 'package:pos_app/domain/models/inventory/forensic_alert.dart';

class MockAuditRepo implements AuditRepository {
  int syncCalls = 0;
  @override
  String get deviceId => 'test-terminal';
  @override
  Future<void> recordLog(AuditLog log) async {}
  @override
  Future<List<AuditLog>> getUnsyncedLogs() async => [];
  @override
  Future<AuditSyncOutcome> syncLogs() async {
    syncCalls++;
    return const AuditSyncOutcome.complete();
  }
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class MockSalesRepo implements SalesRepository {
  List<Map<String, Object?>> unsynced = [];
  @override
  Future<List<Map<String, Object?>>> getUnsyncedAggregates() async => unsynced;
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class MockInventoryRepo implements InventoryRepository {
  List<InventoryMovement> unsynced = [];
  @override
  Future<List<InventoryMovement>> getUnsyncedMovements() async => unsynced;
  @override
  Future<List<Purchase>> getUnsyncedPurchases() async => [];
  @override
  Future<List<RecipeVersionDocument>> getUnsyncedRecipeVersionDocuments() async => [];
  @override
  Future<List<ProductionOrderDocument>> getUnsyncedProductionOrders() async => [];
  @override
  Future<List<CountSessionDocument>> getUnsyncedCountSessionDocuments() async => [];
  @override
  Future<List<ForensicAlert>> getUnsyncedForensicAlerts() async => [];
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  group('CloudSyncStatusBadge Widget Tests', () {
    late Dio dio;
    late MockAuditRepo auditRepo;
    late MockSalesRepo salesRepo;
    late MockInventoryRepo inventoryRepo;
    late NetworkConnectivityService connectivityService;
    late SyncService syncService;

    setUp(() {
      dio = Dio();
      dio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (options, handler) {
            handler.resolve(
              Response<dynamic>(
                statusCode: 200,
                requestOptions: options,
                data: {'ok': true, 'data': []},
              ),
            );
          },
        ),
      );
      auditRepo = MockAuditRepo();
      salesRepo = MockSalesRepo();
      inventoryRepo = MockInventoryRepo();
      connectivityService = NetworkConnectivityService(dio);
      syncService = SyncService(
        auditRepo,
        salesRepo,
        inventoryRepo,
        dio,
        connectivityService: connectivityService,
      );
    });

    tearDown(() {
      syncService.dispose();
      connectivityService.dispose();
    });

    Widget buildTestWidget() {
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

    testWidgets('displays green cloud_done icon when online and 0 pending items', (tester) async {
      connectivityService.setOnlineStateForTest(true);

      await tester.pumpWidget(buildTestWidget());
      await tester.pump();

      expect(find.byIcon(Icons.cloud_done), findsOneWidget);
    });

    testWidgets('displays amber cloud_upload icon with badge when outbox has pending items', (tester) async {
      connectivityService.setOnlineStateForTest(true);
      salesRepo.unsynced = [
        {'id': 'sale-1', 'documentType': 'INVOICE'},
        {'id': 'sale-2', 'documentType': 'INVOICE'},
      ];

      await tester.pumpWidget(buildTestWidget());
      await tester.pump();

      expect(find.byIcon(Icons.cloud_upload), findsOneWidget);
      expect(find.text('2'), findsOneWidget);
    });

    testWidgets('displays grey cloud_off icon when offline', (tester) async {
      connectivityService.setOnlineStateForTest(false);

      await tester.pumpWidget(buildTestWidget());
      await tester.pump();

      expect(find.byIcon(Icons.cloud_off), findsOneWidget);
    });

    testWidgets('tapping badge opens dialog and allows forcing manual sync', (tester) async {
      connectivityService.setOnlineStateForTest(true);
      salesRepo.unsynced = [
        {'id': 'sale-1', 'documentType': 'INVOICE'},
      ];

      await tester.pumpWidget(buildTestWidget());
      await tester.pump();

      // Tap badge button
      await tester.tap(find.byKey(const Key('cloud_sync_status_badge_button')));
      await tester.pumpAndSettle();

      expect(find.text('Estado de la Nube'), findsOneWidget);
      expect(find.text('Pendientes en Outbox:'), findsOneWidget);
      expect(find.text('1 documento(s)'), findsOneWidget);
      expect(find.byKey(const Key('force_sync_button')), findsOneWidget);

      // Tap force sync button
      await tester.tap(find.byKey(const Key('force_sync_button')));
      await tester.pump();

      expect(find.text('Sincronización forzada iniciada...'), findsOneWidget);
      expect(auditRepo.syncCalls, 1);
      await tester.pumpAndSettle();
    });
  });
}
