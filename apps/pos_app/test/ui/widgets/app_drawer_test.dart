import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:pos_app/domain/models/user.dart';
import 'package:pos_app/domain/repositories/auth_repository.dart';
import 'package:pos_app/ui/widgets/app_drawer.dart';
import 'package:provider/provider.dart';

class _MockAuthRepository extends Mock implements AuthRepository {}

void main() {
  late _MockAuthRepository authRepository;

  Widget buildApp() {
    return Provider<AuthRepository>.value(
      value: authRepository,
        child: MaterialApp(
          routes: {
              '/inventory/boh': (_) => const Scaffold(body: Text('BOH Shell Screen')),
              '/inventory/kardex': (_) => const Scaffold(body: Text('Kardex Screen')),
              '/inventory/production': (_) => const Scaffold(body: Text('Production Screen')),
              '/inventory/alerts': (_) => const Scaffold(body: Text('Alerts Screen')),
             '/inventory/counts': (_) => const Scaffold(body: Text('Physical Count Screen')),
           },
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
}
