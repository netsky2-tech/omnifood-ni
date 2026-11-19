import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/services/sync_service.dart';
import 'package:pos_app/domain/models/audit_log.dart';
import 'package:pos_app/domain/models/inventory/inventory_movement.dart';
import 'package:pos_app/domain/models/inventory/purchase.dart';
import 'package:pos_app/domain/models/inventory/recipe_version_document.dart';
import 'package:pos_app/domain/models/inventory/production_order_document.dart';
import 'package:pos_app/domain/models/inventory/count_session_document.dart';
import 'package:pos_app/domain/models/inventory/forensic_alert.dart';
import 'package:pos_app/domain/repositories/audit_repository.dart';
import 'package:pos_app/domain/repositories/inventory/inventory_repository.dart';
import 'package:pos_app/domain/repositories/sales/sales_repository.dart';
import 'package:provider/provider.dart';
import 'package:pos_app/ui/widgets/premium_locked_view.dart';

/// ENT-05 — the premium-locked state shown instead of a premium screen when
/// the entitlement snapshot does not include the capability (catalog §6.3).
///
/// Contract under test:
/// - lock icon, feature title, human unlock explanation (never a raw key
///   alone) and the exact upgrade copy required by the plan document;
/// - when `SyncService.planBlockedCapabilities` contains the key, the note
///   that pending operations are kept and will sync after the upgrade;
/// - the note is absent when the plan has not refused anything;
/// - rendering without a SyncService in scope never throws.
void main() {
  const upgradeCopy = 'La función requiere el plan o el complemento que '
      'incluye "inventory.retail". Actualice su plan para usarla.';

  Widget buildHost({SyncService? syncService, Widget? child}) {
    return MaterialApp(
      home: syncService == null
          ? (child ?? const PremiumLockedView(capability: 'inventory.retail'))
          : Provider<SyncService>.value(
              value: syncService,
              child: child ?? const PremiumLockedView(capability: 'inventory.retail'),
            ),
    );
  }

  group('PremiumLockedView rendering', () {
    testWidgets('shows lock icon, feature title, human unlock explanation and '
        'the exact upgrade copy', (tester) async {
      await tester.pumpWidget(buildHost(
        child: const PremiumLockedView(
          capability: 'inventory.retail',
          featureLabel: 'Compras',
        ),
      ));
      await tester.pump();

      expect(find.byIcon(Icons.lock_outline), findsOneWidget);
      expect(find.text('Función no incluida en su plan'), findsOneWidget);
      expect(
        find.text('Compras no está incluida en su plan actual.'),
        findsOneWidget,
      );
      // Human wording of what unlocks the feature — present alongside the
      // raw key, never the key alone.
      expect(
        find.textContaining('plan Operación o Pro'),
        findsOneWidget,
      );
      expect(find.textContaining('Pack Retail'), findsOneWidget);
      // Exact upgrade copy from the plan document (catalog §6.3).
      expect(find.text(upgradeCopy), findsOneWidget);
      // No plan refusal recorded: no pending-operations note.
      expect(
        find.textContaining('operaciones pendientes'),
        findsNothing,
      );
      expect(tester.takeException(), isNull);
    });

    testWidgets('unknown capability key degrades to a generic human hint '
        'instead of showing the bare key', (tester) async {
      await tester.pumpWidget(buildHost(
        child: const PremiumLockedView(capability: 'future.capability'),
      ));
      await tester.pump();

      expect(
        find.textContaining('actualizando su plan o activando el complemento'),
        findsOneWidget,
      );
      expect(tester.takeException(), isNull);
    });
  });

  group('PremiumLockedView pending-operations note (§6.3 points 1-3)', () {
    late _FakeSyncService syncService;

    setUp(() {
      syncService = _FakeSyncService();
    });

    tearDown(() {
      syncService.dispose();
    });

    testWidgets('shows the kept-and-will-sync note when the plan already '
        'refused this capability', (tester) async {
      syncService.planBlocked = {'inventory.retail'};

      await tester.pumpWidget(buildHost(
        syncService: syncService,
        child: const PremiumLockedView(
          capability: 'inventory.retail',
          featureLabel: 'Compras',
        ),
      ));
      await tester.pump();

      expect(
        find.text(PremiumLockedView.pendingNote),
        findsOneWidget,
      );
      expect(tester.takeException(), isNull);
    });

    testWidgets('hides the note when the plan refused a DIFFERENT capability',
        (tester) async {
      syncService.planBlocked = {'inventory.cooking'};

      await tester.pumpWidget(buildHost(
        syncService: syncService,
        child: const PremiumLockedView(
          capability: 'inventory.retail',
          featureLabel: 'Compras',
        ),
      ));
      await tester.pump();

      expect(
        find.text(PremiumLockedView.pendingNote),
        findsNothing,
      );
      expect(tester.takeException(), isNull);
    });
  });

  testWidgets('renders without a SyncService in scope without throwing',
      (tester) async {
    // buildHost registers no provider at all here.
    await tester.pumpWidget(buildHost(
      child: const PremiumLockedView(
        capability: 'inventory.retail',
        featureLabel: 'Compras',
      ),
    ));
    await tester.pump();

    expect(find.byIcon(Icons.lock_outline), findsOneWidget);
    expect(find.text(upgradeCopy), findsOneWidget);
    expect(
      find.textContaining('operaciones pendientes'),
      findsNothing,
    );
    expect(tester.takeException(), isNull);
  });
}

class _FakeSyncService extends SyncService {
  _FakeSyncService()
      : super(
          _FakeAuditRepo(),
          _FakeSalesRepo(),
          _FakeInventoryRepo(),
          Dio(),
        );

  Set<String> planBlocked = {};

  @override
  Set<String> get planBlockedCapabilities => Set.unmodifiable(planBlocked);
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
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}
