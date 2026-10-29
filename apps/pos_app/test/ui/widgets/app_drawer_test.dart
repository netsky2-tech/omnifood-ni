import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:pos_app/data/models/sales/cashier_session_entity.dart';
import 'package:pos_app/domain/models/sales/cashier_session.dart';
import 'package:pos_app/domain/models/user.dart';
import 'package:pos_app/domain/repositories/audit_repository.dart';
import 'package:pos_app/domain/repositories/auth_repository.dart';
import 'package:pos_app/presentation/features/sales/view_models/sale_view_model.dart';
import 'package:pos_app/ui/features/cash/cash_shift_view_model.dart';
import 'package:pos_app/ui/widgets/app_drawer.dart';
import 'package:provider/provider.dart';

class _MockAuthRepository extends Mock implements AuthRepository {}

class _MockSaleViewModel extends Mock implements SaleViewModel {}

class _MockCashShiftViewModel extends Mock implements CashShiftViewModel {}

class _MockAuditRepository extends Mock implements AuditRepository {}

class _TrackingNavigatorObserver extends NavigatorObserver {
  final List<String?> pushedRouteNames = [];

  @override
  void didPush(Route<dynamic> route, Route<dynamic>? previousRoute) {
    pushedRouteNames.add(route.settings.name);
  }
}

const String _lockScreenMarker = 'Lock Screen';
const String _cashScreenMarker = 'Cash Screen';
const String _expectedBlockedMessage =
    'Hay una caja abierta. Cierra la caja antes de cambiar de operador.';

void main() {
  late _MockAuthRepository authRepository;
  late _MockAuditRepository auditRepository;

  SaleViewModel stubSaleViewModel({CashierSession? activeSession}) {
    final saleViewModel = _MockSaleViewModel();
    when(() => saleViewModel.activeSession).thenReturn(activeSession);
    return saleViewModel;
  }

  CashShiftViewModel stubCashShiftViewModel({
    CashierSessionEntity? activeShift,
    bool openAccountsVerified = true,
    bool hasOpenAccounts = false,
    bool hasPendingVouchers = false,
  }) {
    final cashShiftViewModel = _MockCashShiftViewModel();
    when(() => cashShiftViewModel.init()).thenAnswer((_) async {});
    when(() => cashShiftViewModel.activeShift).thenReturn(activeShift);
    when(
      () => cashShiftViewModel.hasActiveShift,
    ).thenReturn(activeShift != null && !activeShift.isClosed);
    when(
      () => cashShiftViewModel.openAccountsVerified,
    ).thenReturn(openAccountsVerified);
    when(() => cashShiftViewModel.hasOpenAccounts).thenReturn(hasOpenAccounts);
    when(
      () => cashShiftViewModel.hasPendingVouchers,
    ).thenReturn(hasPendingVouchers);
    when(() => cashShiftViewModel.pendingVouchersCount).thenReturn(0);
    when(() => cashShiftViewModel.openAccounts).thenReturn(const []);
    return cashShiftViewModel;
  }

  void stubAuth(User user) {
    when(() => authRepository.getCurrentUser()).thenAnswer((_) async => user);
    when(() => authRepository.getAllUsers()).thenAnswer((_) async => const []);
  }

  Widget buildApp({
    SaleViewModel? saleViewModel,
    CashShiftViewModel? cashShiftViewModel,
    List<NavigatorObserver>? navigatorObservers,
  }) {
    return MultiProvider(
      providers: [
        Provider<AuthRepository>.value(value: authRepository),
        Provider<AuditRepository>.value(value: auditRepository),
        ChangeNotifierProvider<CashShiftViewModel>.value(
          value: cashShiftViewModel ?? stubCashShiftViewModel(),
        ),
        if (saleViewModel != null)
          ChangeNotifierProvider<SaleViewModel>.value(value: saleViewModel),
      ],
      child: MaterialApp(
        routes: {
          '/inventory/boh': (_) =>
              const Scaffold(body: Text('BOH Shell Screen')),
          '/inventory/kardex': (_) =>
              const Scaffold(body: Text('Kardex Screen')),
          '/inventory/production': (_) =>
              const Scaffold(body: Text('Production Screen')),
          '/inventory/alerts': (_) =>
              const Scaffold(body: Text('Alerts Screen')),
          '/inventory/counts': (_) =>
              const Scaffold(body: Text('Physical Count Screen')),
          '/lock': (_) => const Scaffold(body: Text(_lockScreenMarker)),
          '/sales/cash': (_) => const Scaffold(body: Text(_cashScreenMarker)),
        },
        navigatorObservers: navigatorObservers ?? const [],
        home: const Scaffold(body: AppDrawer()),
      ),
    );
  }

  setUp(() {
    authRepository = _MockAuthRepository();
    auditRepository = _MockAuditRepository();
    when(() => authRepository.logout()).thenAnswer((_) async {});
  });

  testWidgets('hides DGI reports item for waiter role', (tester) async {
    tester.view.physicalSize = const Size(1200, 2000);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    when(() => authRepository.getCurrentUser()).thenAnswer(
      (_) async => const User(
        id: 'u-1',
        name: 'Waiter',
        role: UserRole.waiter,
        isActive: true,
      ),
    );
    when(() => authRepository.getAllUsers()).thenAnswer((_) async => const []);

    await tester.pumpWidget(buildApp());
    await tester.pumpAndSettle();

    expect(find.text('Reportes DGI'), findsNothing);
    expect(find.text('Inventario'), findsOneWidget);
    expect(find.text('Producción'), findsNothing);
    expect(
      tester
          .widget<ListTile>(find.widgetWithText(ListTile, 'Inventario'))
          .enabled,
      isFalse,
    );
  });

  testWidgets(
    'hides DGI reports item for cashier role (S-RBAC-05 runtime proof)',
    (tester) async {
      tester.view.physicalSize = const Size(1200, 2000);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      when(() => authRepository.getCurrentUser()).thenAnswer(
        (_) async => const User(
          id: 'u-3',
          name: 'Cashier',
          role: UserRole.cashier,
          isActive: true,
        ),
      );
      when(
        () => authRepository.getAllUsers(),
      ).thenAnswer((_) async => const []);

      await tester.pumpWidget(buildApp());
      await tester.pumpAndSettle();

      expect(find.text('Reportes DGI'), findsNothing);
      expect(find.byIcon(Icons.analytics), findsNothing);
      expect(
        tester
            .widget<ListTile>(find.widgetWithText(ListTile, 'Inventario'))
            .enabled,
        isFalse,
      );
      expect(find.text('Identidad de la Terminal'), findsNothing);
      expect(find.text('Activar Terminal'), findsNothing);
    },
  );

  testWidgets('shows DGI reports item for manager role', (tester) async {
    tester.view.physicalSize = const Size(1200, 2000);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    when(() => authRepository.getCurrentUser()).thenAnswer(
      (_) async => const User(
        id: 'u-2',
        name: 'Manager',
        role: UserRole.manager,
        isActive: true,
      ),
    );
    when(() => authRepository.getAllUsers()).thenAnswer((_) async => const []);

    await tester.pumpWidget(buildApp());
    await tester.pumpAndSettle();

    expect(find.text('Reportes DGI'), findsOneWidget);
    expect(find.text('Inventario'), findsOneWidget);
    expect(find.text('Identidad de la Terminal'), findsOneWidget);
    expect(find.text('Activar Terminal'), findsOneWidget);
  });

  testWidgets('shows identity management and safe area for active users', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1200, 2000);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    when(() => authRepository.getCurrentUser()).thenAnswer(
      (_) async => const User(
        id: 'u-4',
        name: 'Owner',
        role: UserRole.owner,
        isActive: true,
      ),
    );
    when(() => authRepository.getAllUsers()).thenAnswer(
      (_) async => const [
        User(
          id: 'u-5',
          name: 'Active Cashier',
          role: UserRole.cashier,
          isActive: true,
        ),
      ],
    );

    await tester.pumpWidget(buildApp());
    await tester.pumpAndSettle();

    expect(find.byType(SafeArea), findsAtLeastNWidgets(1));
    expect(find.text('Gestión de Usuarios'), findsOneWidget);
  });

  testWidgets('shows BOH shell entry and navigates to shell screen', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1200, 2000);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    when(() => authRepository.getCurrentUser()).thenAnswer(
      (_) async => const User(
        id: 'u-6',
        name: 'Owner',
        role: UserRole.owner,
        isActive: true,
      ),
    );
    when(() => authRepository.getAllUsers()).thenAnswer((_) async => const []);

    await tester.pumpWidget(buildApp());
    await tester.pumpAndSettle();

    expect(find.text('Inventario'), findsOneWidget);

    await tester.tap(find.text('Inventario'));
    await tester.pumpAndSettle();

    expect(find.text('BOH Shell Screen'), findsOneWidget);
  });

  testWidgets(
    'drawer has no direct inventory shortcuts (BOH is the only inventory portal)',
    (tester) async {
      tester.view.physicalSize = const Size(1200, 2000);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      when(() => authRepository.getCurrentUser()).thenAnswer(
        (_) async => const User(
          id: 'u-7',
          name: 'Owner',
          role: UserRole.owner,
          isActive: true,
        ),
      );
      when(
        () => authRepository.getAllUsers(),
      ).thenAnswer((_) async => const []);

      await tester.pumpWidget(buildApp());
      await tester.pumpAndSettle();

      expect(find.text('Insumos'), findsNothing);
      expect(find.text('Proveedores'), findsNothing);
      expect(find.text('Bodegas'), findsNothing);
      expect(find.text('Mermas'), findsNothing);
      expect(find.text('Inventario'), findsOneWidget);
    },
  );

  testWidgets(
    'operator switch with no open shift pushes lock screen without logout',
    (tester) async {
      tester.view.physicalSize = const Size(1200, 2000);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      stubAuth(
        const User(
          id: 'u-8',
          name: 'Cashier Out',
          role: UserRole.cashier,
          isActive: true,
        ),
      );
      final saleViewModel = stubSaleViewModel();
      final observer = _TrackingNavigatorObserver();

      await tester.pumpWidget(
        buildApp(saleViewModel: saleViewModel, navigatorObservers: [observer]),
      );
      await tester.pumpAndSettle();

      expect(find.text('Cambiar operador'), findsOneWidget);

      await tester.tap(find.text('Cambiar operador'));
      await tester.pumpAndSettle();

      expect(find.text(_lockScreenMarker), findsOneWidget);
      expect(find.text(_cashScreenMarker), findsNothing);
      verifyNever(() => authRepository.logout());
    },
  );

  testWidgets(
    'operator switch with an open cash shift is blocked and routed to cash view',
    (tester) async {
      tester.view.physicalSize = const Size(1200, 2000);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      stubAuth(
        const User(
          id: 'u-9',
          name: 'Cashier Out',
          role: UserRole.cashier,
          isActive: true,
        ),
      );
      final saleViewModel = stubSaleViewModel(
        activeSession: CashierSession(
          id: 'session-open-1',
          userId: 'u-9',
          openedAt: DateTime(2024, 1, 15, 8),
        ),
      );

      await tester.pumpWidget(buildApp(saleViewModel: saleViewModel));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Cambiar operador'));
      await tester.pumpAndSettle();

      expect(find.text(_lockScreenMarker), findsNothing);
      expect(find.text(_cashScreenMarker), findsOneWidget);
      expect(find.text(_expectedBlockedMessage), findsOneWidget);
      verifyNever(() => authRepository.logout());
    },
  );

  testWidgets(
    'blocked handover message is Spanish operator copy without ids or English',
    (tester) async {
      tester.view.physicalSize = const Size(1200, 2000);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      stubAuth(
        const User(
          id: 'u-10',
          name: 'Cashier Out',
          role: UserRole.cashier,
          isActive: true,
        ),
      );
      final saleViewModel = stubSaleViewModel(
        activeSession: CashierSession(
          id: 'session-open-2',
          userId: 'u-10',
          openedAt: DateTime(2024, 1, 15, 9),
        ),
      );

      await tester.pumpWidget(buildApp(saleViewModel: saleViewModel));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Cambiar operador'));
      await tester.pumpAndSettle();

      final snackBarText = tester
          .widget<Text>(find.text(_expectedBlockedMessage))
          .data!;
      // No raw ids / enum vocabulary rendered to the operator.
      expect(snackBarText, isNot(contains(RegExp(r'[0-9]'))));
      // No English implementation vocabulary (NHILOS §39.4).
      expect(
        snackBarText.toLowerCase(),
        isNot(
          matches(RegExp(r'\b(shift|session|close|open|operator|cash|till)\b')),
        ),
      );
      expect(snackBarText, _expectedBlockedMessage);
    },
  );

  testWidgets('Cerrar Sesión still performs the device-level logout', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1200, 2000);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    stubAuth(
      const User(
        id: 'u-11',
        name: 'Owner',
        role: UserRole.owner,
        isActive: true,
      ),
    );
    final observer = _TrackingNavigatorObserver();

    await tester.pumpWidget(buildApp(navigatorObservers: [observer]));
    await tester.pumpAndSettle();

    await tester.tap(find.text('CERRAR SESIÓN'));
    await tester.pumpAndSettle();

    verify(() => authRepository.logout()).called(1);
    expect(observer.pushedRouteNames, contains('/'));
  });

  CashierSessionEntity openShift() => CashierSessionEntity(
    id: 'shift-open-1',
    userId: 'u-12',
    terminalId: 'TERM-01',
    openedAt: DateTime(2026, 1, 15, 8).millisecondsSinceEpoch,
    isClosed: false,
  );

  testWidgets(
    'Cerrar Sesión with an open shift asks for an explicit decision first',
    (tester) async {
      tester.view.physicalSize = const Size(1200, 2000);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      stubAuth(
        const User(
          id: 'u-12',
          name: 'Cashier',
          role: UserRole.cashier,
          isActive: true,
        ),
      );

      await tester.pumpWidget(
        buildApp(
          cashShiftViewModel: stubCashShiftViewModel(activeShift: openShift()),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('CERRAR SESIÓN'));
      await tester.pumpAndSettle();

      expect(find.text('Caja abierta — Cerrar sesión'), findsOneWidget);
      expect(find.text('HACER CORTE Z AHORA'), findsOneWidget);
      expect(find.text('ABANDONAR TURNO TEMPORALMENTE'), findsOneWidget);
      verifyNever(() => authRepository.logout());

      await tester.tap(find.text('CANCELAR'));
      await tester.pumpAndSettle();

      expect(find.text('Caja abierta — Cerrar sesión'), findsNothing);
      verifyNever(() => authRepository.logout());
    },
  );

  testWidgets(
    'Corte Z decision opens the unified close flow instead of signing out',
    (tester) async {
      tester.view.physicalSize = const Size(1200, 2000);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      stubAuth(
        const User(
          id: 'u-12',
          name: 'Owner',
          role: UserRole.owner,
          isActive: true,
        ),
      );
      when(
        () => auditRepository.logForensic(
          'SUPERVISOR_OVERRIDE_CLOSE_SESSION',
          metodoAutorizacion: any(named: 'metodoAutorizacion'),
          usuarioAutorizadorId: any(named: 'usuarioAutorizadorId'),
          metadata: any(named: 'metadata'),
        ),
      ).thenAnswer((_) async {});

      await tester.pumpWidget(
        buildApp(
          cashShiftViewModel: stubCashShiftViewModel(activeShift: openShift()),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('CERRAR SESIÓN'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('HACER CORTE Z AHORA'));
      await tester.pumpAndSettle();

      expect(find.text('Arqueo Ciego y Cierre de Turno'), findsOneWidget);
      verifyNever(() => authRepository.logout());
    },
  );

  testWidgets(
    'abandoning the shift requires a reason and records it before logout',
    (tester) async {
      tester.view.physicalSize = const Size(1200, 2000);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      stubAuth(
        const User(
          id: 'u-12',
          name: 'Cashier',
          role: UserRole.cashier,
          isActive: true,
          tenantId: 'tenant-1',
        ),
      );
      when(
        () => auditRepository.logForensic(
          'SHIFT_ABANDONED_ON_LOGOUT',
          metadata: any(named: 'metadata'),
        ),
      ).thenAnswer((_) async {});
      final observer = _TrackingNavigatorObserver();

      await tester.pumpWidget(
        buildApp(
          cashShiftViewModel: stubCashShiftViewModel(activeShift: openShift()),
          navigatorObservers: [observer],
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('CERRAR SESIÓN'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('ABANDONAR TURNO TEMPORALMENTE'));
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('shift_abandon_confirm_button')));
      await tester.pump();

      expect(
        find.text('El motivo es obligatorio para registrar el abandono.'),
        findsOneWidget,
      );
      verifyNever(
        () => auditRepository.logForensic(
          'SHIFT_ABANDONED_ON_LOGOUT',
          metadata: any(named: 'metadata'),
        ),
      );
      verifyNever(() => authRepository.logout());

      await tester.enterText(
        find.byKey(const Key('shift_abandon_reason_input')),
        'Cambio de turno',
      );
      await tester.tap(find.byKey(const Key('shift_abandon_confirm_button')));
      await tester.pumpAndSettle();

      final captured = verify(
        () => auditRepository.logForensic(
          'SHIFT_ABANDONED_ON_LOGOUT',
          metadata: captureAny(named: 'metadata'),
        ),
      ).captured;
      final metadata =
          jsonDecode(captured.single as String) as Map<String, dynamic>;
      expect(metadata['reason'], 'Cambio de turno');
      expect(metadata['shift_id'], 'shift-open-1');
      expect(metadata['terminal_id'], 'TERM-01');

      verify(() => authRepository.logout()).called(1);
      expect(observer.pushedRouteNames, contains('/'));
    },
  );

  testWidgets(
    'a Corte Z that leaves the shift open keeps the session alive',
    (tester) async {
      tester.view.physicalSize = const Size(1200, 2000);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      stubAuth(
        const User(
          id: 'u-12',
          name: 'Owner',
          role: UserRole.owner,
          isActive: true,
        ),
      );
      when(
        () => auditRepository.logForensic(
          'SUPERVISOR_OVERRIDE_CLOSE_SESSION',
          metodoAutorizacion: any(named: 'metodoAutorizacion'),
          usuarioAutorizadorId: any(named: 'usuarioAutorizadorId'),
          metadata: any(named: 'metadata'),
        ),
      ).thenAnswer((_) async {});

      await tester.pumpWidget(
        buildApp(
          cashShiftViewModel: stubCashShiftViewModel(activeShift: openShift()),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('CERRAR SESIÓN'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('HACER CORTE Z AHORA'));
      await tester.pumpAndSettle();

      expect(find.text('Arqueo Ciego y Cierre de Turno'), findsOneWidget);
      await tester.tap(find.text('Cancelar'));
      await tester.pumpAndSettle();

      expect(
        find.text('No se cerró la sesión: el turno de caja sigue abierto.'),
        findsOneWidget,
      );
      verifyNever(() => authRepository.logout());
    },
  );

  testWidgets(
    'an audit failure blocks the abandonment instead of signing out blind',
    (tester) async {
      tester.view.physicalSize = const Size(1200, 2000);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      stubAuth(
        const User(
          id: 'u-12',
          name: 'Cashier',
          role: UserRole.cashier,
          isActive: true,
          tenantId: 'tenant-1',
        ),
      );
      when(
        () => auditRepository.logForensic(
          'SHIFT_ABANDONED_ON_LOGOUT',
          metadata: any(named: 'metadata'),
        ),
      ).thenAnswer((_) async => throw Exception('audit unavailable'));

      await tester.pumpWidget(
        buildApp(
          cashShiftViewModel: stubCashShiftViewModel(activeShift: openShift()),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('CERRAR SESIÓN'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('ABANDONAR TURNO TEMPORALMENTE'));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byKey(const Key('shift_abandon_reason_input')),
        'Cambio de turno',
      );
      await tester.tap(find.byKey(const Key('shift_abandon_confirm_button')));
      await tester.pumpAndSettle();

      expect(
        find.text('No se pudo registrar el motivo. No se cerró la sesión.'),
        findsOneWidget,
      );
      verifyNever(() => authRepository.logout());
    },
  );
}
