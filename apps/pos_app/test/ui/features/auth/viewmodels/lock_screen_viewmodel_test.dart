import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/daos/user_dao.dart';
import 'package:pos_app/data/models/user_entity.dart';
import 'package:pos_app/domain/models/user.dart';
import 'package:pos_app/domain/repositories/auth_repository.dart';
import 'package:pos_app/domain/models/auth/terminal_linking.dart';
import 'package:pos_app/ui/features/auth/viewmodels/lock_screen_viewmodel.dart';

class _FakeAuthRepository implements AuthRepository {
  _FakeAuthRepository({this.offlineLoginResult});

  /// When non-null, `loginOffline` succeeds and returns this user.
  final User? offlineLoginResult;

  @override
  bool get isPendingSync => false;
  @override
  DateTime? get lastSyncTimestamp => null;
  @override
  String? get lastAuthError => null;

  @override
  Future<void> logout() async {}
  @override
  Future<User?> loginOffline(String userId, String pin) async => offlineLoginResult;
  @override
  Future<User?> loginOnline(String email, String password, {String? tenantSlug}) async => null;
  @override
  Future<TerminalLinking> claimLinkingCode(String code, String deviceId) async =>
      const TerminalLinking(tenantId: '', slug: '', deviceId: '');
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

User _user() => const User(
      id: 'cashier-1',
      name: 'Cajero',
      email: 'cajero@nhilospos.ni',
      role: UserRole.cashier,
      isActive: true,
    );

void main() {
  group('LockScreenViewModel', () {
    // D-17: a handover (Cambiar operador) must land on the user list, never on
    // the outgoing operator's pre-selected PIN pad.
    test('loadUsers clears any previously selected user', () async {
      final viewModel = LockScreenViewModel(_FakeAuthRepository(), _FakeUserDao());

      viewModel.selectUser(_user());
      expect(viewModel.selectedUser, isNotNull);

      await viewModel.loadUsers();

      expect(viewModel.selectedUser, isNull);
    });

    test('loadUsers clears a stale error message', () async {
      final viewModel = LockScreenViewModel(_FakeAuthRepository(), _FakeUserDao());

      viewModel.selectUser(_user());
      final unlocked = await viewModel.unlock('wrong-pin');
      expect(unlocked, isFalse);
      expect(viewModel.error, isNotNull);

      await viewModel.loadUsers();

      expect(viewModel.error, isNull);
    });

    test('unlock failure keeps the selection so the operator can retry', () async {
      final viewModel = LockScreenViewModel(_FakeAuthRepository(), _FakeUserDao());

      viewModel.selectUser(_user());
      // Fake repo returns null => unlock fails; selection must remain so the
      // operator can retry with the correct PIN on the same pad.
      final failed = await viewModel.unlock('wrong-pin');
      expect(failed, isFalse);
      expect(viewModel.selectedUser, isNotNull);
    });

    test('unlock success clears the selected user (no parking on a user)', () async {
      final viewModel = LockScreenViewModel(
        _FakeAuthRepository(offlineLoginResult: _user()),
        _FakeUserDao(),
      );

      viewModel.selectUser(_user());
      final unlocked = await viewModel.unlock('123456');

      expect(unlocked, isTrue);
      expect(viewModel.selectedUser, isNull);
    });
  });
}
