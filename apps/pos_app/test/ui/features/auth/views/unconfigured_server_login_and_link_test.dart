import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:pos_app/domain/models/auth/terminal_linking.dart';
import 'package:pos_app/domain/repositories/auth_repository.dart';
import 'package:pos_app/ui/features/auth/viewmodels/link_terminal_viewmodel.dart';
import 'package:pos_app/ui/features/auth/viewmodels/login_viewmodel.dart';
import 'package:pos_app/ui/features/auth/views/link_terminal_view.dart';
import 'package:pos_app/ui/features/auth/views/login_view.dart';
import 'package:provider/provider.dart';

class _MockAuthRepository extends Mock implements AuthRepository {}

void main() {
  late _MockAuthRepository authRepository;

  setUp(() {
    authRepository = _MockAuthRepository();
  });

  group('LinkTerminalView unconfigured server guidance (Issue #941)', () {
    testWidgets(
        'renders technical settings button in app bar and unconfigured server card on error',
        (tester) async {
      when(() => authRepository.claimLinkingCode(any(), any())).thenThrow(
        const LinkingClaimException(
          'Esta terminal no tiene un servidor configurado. Las ventas siguen '
          'funcionando sin conexión, pero la sincronización no está disponible.',
        ),
      );

      final viewModel = LinkTerminalViewModel(
        authRepository,
        deviceId: 'Q802024120001',
        persistTenantSlug: (_) async {},
      );

      await tester.pumpWidget(
        MaterialApp(
          routes: {
            '/config/terminal': (_) => const Scaffold(body: Text('Terminal Config View')),
          },
          home: ChangeNotifierProvider<LinkTerminalViewModel>.value(
            value: viewModel,
            child: const LinkTerminalView(),
          ),
        ),
      );

      // Verify app bar button exists
      expect(find.byKey(const Key('terminal_config_button')), findsOneWidget);

      // Submit code to trigger unconfigured server error
      await tester.enterText(find.byType(TextField), 'ABC123');
      await tester.tap(find.text('VINCULAR TERMINAL'));
      await tester.pumpAndSettle();

      // Card and action button must appear
      expect(find.byKey(const Key('unconfigured_server_card')), findsOneWidget);
      expect(find.byKey(const Key('open_server_config_button')), findsOneWidget);
      expect(find.text('Servidor no configurado'), findsOneWidget);

      // Tapping action opens /config/terminal
      await tester.tap(find.byKey(const Key('open_server_config_button')));
      await tester.pumpAndSettle();
      expect(find.text('Terminal Config View'), findsOneWidget);
    });
  });

  group('LoginView unconfigured server guidance (Issue #941)', () {
    testWidgets(
        'renders server config button in app bar and unconfigured server card on error',
        (tester) async {
      when(() => authRepository.loginOnline(any(), any(), tenantSlug: any(named: 'tenantSlug')))
          .thenAnswer((_) async => null);
      when(() => authRepository.loginOffline(any(), any()))
          .thenAnswer((_) async => null);
      when(() => authRepository.lastAuthError).thenReturn(
        'Esta terminal no tiene un servidor configurado. El inicio de sesión en línea no está disponible.',
      );

      final viewModel = LoginViewModel(authRepository);

      await tester.pumpWidget(
        MaterialApp(
          routes: {
            '/config/terminal': (_) => const Scaffold(body: Text('Terminal Config View')),
          },
          home: ChangeNotifierProvider<LoginViewModel>.value(
            value: viewModel,
            child: const LoginView(),
          ),
        ),
      );

      // Verify app bar button exists
      expect(find.byKey(const Key('login_server_config_button')), findsOneWidget);

      // Tap login to trigger error
      await tester.tap(find.text('SINCRONIZAR Y CONFIGURAR'));
      await tester.pumpAndSettle();

      // Card and action button must appear
      expect(find.byKey(const Key('login_unconfigured_server_card')), findsOneWidget);
      expect(find.byKey(const Key('login_open_server_config_button')), findsOneWidget);
      expect(find.text('Servidor no configurado'), findsOneWidget);

      // Tapping action opens /config/terminal
      await tester.ensureVisible(find.byKey(const Key('login_open_server_config_button')));
      await tester.tap(find.byKey(const Key('login_open_server_config_button')));
      await tester.pumpAndSettle();
      expect(find.text('Terminal Config View'), findsOneWidget);
    });
  });
}
