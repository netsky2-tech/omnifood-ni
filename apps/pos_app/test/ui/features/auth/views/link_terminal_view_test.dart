import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:pos_app/data/services/hardware_fingerprint_service.dart';
import 'package:pos_app/data/services/install_app_link_service.dart';
import 'package:pos_app/domain/models/auth/terminal_linking.dart';
import 'package:pos_app/domain/repositories/auth_repository.dart';
import 'package:pos_app/ui/features/auth/viewmodels/link_terminal_viewmodel.dart';
import 'package:pos_app/ui/features/auth/views/link_terminal_view.dart';
import 'package:provider/provider.dart';

class _MockAuthRepository extends Mock implements AuthRepository {}

class _FakeInstallAppLinkService extends InstallAppLinkService {
  _FakeInstallAppLinkService({this.initialLink});

  final String? initialLink;
  final StreamController<String> _controller =
      StreamController<String>.broadcast();

  @override
  Future<String?> getInitialLink() async => initialLink;

  @override
  Stream<String> get onLink => _controller.stream;

  void emitLink(String link) {
    _controller.add(link);
  }

  @override
  void dispose() {
    _controller.close();
  }
}

void main() {
  late _MockAuthRepository authRepository;
  late List<String> persistedSlugs;

  setUp(() {
    authRepository = _MockAuthRepository();
    persistedSlugs = <String>[];
  });

  Widget buildApp({
    required LinkTerminalViewModel viewModel,
    LinkingScannerViewBuilder? scannerViewBuilder,
    String? initialLinkingCode,
    InstallAppLinkService? appLinkService,
  }) {
    return MaterialApp(
      routes: {
        '/': (_) => const Scaffold(body: Text('Login Gate')),
        '/config/terminal': (_) =>
            const Scaffold(body: Text('Terminal Config View')),
      },
      initialRoute: '/link',
      onGenerateRoute: (settings) {
        if (settings.name == '/link') {
          return MaterialPageRoute<void>(
            builder: (_) => ChangeNotifierProvider<LinkTerminalViewModel>.value(
              value: viewModel,
              child: LinkTerminalView(
                scannerViewBuilder: scannerViewBuilder,
                initialLinkingCode: initialLinkingCode,
                appLinkService: appLinkService,
              ),
            ),
          );
        }
        return null;
      },
    );
  }

  LinkTerminalViewModel buildViewModel() {
    return LinkTerminalViewModel(
      authRepository,
      deviceId: 'Q802024120001',
      persistTenantSlug: (slug) async => persistedSlugs.add(slug),
    );
  }

  group('LinkTerminalView (Issue #958)', () {
    testWidgets('manual 6-char code entry links terminal and navigates to /',
        (tester) async {
      when(() => authRepository.claimLinkingCode('MAN123', 'Q802024120001'))
          .thenAnswer(
        (_) async => const TerminalLinking(
          tenantId: 'tenant-1',
          slug: 'cafe-central',
          deviceId: 'Q802024120001',
        ),
      );

      final appLinkService = _FakeInstallAppLinkService();
      addTearDown(appLinkService.dispose);

      await tester.pumpWidget(
        buildApp(
          viewModel: buildViewModel(),
          appLinkService: appLinkService,
        ),
      );
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextField), 'MAN123');
      await tester.tap(find.text('VINCULAR TERMINAL'));
      await tester.pumpAndSettle();

      verify(() => authRepository.claimLinkingCode('MAN123', 'Q802024120001'))
          .called(1);
      expect(persistedSlugs, ['cafe-central']);
      expect(find.text('Login Gate'), findsOneWidget);
    });

    testWidgets(
        'QR scan of install-kit URL extracts code, claims it, and navigates to /',
        (tester) async {
      when(() => authRepository.claimLinkingCode('AB23CD', 'Q802024120001'))
          .thenAnswer(
        (_) async => const TerminalLinking(
          tenantId: 'tenant-2',
          slug: 'soho',
          deviceId: 'Q802024120001',
        ),
      );

      final appLinkService = _FakeInstallAppLinkService();
      addTearDown(appLinkService.dispose);

      await tester.pumpWidget(
        buildApp(
          viewModel: buildViewModel(),
          appLinkService: appLinkService,
          scannerViewBuilder: (context, onCodeDetected, onManualFallback) {
            return Center(
              child: ElevatedButton(
                key: const Key('fake_emit_valid_qr'),
                onPressed: () => onCodeDetected(
                  'https://api.nhilospos.com/i/tok123?code=AB23CD',
                ),
                child: const Text('Emit QR'),
              ),
            );
          },
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('scan_linking_qr_button')));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('fake_emit_valid_qr')), findsOneWidget);
      await tester.tap(find.byKey(const Key('fake_emit_valid_qr')));
      await tester.pumpAndSettle();

      verify(() => authRepository.claimLinkingCode('AB23CD', 'Q802024120001'))
          .called(1);
      expect(persistedSlugs, ['soho']);
      expect(find.text('Login Gate'), findsOneWidget);
    });

    testWidgets('invalid QR scan closes overlay and shows clear Spanish error',
        (tester) async {
      final appLinkService = _FakeInstallAppLinkService();
      addTearDown(appLinkService.dispose);

      await tester.pumpWidget(
        buildApp(
          viewModel: buildViewModel(),
          appLinkService: appLinkService,
          scannerViewBuilder: (context, onCodeDetected, onManualFallback) {
            return Center(
              child: ElevatedButton(
                key: const Key('fake_emit_invalid_qr'),
                onPressed: () =>
                    onCodeDetected('https://example.com/not-a-linking-qr'),
                child: const Text('Emit Invalid QR'),
              ),
            );
          },
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('scan_linking_qr_button')));
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('fake_emit_invalid_qr')));
      await tester.pumpAndSettle();

      verifyNever(() => authRepository.claimLinkingCode(any(), any()));
      expect(
        find.text(
          'El código QR escaneado no contiene un código de vinculación válido.',
        ),
        findsOneWidget,
      );
      // Manual input remains visible and usable after invalid QR.
      expect(find.byType(TextField), findsOneWidget);
    });

    testWidgets(
        'App Link cold-start prefills linking code and automatically claims it',
        (tester) async {
      when(() => authRepository.claimLinkingCode('CD45EF', 'Q802024120001'))
          .thenAnswer(
        (_) async => const TerminalLinking(
          tenantId: 'tenant-3',
          slug: 'bistro-ni',
          deviceId: 'Q802024120001',
        ),
      );

      final appLinkService = _FakeInstallAppLinkService(
        initialLink: 'https://api.nhilospos.com/i/tok456?code=cd45ef',
      );
      addTearDown(appLinkService.dispose);

      await tester.pumpWidget(
        buildApp(
          viewModel: buildViewModel(),
          appLinkService: appLinkService,
        ),
      );
      await tester.pumpAndSettle();

      verify(() => authRepository.claimLinkingCode('CD45EF', 'Q802024120001'))
          .called(1);
      expect(persistedSlugs, ['bistro-ni']);
      expect(find.text('Login Gate'), findsOneWidget);
    });

    testWidgets(
        'App Link warm-start via onLink prefills linking code and claims it',
        (tester) async {
      when(() => authRepository.claimLinkingCode('GH67JK', 'Q802024120001'))
          .thenAnswer(
        (_) async => const TerminalLinking(
          tenantId: 'tenant-4',
          slug: 'roastery',
          deviceId: 'Q802024120001',
        ),
      );

      final appLinkService = _FakeInstallAppLinkService();
      addTearDown(appLinkService.dispose);

      await tester.pumpWidget(
        buildApp(
          viewModel: buildViewModel(),
          appLinkService: appLinkService,
        ),
      );
      await tester.pumpAndSettle();

      appLinkService.emitLink('https://api.nhilospos.com/i/tok789?code=GH67JK');
      await tester.pumpAndSettle();

      verify(() => authRepository.claimLinkingCode('GH67JK', 'Q802024120001'))
          .called(1);
      expect(persistedSlugs, ['roastery']);
      expect(find.text('Login Gate'), findsOneWidget);
    });
  });

  group('LinkTerminalView reactivation card (Issue #566)', () {
    const sampleFingerprint =
        'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';

    testWidgets(
        'shows Reactivar terminal card with maskedHint and completes with '
        '6-digit recovery code', (tester) async {
      when(() => authRepository.lookupReactivationDevice(sampleFingerprint))
          .thenAnswer(
        (_) async => const DeviceReactivationLookupResult(
          found: true,
          recoveryChallengeId: 'challenge-ui-1',
          status: 'PENDING',
          maskedHint: 'Terminal «••••0001» — Ca*** Ce***',
        ),
      );
      when(
        () => authRepository.completeReactivation(
          challengeId: 'challenge-ui-1',
          hardwareFingerprint: sampleFingerprint,
          recoveryCode: null,
        ),
      ).thenThrow(
        const TerminalReactivationException(
          'Approval required',
          code: 'REACTIVATION_APPROVAL_REQUIRED',
          statusCode: 403,
        ),
      );
      when(
        () => authRepository.completeReactivation(
          challengeId: 'challenge-ui-1',
          hardwareFingerprint: sampleFingerprint,
          recoveryCode: '739201',
        ),
      ).thenAnswer(
        (_) async => CompletedReactivationResult(
          tenantId: 'tenant-1',
          slug: 'cafe-central',
          terminalId: 'Q802024120001',
          activationAttemptId: 'attempt-1',
          credentialId: 'cred-2',
          version: 2,
          renewalSecret: 'secret-token-for-widget-test-0123456789',
          expiresAt: DateTime.utc(2027, 1, 1),
          previousVersion: 1,
        ),
      );
      when(
        () => authRepository.confirmReactivationCredential(
          challengeId: 'challenge-ui-1',
          credentialId: 'cred-2',
          version: 2,
          renewalSecret: 'secret-token-for-widget-test-0123456789',
        ),
      ).thenAnswer((_) async {});

      final appLinkService = _FakeInstallAppLinkService();
      addTearDown(appLinkService.dispose);

      final viewModel = LinkTerminalViewModel(
        authRepository,
        deviceId: 'pos-local-temp',
        persistTenantSlug: (slug) async => persistedSlugs.add(slug),
        hardwareFingerprintService: HardwareFingerprintService(
          provider: () async => sampleFingerprint,
        ),
      );

      await tester.pumpWidget(
        buildApp(
          viewModel: viewModel,
          appLinkService: appLinkService,
        ),
      );
      await tester.pumpAndSettle();

      // Card is shown with masked hint, and manual linking UI remains intact.
      expect(find.byKey(const Key('reactivate_terminal_card')), findsOneWidget);
      expect(find.text('Reactivar terminal'), findsOneWidget);
      expect(
        find.text('Terminal «••••0001» — Ca*** Ce***'),
        findsOneWidget,
      );
      expect(find.byKey(const Key('linking_code_input')), findsOneWidget);
      expect(find.byKey(const Key('scan_linking_qr_button')), findsOneWidget);

      // Tapping primary button before approval surfaces guidance.
      await tester.tap(find.byKey(const Key('complete_reactivation_button')));
      await tester.pumpAndSettle();
      expect(
        find.text(
          'Esperando aprobación desde el panel del negocio o ingresá tu código de recuperación de 6 dígitos.',
        ),
        findsOneWidget,
      );

      // Expanding recovery code input and submitting 6-digit code succeeds.
      await tester.ensureVisible(
        find.byKey(const Key('toggle_recovery_code_button')),
      );
      await tester.tap(find.byKey(const Key('toggle_recovery_code_button')));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.byKey(const Key('recovery_code_input')));
      await tester.enterText(
        find.byKey(const Key('recovery_code_input')),
        '739201',
      );
      await tester.ensureVisible(
        find.byKey(const Key('submit_recovery_code_button')),
      );
      await tester.tap(find.byKey(const Key('submit_recovery_code_button')));
      await tester.pumpAndSettle();

      expect(persistedSlugs, ['cafe-central']);
      expect(find.text('Login Gate'), findsOneWidget);
    });
  });
}
