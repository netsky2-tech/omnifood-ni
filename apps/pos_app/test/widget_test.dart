import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:pos_app/main.dart';
import 'package:pos_app/ui/features/auth/viewmodels/login_viewmodel.dart';
import 'package:pos_app/ui/features/auth/viewmodels/lock_screen_viewmodel.dart';
import 'package:pos_app/domain/repositories/auth_repository.dart';
import 'package:pos_app/data/daos/user_dao.dart';
import 'package:pos_app/domain/models/user.dart';
import 'package:pos_app/data/models/user_entity.dart';

// Manual fakes for smoke test
class FakeAuthRepository implements AuthRepository {
  @override
  Future<User?> loginOnline(String email, String password) async => null;
  @override
  Future<void> syncStaff() async {}
  @override
  Future<User?> loginOffline(String userId, String pin) async => null;
  @override
  Future<User?> getCurrentUser() async => null;
  @override
  Future<void> logout() async {}
}

class FakeUserDao implements UserDao {
  @override
  Future<List<UserEntity>> findAllActiveUsers() async => [];
  @override
  Future<UserEntity?> findUserById(String id) async => null;
  @override
  Future<void> insertUsers(List<UserEntity> users) async {}
  @override
  Future<void> deleteAllUsers() async {}
}

void main() {
  testWidgets('App smoke test', (WidgetTester tester) async {
    final fakeAuth = FakeAuthRepository();
    final fakeUserDao = FakeUserDao();

    await tester.pumpWidget(
      MultiProvider(
        providers: [
          ChangeNotifierProvider(create: (_) => LoginViewModel(fakeAuth)),
          ChangeNotifierProvider(create: (_) => LockScreenViewModel(fakeAuth, fakeUserDao)),
        ],
        child: const MyApp(),
      ),
    );

    // Verify that login screen is shown
    expect(find.text('INGRESAR'), findsOneWidget);
  });
}
