import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'dart:async';
import 'package:provider/provider.dart';
import 'package:pos_app/domain/models/user.dart';
import 'package:pos_app/domain/repositories/auth_repository.dart';
import 'package:pos_app/ui/features/identity/users/user_management_view.dart';
import 'package:pos_app/ui/features/identity/users/user_management_view_model.dart';

class _MockAuthRepository extends Mock implements AuthRepository {}
class _FakeUser extends Fake implements User {}

void main() {
  late _MockAuthRepository authRepository;
  late UserManagementViewModel viewModel;

  setUp(() {
    registerFallbackValue(_FakeUser());
    authRepository = _MockAuthRepository();
    viewModel = UserManagementViewModel(authRepository);

    when(() => authRepository.getAllUsers()).thenAnswer((_) async => <User>[]);
    when(() => authRepository.saveUser(any(), pin: any(named: 'pin')))
        .thenAnswer((_) async {});
  });

  testWidgets('new user dialog waits for save completion before dismissing', (
    tester,
  ) async {
    final saveCompleter = Completer<void>();
    var saveRequested = false;
    when(() => authRepository.saveUser(any(), pin: any(named: 'pin'))).thenAnswer((_) {
      saveRequested = true;
      return saveCompleter.future;
    });

    await tester.pumpWidget(
      MaterialApp(
        home: ChangeNotifierProvider.value(
          value: viewModel,
          child: const UserManagementView(),
        ),
      ),
    );

    await tester.pumpAndSettle();

    await tester.tap(find.text('NUEVO USUARIO'));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField).at(0), 'Ana Cajera');
    await tester.enterText(find.byType(TextField).at(1), 'ana@omnifood.ni');
    await tester.enterText(find.byType(TextField).at(2), '1234');

    await tester.tap(find.text('GUARDAR'));
    await tester.pump();

    expect(saveRequested, isTrue);
    expect(find.byType(AlertDialog), findsOneWidget);

    saveCompleter.complete();
    await tester.pumpAndSettle();

    expect(find.byType(AlertDialog), findsNothing);
  });
}
