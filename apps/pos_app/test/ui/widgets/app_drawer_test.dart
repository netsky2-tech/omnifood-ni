import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:pos_app/domain/models/sales/cashier_session.dart';
import 'package:pos_app/domain/models/user.dart';
import 'package:pos_app/domain/repositories/auth_repository.dart';
import 'package:pos_app/presentation/features/sales/view_models/sale_view_model.dart';
import 'package:pos_app/ui/widgets/app_drawer.dart';
import 'package:provider/provider.dart';

class _MockAuthRepository extends Mock implements AuthRepository {}

class _MockSaleViewModel extends Mock implements SaleViewModel {}

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

  SaleViewModel stubSaleViewModel({CashierSession? activeSession}) {
    final saleViewModel = _MockSaleViewModel();
    when(() => saleViewModel.activeSession).thenReturn(activeSession);
    return saleViewModel;
  }

  void stubAuth(User user) {
    when(() => authRepository.getCurrentUser()).thenAnswer((_) async => user);
    when(() => authRepository.getAllUsers()).thenAnswer((_) async => const []);
  }

  Widget buildApp({SaleViewModel? saleViewModel, List<NavigatorObserver>? navigatorObservers}) {
    return MultiProvider(
      providers: [
        Provider<AuthRepository>.value(value: authRepository),
        if (saleViewModel != null)
          ChangeNotifierProvider<SaleViewModel>.value(value: saleViewModel),
      ],
      child: MaterialApp(
        routes: {
            '/inventory/boh': (_) => const Scaffold(body: Text('BOH Shell Screen')),
            '/inventory/kardex': (_) => const Scaffold(body: Text('Kardex Screen')),
            '/inventory/production': (_) => const Scaffold(body: Text('Production Screen')),
            '/inventory/alerts': (_) => const Scaffold(body: Text('Alerts Screen')),
           '/inventory/counts': (_) => const Scaffold(body: Text('Physical Count Screen')),
           '/lock': (_) => const Scaffold(body: Text(_lockScreenMarker)),
           '/sales/cash': (_) => const Scaffold(body: Text(_cashScreenMarker)),
        },
        navigatorObservers: navigatorObservers ?? const [],
        home: const Scaffold(
          body: AppDrawer(),
        ),
      ),
    );
  }

  setUp(() {
    authRepository = _MockAuthRepository();
    when(() => authRepository.logout()).thenAnswer((_) async {});
  });

  testWidgets('hides DGI reports item for waiter role', (tester) async {
    tester.view.physicalSize = const Size(1200, 2000);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    when(() => authRepository.getCurrentUser()).thenAnswer(
      (_) async => const User(id: 'u-1', name: 'Waiter', role: UserRole.waiter, isActive: true),
    );
    when(() => authRepository.getAllUsers()).thenAnswer((_) async => const []);

    await tester.pumpWidget(buildApp());
    await tester.pumpAndSettle();

    expect(find.text('Reportes DGI'), findsNothing);
    expect(find.text('Inventario BOH'), findsOneWidget);
    expect(find.text('Producción'), findsNothing);
    expect(
      tester.widget<ListTile>(find.widgetWithText(ListTile, 'Inventario BOH')).enabled,
      isFalse,
    );
  });

  testWidgets('hides DGI reports item for cashier role (S-RBAC-05 runtime proof)', (tester) async {
    tester.view.physicalSize = const Size(1200, 2000);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    when(() => authRepository.getCurrentUser()).thenAnswer(
      (_) async => const User(id: 'u-3', name: 'Cashier', role: UserRole.cashier, isActive: true),
    );
    when(() => authRepository.getAllUsers()).thenAnswer((_) async => const []);

    await tester.pumpWidget(buildApp());
    await tester.pumpAndSettle();

    expect(find.text('Reportes DGI'), findsNothing);
    expect(find.byIcon(Icons.analytics), findsNothing);
    expect(
      tester.widget<ListTile>(find.widgetWithText(ListTile, 'Inventario BOH')).enabled,
      isFalse,
    );
    expect(find.text('Identidad de la Terminal'), findsNothing);
    expect(find.text('Activar Terminal'), findsNothing);
  });

  testWidgets('shows DGI reports item for manager role', (tester) async {
    tester.view.physicalSize = const Size(1200, 2000);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    when(() => authRepository.getCurrentUser()).thenAnswer(
      (_) async => const User(id: 'u-2', name: 'Manager', role: UserRole.manager, isActive: true),
    );
    when(() => authRepository.getAllUsers()).thenAnswer((_) async => const []);

    await tester.pumpWidget(buildApp());
    await tester.pumpAndSettle();

    expect(find.text('Reportes DGI'), findsOneWidget);
    expect(find.text('Inventario BOH'), findsOneWidget);
    expect(find.text('Identidad de la Terminal'), findsOneWidget);
    expect(find.text('Activar Terminal'), findsOneWidget);
  });

  testWidgets('shows identity management and safe area for active users', (tester) async {
    tester.view.physicalSize = const Size(1200, 2000);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    when(() => authRepository.getCurrentUser()).thenAnswer(
      (_) async => const User(id: 'u-4', name: 'Owner', role: UserRole.owner, isActive: true),
    );
    when(() => authRepository.getAllUsers()).thenAnswer(
      (_) async => const [
        User(id: 'u-5', name: 'Active Cashier', role: UserRole.cashier, isActive: true),
      ],
    );

    await tester.pumpWidget(buildApp());
    await tester.pumpAndSettle();

    expect(find.byType(SafeArea), findsAtLeastNWidgets(1));
    expect(find.text('Gestión de Usuarios'), findsOneWidget);
  });

  testWidgets('shows BOH shell entry and navigates to shell screen', (tester) async {
    tester.view.physicalSize = const Size(1200, 2000);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    when(() => authRepository.getCurrentUser()).thenAnswer(
      (_) async => const User(id: 'u-6', name: 'Owner', role: UserRole.owner, isActive: true),
    );
    when(() => authRepository.getAllUsers()).thenAnswer((_) async => const []);

    await tester.pumpWidget(buildApp());
    await tester.pumpAndSettle();

    expect(find.text('Inventario BOH'), findsOneWidget);

    await tester.tap(find.text('Inventario BOH'));
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
        (_) async => const User(id: 'u-7', name: 'Owner', role: UserRole.owner, isActive: true),
      );
      when(() => authRepository.getAllUsers()).thenAnswer((_) async => const []);

      await tester.pumpWidget(buildApp());
      await tester.pumpAndSettle();

      expect(find.text('Insumos'), findsNothing);
      expect(find.text('Proveedores'), findsNothing);
      expect(find.text('Bodegas'), findsNothing);
      expect(find.text('Mermas'), findsNothing);
      expect(find.text('Inventario BOH'), findsOneWidget);
    },
  );

  testWidgets(
    'operator switch with no open shift pushes lock screen without logout',
    (tester) async {
      tester.view.physicalSize = const Size(1200, 2000);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      stubAuth(const User(
          id: 'u-8', name: 'Cashier Out', role: UserRole.cashier, isActive: true));
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

      stubAuth(const User(
          id: 'u-9', name: 'Cashier Out', role: UserRole.cashier, isActive: true));
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

      stubAuth(const User(
          id: 'u-10', name: 'Cashier Out', role: UserRole.cashier, isActive: true));
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

  testWidgets('Cerrar Sesión still performs the device-level logout', (tester) async {
    tester.view.physicalSize = const Size(1200, 2000);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    stubAuth(const User(
        id: 'u-11', name: 'Owner', role: UserRole.owner, isActive: true));
    final observer = _TrackingNavigatorObserver();

    await tester.pumpWidget(buildApp(navigatorObservers: [observer]));
    await tester.pumpAndSettle();

    await tester.tap(find.text('CERRAR SESIÓN'));
    await tester.pumpAndSettle();

    verify(() => authRepository.logout()).called(1);
    expect(observer.pushedRouteNames, contains('/'));
  });
}
