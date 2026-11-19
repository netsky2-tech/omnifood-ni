import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/daos/local_config_dao.dart';
import 'package:pos_app/data/models/local_config_entity.dart';
import 'package:pos_app/domain/models/user.dart';
import 'package:pos_app/domain/repositories/auth_repository.dart';
import 'package:pos_app/domain/services/entitlements/entitlement_snapshot_service.dart';
import 'package:pos_app/ui/features/inventory/boh/boh_navigation_shell_view.dart';
import 'package:pos_app/ui/features/inventory/boh/boh_permissions.dart';
import 'package:pos_app/ui/widgets/premium_locked_view.dart';
import 'package:provider/provider.dart';

/// ENT-05 — `BohRouteGuard` plan behaviour on top of the existing
/// role/permission guard (catalog §6.3, §6.6):
/// - the existing permission denial still WINS first (unchanged behaviour);
/// - a premium capability the snapshot does not include renders
///   [PremiumLockedView] instead of the child;
/// - a granted capability renders the child unchanged;
/// - no snapshot service in scope fails CLOSED for premium capabilities
///   (never throws, never unlocks).
void main() {
  const capability = 'inventory.retail';

  Widget buildHost({
    required AuthRepository authRepository,
    EntitlementSnapshotService? entitlements,
    String? capabilityArg,
  }) {
    Widget guard = BohRouteGuard(
      permission: BohPermission.purchasesView,
      featureLabel: 'Compras',
      capability: capabilityArg,
      child: const SizedBox(key: Key('premium-child')),
    );
    if (entitlements != null) {
      guard = Provider<EntitlementSnapshotService>.value(
        value: entitlements,
        child: guard,
      );
    }
    return MaterialApp(
      home: Provider<AuthRepository>.value(value: authRepository, child: guard),
    );
  }

  /// A grant service whose persisted snapshot includes [capability]. The
  /// guard reads `has()` off the in-memory snapshot, so the stored payload
  /// is loaded once before pumping.
  Future<EntitlementSnapshotService> grantedService() async {
    final dao = _FakeLocalConfigDao();
    dao.store['entitlements:tenant-1'] = jsonEncode({
      'version': 1,
      'planCode': 'PRO',
      'status': 'active',
      'capabilities': [capability, 'core.sales'],
      'expiresAt': DateTime.now()
          .toUtc()
          .add(const Duration(hours: 24))
          .toIso8601String(),
    });
    final service = EntitlementSnapshotService(
      configDao: dao,
      dio: _NoDio(),
      resolveTenantId: () async => 'tenant-1',
    );
    await service.load();
    return service;
  }

  /// A service whose snapshot is empty (no premium capabilities).
  Future<EntitlementSnapshotService> emptyService() async {
    final service = EntitlementSnapshotService(
      configDao: _FakeLocalConfigDao(),
      dio: _NoDio(),
      resolveTenantId: () async => 'tenant-1',
    );
    await service.load();
    return service;
  }

  testWidgets('granted capability renders the child unchanged',
      (tester) async {
    await tester.pumpWidget(buildHost(
      authRepository: _FakeAuthRepository(const User(
        id: 'u1',
        name: 'Owner',
        role: UserRole.owner,
        isActive: true,
      )),
      entitlements: await grantedService(),
      capabilityArg: capability,
    ));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('premium-child')), findsOneWidget);
    expect(find.byType(PremiumLockedView), findsNothing);
    expect(find.byType(BohAccessDeniedView), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('capability NOT in the snapshot renders the locked screen '
      'instead of the child, with the upgrade copy', (tester) async {
    await tester.pumpWidget(buildHost(
      authRepository: _FakeAuthRepository(const User(
        id: 'u1',
        name: 'Owner',
        role: UserRole.owner,
        isActive: true,
      )),
      entitlements: await emptyService(),
      capabilityArg: capability,
    ));
    await tester.pumpAndSettle();

    expect(find.byType(PremiumLockedView), findsOneWidget);
    expect(find.byKey(const Key('premium-child')), findsNothing);
    expect(
      find.textContaining('"$capability". Actualice su plan para usarla.'),
      findsOneWidget,
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets('no snapshot service in scope fails CLOSED for a premium '
      'capability without throwing', (tester) async {
    await tester.pumpWidget(buildHost(
      authRepository: _FakeAuthRepository(const User(
        id: 'u1',
        name: 'Owner',
        role: UserRole.owner,
        isActive: true,
      )),
      // No EntitlementSnapshotService provider at all.
      capabilityArg: capability,
    ));
    await tester.pumpAndSettle();

    expect(find.byType(PremiumLockedView), findsOneWidget);
    expect(find.byKey(const Key('premium-child')), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('null capability renders the child without any plan check',
      (tester) async {
    await tester.pumpWidget(buildHost(
      authRepository: _FakeAuthRepository(const User(
        id: 'u1',
        name: 'Owner',
        role: UserRole.owner,
        isActive: true,
      )),
      // No entitlement service in scope: irrelevant when no capability.
      capabilityArg: null,
    ));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('premium-child')), findsOneWidget);
    expect(find.byType(PremiumLockedView), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('existing permission denial still WINS over a granted '
      'capability', (tester) async {
    await tester.pumpWidget(buildHost(
      // Cashier: no BohPermission.purchasesView.
      authRepository: _FakeAuthRepository(const User(
        id: 'u2',
        name: 'Cajero',
        role: UserRole.cashier,
        isActive: true,
      )),
      entitlements: await grantedService(),
      capabilityArg: capability,
    ));
    await tester.pumpAndSettle();

    expect(find.byType(BohAccessDeniedView), findsOneWidget);
    expect(find.byType(PremiumLockedView), findsNothing);
    expect(find.byKey(const Key('premium-child')), findsNothing);
    expect(tester.takeException(), isNull);
  });
}

/// In-memory stand-in for the Floor [LocalConfigDao] (same three-method
/// surface the service touches).
class _FakeLocalConfigDao implements LocalConfigDao {
  final Map<String, String> store = {};

  @override
  Future<LocalConfigEntity?> getConfigByKey(String key) async {
    final value = store[key];
    return value == null ? null : LocalConfigEntity(key: key, value: value);
  }

  @override
  Future<void> saveConfig(LocalConfigEntity config) async {
    store[config.key] = config.value;
  }

  @override
  Future<void> deleteConfig(String key) async {
    store.remove(key);
  }
}

/// The guard's read path never touches the network; the Dio handle is only
/// needed to construct the service.
class _NoDio implements Dio {
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeAuthRepository implements AuthRepository {
  _FakeAuthRepository(this.user);

  final User? user;

  @override
  Future<User?> getCurrentUser() async => user;

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}
