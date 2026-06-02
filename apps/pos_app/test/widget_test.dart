import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:pos_app/main.dart';
import 'package:pos_app/domain/models/inventory/forensic_alert.dart';
import 'package:pos_app/ui/features/auth/viewmodels/login_viewmodel.dart';
import 'package:pos_app/ui/features/auth/viewmodels/lock_screen_viewmodel.dart';
import 'package:pos_app/domain/repositories/auth_repository.dart';
import 'package:pos_app/data/daos/user_dao.dart';
import 'package:pos_app/domain/models/user.dart';
import 'package:pos_app/data/models/user_entity.dart';
import 'package:pos_app/domain/services/alerts/alert_service.dart';

// Manual fakes for smoke test
class FakeAuthRepository implements AuthRepository {
  FakeAuthRepository({this.currentUser});

  final User? currentUser;

  @override
  bool get isPendingSync => false;
  @override
  DateTime? get lastSyncTimestamp => null;

  @override
  Future<User?> loginOnline(String email, String password) async => null;
  @override
  Future<bool> authorizeOverride({required String supervisorId, String? pin, String? totpCode}) async => false;
  @override
  Future<void> syncStaff() async {}
  @override
  Future<User?> loginOffline(String userId, String pin) async => null;
  @override
  Future<User?> getCurrentUser() async => currentUser;
  @override
  Future<String?> getAccessToken() async => null;
  @override
  Future<void> logout() async {}
  @override
  Future<List<User>> getAllUsers() async => currentUser == null ? [] : [currentUser!];
  @override
  Future<void> saveUser(User user, {String? pin}) async {}
  @override
  Future<void> deleteUser(String userId) async {}
}

class FakeUserDao implements UserDao {
  @override
  Future<List<UserEntity>> findAllActiveUsers() async => [];
  @override
  Future<List<UserEntity>> findAllUsers() async => [];
  @override
  Future<UserEntity?> findUserById(String id) async => null;
  @override
  Future<UserEntity?> findUserByEmail(String email) async => null;
  @override
  Future<void> insertUsers(List<UserEntity> users) async {}
  @override
  Future<void> deleteAllUsers() async {}
}

class FakeAlertService implements AlertService {
  @override
  Stream<AlertMessage> get alertStream => const Stream.empty();

  @override
  Stream<List<ForensicAlert>> get sessionAlertsStream =>
      const Stream<List<ForensicAlert>>.empty();

  @override
  List<ForensicAlert> get sessionAlerts => const <ForensicAlert>[];

  @override
  void publishAlert(ForensicAlert alert) {}

  @override
  void notifyLowStock(String insumoName, double currentStock, double parLevel) {}
}

void main() {
  Widget buildApp({String initialRoute = '/', User? currentUser}) {
    final fakeAuth = FakeAuthRepository(currentUser: currentUser);
    final fakeUserDao = FakeUserDao();
    final fakeAlertService = FakeAlertService();

    return MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => LoginViewModel(fakeAuth)),
        ChangeNotifierProvider(create: (_) => LockScreenViewModel(fakeAuth, fakeUserDao)),
        Provider<AuthRepository>.value(value: fakeAuth),
      ],
      child: MyApp(
        alertService: fakeAlertService,
        initialRoute: initialRoute,
      ),
    );
  }

  testWidgets('App smoke test', (WidgetTester tester) async {
    await tester.pumpWidget(buildApp());

    // Verify that login screen is shown
    expect(find.text('INGRESAR'), findsOneWidget);

    final materialApp = tester.widget<MaterialApp>(find.byType(MaterialApp));
    expect(materialApp.routes, isNotNull);
    expect(materialApp.routes!.containsKey('/inventory/boh'), isTrue);
    expect(materialApp.routes!.containsKey('/identity/users'), isTrue);
    expect(materialApp.routes!.containsKey('/identity/audit'), isTrue);
  });

  testWidgets('BOH shell route denies waiter access', (WidgetTester tester) async {
    await tester.pumpWidget(
      buildApp(
        initialRoute: '/inventory/boh',
        currentUser: const User(
          id: 'u-waiter',
          name: 'Waiter',
          role: UserRole.waiter,
          isActive: true,
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Acceso restringido'), findsOneWidget);
    expect(
      find.textContaining('No tenés permisos para acceder a Inventario BOH.'),
      findsOneWidget,
    );
  });

  testWidgets('BOH shell route allows manager access', (WidgetTester tester) async {
    await tester.pumpWidget(
      buildApp(
        initialRoute: '/inventory/boh',
        currentUser: const User(
          id: 'u-manager',
          name: 'Manager',
          role: UserRole.manager,
          isActive: true,
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Inventario BOH'), findsOneWidget);
    expect(find.text('Compras'), findsOneWidget);
    expect(find.text('Producción'), findsOneWidget);
  });
}
