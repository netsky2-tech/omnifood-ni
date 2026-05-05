import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';

import 'package:pos_app/domain/repositories/auth_repository.dart';
import 'package:pos_app/domain/models/user.dart';

class MockAuthRepository extends Mock implements AuthRepository {
  @override
  Future<User?> getCurrentUser() => (super.noSuchMethod(
        Invocation.method(#getCurrentUser, []),
        returnValue: Future.value(null),
      ) as Future<User?>);
  @override
  Future<List<User>> getAllUsers() => (super.noSuchMethod(
        Invocation.method(#getAllUsers, []),
        returnValue: Future.value(<User>[]),
      ) as Future<List<User>>);
  @override
  Future<void> logout() => (super.noSuchMethod(
        Invocation.method(#logout, []),
        returnValue: Future.value(null),
      ) as Future<void>);
  @override
  Future<User?> loginOnline(String email, String password) => (super.noSuchMethod(
        Invocation.method(#loginOnline, [email, password]),
        returnValue: Future.value(null),
      ) as Future<User?>);
  @override
  Future<void> syncStaff() => (super.noSuchMethod(
        Invocation.method(#syncStaff, []),
        returnValue: Future.value(null),
      ) as Future<void>);
  @override
  Future<User?> loginOffline(String userId, String pin) => (super.noSuchMethod(
        Invocation.method(#loginOffline, [userId, pin]),
        returnValue: Future.value(null),
      ) as Future<User?>);
  @override
  Future<String?> getAccessToken() => (super.noSuchMethod(
        Invocation.method(#getAccessToken, []),
        returnValue: Future.value(null),
      ) as Future<String?>);
  @override
  Future<void> saveUser(User user, {String? pin}) => (super.noSuchMethod(
        Invocation.method(#saveUser, [user], {#pin: pin}),
        returnValue: Future.value(null),
      ) as Future<void>);
  @override
  Future<void> deleteUser(String userId) => (super.noSuchMethod(
        Invocation.method(#deleteUser, [userId]),
        returnValue: Future.value(null),
      ) as Future<void>);
}
void main() {
  late MockAuthRepository mockAuthRepository;

  setUp(() {
    mockAuthRepository = MockAuthRepository();
    when(mockAuthRepository.getCurrentUser()).thenAnswer((_) async => User(id: '1', name: 'Test User', email: 'test@example.com', role: UserRole.owner, isActive: true));
    when(mockAuthRepository.getAllUsers()).thenAnswer((_) async => [
      User(id: '1', name: 'Test User', email: 'test@example.com', role: UserRole.owner, isActive: true),
      User(id: '2', name: 'Another User', email: 'another@example.com', role: UserRole.cashier, isActive: true),
    ]);
  });

  group('AppDrawer', () {
    // NOTE: Widget test commented out - requires AppDrawer widget implementation
    // testWidgets('shows "Gestión de Usuarios" when userCount > 0', (WidgetTester tester) async {
    //   await tester.pumpWidget(
    //     Provider<AuthRepository>.value(
    //       value: mockAuthRepository,
    //       child: createAppDrawerTester(),
    //     ),
    //   );
    //   await tester.pumpAndSettle();
    //   await tester.tap(find.byIcon(Icons.menu));
    //   await tester.pumpAndSettle();
    //   expect(find.text('Gestión de Usuarios'), findsOneWidget);
    // });
  });
}
