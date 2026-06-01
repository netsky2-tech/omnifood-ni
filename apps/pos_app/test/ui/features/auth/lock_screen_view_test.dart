import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:pos_app/data/daos/user_dao.dart';
import 'package:pos_app/data/models/user_entity.dart';
import 'package:pos_app/domain/models/user.dart';
import 'package:pos_app/domain/repositories/auth_repository.dart';
import 'package:pos_app/ui/features/auth/viewmodels/lock_screen_viewmodel.dart';
import 'package:pos_app/ui/features/auth/views/lock_screen_view.dart';

class _FakeAuthRepository implements AuthRepository {
  @override
  bool get isPendingSync => false;
  @override
  DateTime? get lastSyncTimestamp => null;

  @override
  Future<void> logout() async {}
  @override
  Future<User?> loginOffline(String userId, String pin) async => null;
  @override
  Future<User?> loginOnline(String email, String password) async => null;
  @override
  Future<User?> getCurrentUser() async => null;
  @override
  Future<String?> getAccessToken() async => null;
  @override
  Future<List<User>> getAllUsers() async => [];
  @override
  Future<void> saveUser(User user, {String? pin}) async {}
  @override
  Future<void> deleteUser(String userId) async {}
  @override
  Future<void> syncStaff() async {}
  @override
  Future<bool> authorizeOverride({required String supervisorId, String? pin, String? totpCode}) async => false;
}

class _FakeUserDao implements UserDao {
  @override
  Future<List<UserEntity>> findAllActiveUsers() async => [
    UserEntity(
      id: 'cashier-1',
      name: 'Cajero',
      role: 'cashier',
      pinHash: 'hash',
      isActive: true,
    ),
  ];

  @override
  Future<List<UserEntity>> findAllUsers() async => findAllActiveUsers();
  @override
  Future<UserEntity?> findUserByEmail(String email) async => null;
  @override
  Future<UserEntity?> findUserById(String id) async => null;
  @override
  Future<void> insertUsers(List<UserEntity> users) async {}
  @override
  Future<void> deleteAllUsers() async {}
}

void main() {
  testWidgets('uses compact pin pad max-height constraint', (tester) async {
    tester.view.physicalSize = const Size(1600, 1200);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final viewModel = LockScreenViewModel(_FakeAuthRepository(), _FakeUserDao());

    await tester.pumpWidget(
      MaterialApp(
        home: ChangeNotifierProvider.value(
          value: viewModel,
          child: const LockScreenView(),
        ),
      ),
    );

    await tester.pumpAndSettle();

    final constrainedBox = tester.widget<ConstrainedBox>(
      find.byWidgetPredicate(
        (widget) =>
            widget is ConstrainedBox &&
            widget.constraints.maxHeight == 340 &&
            widget.constraints.maxWidth == 450,
      ),
    );

    expect(constrainedBox.constraints.maxHeight, 340);
    expect(find.byType(AbsorbPointer), findsWidgets);
  });
}
