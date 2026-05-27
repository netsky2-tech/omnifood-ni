import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:pos_app/domain/models/user.dart';
import 'package:pos_app/domain/repositories/auth_repository.dart';
import 'package:pos_app/ui/features/auth/viewmodels/login_viewmodel.dart';

class _MockAuthRepository extends Mock implements AuthRepository {}

void main() {
  late _MockAuthRepository authRepository;
  late LoginViewModel viewModel;

  setUp(() {
    authRepository = _MockAuthRepository();
    viewModel = LoginViewModel(authRepository);
  });

  test('sets generic offline error when fallback auth fails and pending sync is false', () async {
    when(() => authRepository.loginOnline(any(), any())).thenAnswer((_) async => null);

    final result = await viewModel.login('cashier@omnifood.ni', 'bad');

    expect(result, isFalse);
    expect(
      viewModel.error,
      equals('Error de autenticación. Verifique sus credenciales o conexión.'),
    );
  });

  test('clears error when login succeeds after offline fallback', () async {
    final user = User(
      id: 'u-1',
      name: 'Cashier One',
      role: UserRole.cashier,
      isActive: true,
      email: 'cashier@omnifood.ni',
      tenantId: 'tenant-1',
    );
    when(() => authRepository.loginOnline(any(), any())).thenAnswer((_) async => user);

    final result = await viewModel.login('cashier@omnifood.ni', '1234');

    expect(result, isTrue);
    expect(viewModel.error, isNull);
  });
}
