import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:dio/dio.dart';
import 'package:pos_app/data/services/sync_service.dart';
import 'package:pos_app/domain/repositories/audit_repository.dart';
import 'package:pos_app/domain/repositories/sales/sales_repository.dart';
import 'package:pos_app/domain/repositories/inventory/inventory_repository.dart';
import 'package:pos_app/domain/models/audit_log.dart';
import 'package:pos_app/domain/models/inventory/purchase.dart';
import 'package:pos_app/domain/models/inventory/recipe_version_document.dart';
import 'package:pos_app/domain/models/inventory/production_order_document.dart';
import 'package:pos_app/domain/models/inventory/count_session_document.dart';
import 'package:pos_app/domain/models/inventory/forensic_alert.dart';
import 'package:pos_app/domain/models/inventory/inventory_movement.dart';
import 'package:pos_app/data/models/inventory/kardex_correction_entity.dart';
import 'package:pos_app/ui/features/sales/widgets/cloud_sync_status_badge.dart';

/// #613 Unit B — the inert-recipe verdict line in the sync detail dialog.
///
/// Contract under test (owner decision 5, informational never alarm):
/// - non-zero verdict count renders the informational line, tappable to list
///   the affected product names;
/// - zero verdicts render nothing;
/// - verdicts present never change the badge colour or status;
/// - a failed verdict read must leave the dialog exactly as before.
///
/// The read-model itself (DAO count, product-name join, throw-to-null
/// degradation) is pinned against a real Floor database in
/// `test/data/services/sync_service_authority_hydration_test.dart`; here the
/// fake service drives the dialog rendering paths only, so the widget tests
/// stay out of sqflite's real-async I/O inside flutter_test's fake-async zone.
void main() {
  group('CloudSyncStatusBadge inert-recipe verdict line (#613 Unit B)', () {
    late _FakeSyncService syncService;

    setUp(() {
      syncService = _FakeSyncService();
    });

    tearDown(() {
      syncService.dispose();
    });

    Widget buildTestWidget() {
      return MaterialApp(
        home: Provider<SyncService>.value(
          value: syncService,
          child: const Scaffold(
            appBar: PreferredSize(
              preferredSize: Size.fromHeight(56),
              child: CloudSyncStatusBadge(),
            ),
          ),
        ),
      );
    }

    Future<void> openDialog(WidgetTester tester) async {
      await tester.pumpWidget(buildTestWidget());
      await tester.pump();
      await tester.tap(find.byKey(const Key('cloud_sync_status_badge_button')));
      await tester.pumpAndSettle();
    }

    testWidgets(
        'non-zero verdict count renders the informational line with the count '
        'and expands to the affected product names', (tester) async {
      syncService.verdictReport = const AuthorityInertRecipeReport(
        verdictCount: 2,
        productNames: ['Jugo Natural', 'Pizza'],
      );

      await openDialog(tester);

      expect(find.text('Estado de la Nube'), findsOneWidget);
      expect(
        find.text('2 recetas inertes en este dispositivo'),
        findsOneWidget,
      );
      // Collapsed by default: the names are reachable by tapping, not noise.
      expect(find.text('Pizza'), findsNothing);
      expect(find.text('Jugo Natural'), findsNothing);

      await tester.tap(
        find.byKey(const Key('authority_inert_recipes_line')),
      );
      await tester.pumpAndSettle();

      expect(find.text('Pizza'), findsOneWidget);
      expect(find.text('Jugo Natural'), findsOneWidget);
    });

    testWidgets('a single verdict renders the singular line', (tester) async {
      syncService.verdictReport = const AuthorityInertRecipeReport(
        verdictCount: 1,
        productNames: ['Pizza'],
      );

      await openDialog(tester);

      expect(
        find.text('1 receta inerte en este dispositivo'),
        findsOneWidget,
      );
    });

    testWidgets(
        'zero verdicts render nothing (no empty "0 recetas" noise)',
        (tester) async {
      await openDialog(tester);

      expect(find.text('Estado de la Nube'), findsOneWidget);
      expect(
        find.byKey(const Key('authority_inert_recipes_line')),
        findsNothing,
      );
      expect(find.textContaining('recetas inertes'), findsNothing);
    });

    testWidgets(
        'verdicts present but status idle: badge colour and state unchanged '
        '(informational, not alarm)', (tester) async {
      syncService.verdictReport = const AuthorityInertRecipeReport(
        verdictCount: 3,
        productNames: ['Pizza'],
      );

      await tester.pumpWidget(buildTestWidget());
      await tester.pump();

      // Same green idle icon as with zero verdicts; no amber pending badge,
      // no error/problem icon.
      expect(find.byIcon(Icons.cloud_done), findsOneWidget);
      expect(find.byIcon(Icons.sync_problem), findsNothing);
      expect(find.byIcon(Icons.cloud_upload), findsNothing);
    });

    testWidgets(
        'a failed verdict count read leaves the dialog exactly as before, '
        'no crash and no error state', (tester) async {
      // Drives the same catch path as a throwing countVerdicts() (pinned
      // against the real DAO in the sync service test suite).
      syncService.verdictReportError = StateError('verdict read failed');

      await tester.pumpWidget(buildTestWidget());
      await tester.pump();

      await tester.tap(find.byKey(const Key('cloud_sync_status_badge_button')));
      await tester.pumpAndSettle();

      expect(find.text('Estado de la Nube'), findsOneWidget);
      expect(find.text('Pendientes en Outbox:'), findsOneWidget);
      expect(find.byKey(const Key('force_sync_button')), findsOneWidget);
      expect(
        find.byKey(const Key('authority_inert_recipes_line')),
        findsNothing,
      );
      expect(find.textContaining('recetas inertes'), findsNothing);
      expect(tester.takeException(), isNull);
    });
  });
}

/// Hand-written stand-in: only the members the badge touches. The verdict
/// report is configurable per test; when [verdictReportError] is set the
/// read throws exactly like a failing DAO.
class _FakeSyncService extends SyncService {
  AuthorityInertRecipeReport? verdictReport;
  Object? verdictReportError;

  _FakeSyncService()
      : super(
          _FakeAuditRepo(),
          _FakeSalesRepo(),
          _FakeInventoryRepo(),
          Dio(),
        );

  @override
  Future<int> getPendingOutboxCount() async => 0;

  @override
  Future<AuthorityInertRecipeReport?> getInertRecipeVerdictReport() async {
    final error = verdictReportError;
    if (error != null) throw error;
    return verdictReport;
  }

  @override
  Future<SyncRunOutcome> triggerManualSync() async =>
      const SyncRunOutcome.complete();
}

class _FakeAuditRepo implements AuditRepository {
  @override
  String get deviceId => 'test-terminal';
  @override
  Future<void> recordLog(AuditLog log) async {}
  @override
  Future<List<AuditLog>> getUnsyncedLogs() async => [];
  @override
  Future<AuditSyncOutcome> syncLogs() async =>
      const AuditSyncOutcome.complete();
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeSalesRepo implements SalesRepository {
  @override
  Future<List<Map<String, Object?>>> getUnsyncedAggregates() async => [];
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeInventoryRepo implements InventoryRepository {
  @override
  Future<List<InventoryMovement>> getUnsyncedMovements() async => [];
  @override
  Future<List<Purchase>> getUnsyncedPurchases() async => [];
  @override
  Future<List<RecipeVersionDocument>> getUnsyncedRecipeVersionDocuments() async =>
      [];
  @override
  Future<List<ProductionOrderDocument>> getUnsyncedProductionOrders() async =>
      [];
  @override
  Future<List<CountSessionDocument>> getUnsyncedCountSessionDocuments() async =>
      [];
  @override
  Future<List<ForensicAlert>> getUnsyncedForensicAlerts() async => [];
  @override
  Future<List<KardexCorrectionEntity>> getKardexCorrections() async => [];
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}
