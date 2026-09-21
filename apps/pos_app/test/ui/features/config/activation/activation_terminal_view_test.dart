import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:pos_app/data/models/activation/activation_attempt_local_entity.dart';
import 'package:pos_app/data/models/activation/activation_check_result_local_entity.dart';
import 'package:pos_app/data/ports/activation_sync_port.dart';
import 'package:pos_app/data/services/activation_controlled_sale_runner.dart';
import 'package:pos_app/data/services/activation_pre_offline_runner.dart';
import 'package:pos_app/data/services/activation_priming_service.dart';
import 'package:pos_app/data/services/activation_reconnect_sync_runner.dart';
import 'package:pos_app/data/services/activation_session_service.dart';
import 'package:pos_app/domain/models/user.dart';
import 'package:pos_app/domain/repositories/auth_repository.dart';
import 'package:pos_app/ui/features/config/activation/activation_session_view_model.dart';
import 'package:pos_app/ui/features/config/activation/activation_terminal_view.dart';
import 'package:provider/provider.dart';

class _MockActivationSessionService extends Mock
    implements ActivationSessionService {}

class _MockAuthRepository extends Mock implements AuthRepository {}

class _MockActivationPrimingService extends Mock
    implements ActivationPrimingService {}

ActivationAttemptLocalEntity _attemptEntity() =>
    const ActivationAttemptLocalEntity(
      attemptId: 'attempt-1',
      tenantId: 'tenant-1',
      candidateTerminalId: 'terminal-1',
      localStatus: 'ASSIGNED',
      requiredFiscalRevision: 1,
      requiredFiscalFingerprint: 'fp-1',
      verificationProductId: 'product-1',
      assignedAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    );

ActivationCheckResultLocalEntity _checkEntity(String code, String status) =>
    ActivationCheckResultLocalEntity(
      id: 'check-$code',
      tenantId: 'tenant-1',
      activationAttemptId: 'attempt-1',
      checkCode: code,
      status: status,
      evidenceType: 'TEST_EVIDENCE',
      evidenceRef: 'evidence-1',
      recordedAt: '2026-01-01T00:00:00.000Z',
    );

void main() {
  late _MockActivationSessionService sessionService;
  late _MockAuthRepository authRepository;
  late _MockActivationPrimingService primingService;
  late ActivationSessionViewModel viewModel;

  const loggedInUser = User(
    id: 'user-1',
    name: 'Operador',
    role: UserRole.owner,
    isActive: true,
    tenantId: 'tenant-1',
  );

  setUp(() {
    sessionService = _MockActivationSessionService();
    authRepository = _MockAuthRepository();
    primingService = _MockActivationPrimingService();
    when(() => authRepository.getCurrentUser())
        .thenAnswer((_) async => loggedInUser);
    when(() => primingService.primeTerminal()).thenAnswer(
      (_) async => const ActivationPrimingResult(
        status: 'OK',
        appliedProducts: 0,
        appliedCatalogValues: 0,
        fiscalEnvelopePresent: false,
        fiscalOutcome: null,
        serverCurrentVersion: 7,
      ),
    );
    viewModel = ActivationSessionViewModel(
      sessionService: sessionService,
      primingService: primingService,
      authRepository: authRepository,
    );
  });

  void stubPreparationSuccess() {
    when(() => sessionService.prepare(tenantId: 'tenant-1')).thenAnswer(
      (_) async => ActivationSessionPreparationResult(
        isSuccess: true,
        attempt: _attemptEntity(),
      ),
    );
  }

  void stubPreparationBlocker({
    String code = 'NO_ACTIVE_ATTEMPT',
    String message = 'No hay un intento de activación activo para este tenant.',
  }) {
    when(() => sessionService.prepare(tenantId: 'tenant-1')).thenAnswer(
      (_) async => ActivationSessionPreparationResult(
        isSuccess: false,
        blockerCode: code,
        blockerMessage: message,
      ),
    );
  }

  void stubPreOfflineChecks({
    required bool isReadyForOffline,
    Map<String, ActivationCheckResultLocalEntity> checks = const {},
    List<String> blockers = const [],
  }) {
    when(() => sessionService.runPreOfflineChecks(
          authorizedUserId: any(named: 'authorizedUserId'),
          authorizedUserPin: any(named: 'authorizedUserPin'),
        )).thenAnswer(
      (_) async => PreOfflineRunnerSummary(
        isReadyForOffline: isReadyForOffline,
        checks: checks,
        blockers: blockers,
      ),
    );
  }

  void stubControlledSaleSuccess() {
    when(() => sessionService.executeControlledOfflineSale(
          cashierUserId: any(named: 'cashierUserId'),
        )).thenAnswer(
      (_) async => const ControlledSaleResult(
        isSuccess: true,
        verificationTicketId: 'ticket-1',
        attemptStatus: 'LOCAL_ACTIVATION_EVIDENCE_COMPLETE',
      ),
    );
  }

  void stubReconnectSuccess({
    String attemptStatus = 'ACTIVATED',
  }) {
    when(() => sessionService.syncActivationEvidence()).thenAnswer(
      (_) async => ActivationReconnectSyncResult(
        isSuccess: true,
        attemptStatus: attemptStatus,
        syncedEnvelopesCount: 3,
        backendFinalizeResult: const FinalizeActivationResult(
          isSuccess: true,
          status: 'PASS',
        ),
      ),
    );
  }

  Widget buildWidget(ActivationSessionViewModel viewModel) {
    return ChangeNotifierProvider<ActivationSessionViewModel>.value(
      value: viewModel,
      child: const MaterialApp(home: ActivationTerminalView()),
    );
  }

  /// Prepares the screen and runs phase 1 successfully so later phases can be
  /// exercised.
  Future<void> pumpThroughPhase1(
    WidgetTester tester, {
    String pin = '1234',
  }) async {
    stubPreparationSuccess();
    stubPreOfflineChecks(
      isReadyForOffline: true,
      checks: {'TERMINAL_LINKED': _checkEntity('TERMINAL_LINKED', 'PASS')},
    );
    await tester.pumpWidget(buildWidget(viewModel));
    await tester.pumpAndSettle();

    await tester.enterText(find.byKey(const Key('activation_pin_field')), pin);
    await tester.ensureVisible(find.byKey(const Key('run_pre_offline_button')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('run_pre_offline_button')));
    await tester.pumpAndSettle();
  }

  group('ActivationTerminalView', () {
    testWidgets(
        'renders the resolved attempt with its terminal id and status when '
        'preparation succeeds', (tester) async {
      stubPreparationSuccess();

      await tester.pumpWidget(buildWidget(viewModel));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('activation_terminal_id')), findsOneWidget);
      expect(
        find.text('terminal-1'),
        findsOneWidget,
      );
      expect(
          find.byKey(const Key('activation_attempt_status')), findsOneWidget);
      expect(find.text('ASSIGNED'), findsOneWidget);
      expect(
          find.byKey(const Key('activation_blocker_code')), findsNothing);
    });

    testWidgets(
        'renders the blocker code and message distinctly when preparation '
        'fails', (tester) async {
      stubPreparationBlocker(
        code: 'NO_ACTIVE_ATTEMPT',
        message: 'No hay un intento de activación activo para este tenant.',
      );

      await tester.pumpWidget(buildWidget(viewModel));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('activation_blocker_code')), findsOneWidget);
      expect(find.text('NO_ACTIVE_ATTEMPT'), findsOneWidget);
      expect(
        find.byKey(const Key('activation_blocker_message')),
        findsOneWidget,
      );
      expect(
        find.text('No hay un intento de activación activo para este tenant.'),
        findsOneWidget,
      );
      expect(find.byKey(const Key('activation_terminal_id')), findsNothing);
      expect(find.byKey(const Key('activation_attempt_status')), findsNothing);
    });

    testWidgets(
        'keeps later phases unactionable before their predecessors succeed',
        (tester) async {
      stubPreparationSuccess();

      await tester.pumpWidget(buildWidget(viewModel));
      await tester.pumpAndSettle();

      final controlledSaleButton = tester.widget<ElevatedButton>(
        find.byKey(const Key('run_controlled_sale_button')),
      );
      final reconnectButton = tester.widget<ElevatedButton>(
        find.byKey(const Key('run_reconnect_button')),
      );
      expect(controlledSaleButton.onPressed, isNull);
      expect(reconnectButton.onPressed, isNull);

      // Tapping the disabled buttons must not reach the session service.
      await tester.ensureVisible(
          find.byKey(const Key('run_controlled_sale_button')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('run_controlled_sale_button')));
      await tester.pumpAndSettle();
      verifyNever(() => sessionService.executeControlledOfflineSale(
            cashierUserId: any(named: 'cashierUserId'),
          ));
    });

    testWidgets(
        'obscures the pin without prefilling it, forwards it to the phase, '
        'and hides the field after the phase runs', (tester) async {
      stubPreparationSuccess();
      stubPreOfflineChecks(
        isReadyForOffline: true,
        checks: {'TERMINAL_LINKED': _checkEntity('TERMINAL_LINKED', 'PASS')},
      );

      await tester.pumpWidget(buildWidget(viewModel));
      await tester.pumpAndSettle();

      final pinField = tester.widget<TextField>(
        find.byKey(const Key('activation_pin_field')),
      );
      expect(pinField.obscureText, isTrue);
      expect(pinField.controller!.text, isEmpty);

      await tester.enterText(
          find.byKey(const Key('activation_pin_field')), '1234');
      await tester.ensureVisible(find.byKey(const Key('run_pre_offline_button')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('run_pre_offline_button')));
      await tester.pumpAndSettle();

      verify(() => sessionService.runPreOfflineChecks(
            authorizedUserId: 'user-1',
            authorizedUserPin: '1234',
          )).called(1);
      expect(find.byKey(const Key('activation_pin_field')), findsNothing);
    });

    testWidgets(
        'renders each reported pre-offline check with its code and status, '
        'and nothing that was not reported', (tester) async {
      stubPreparationSuccess();
      stubPreOfflineChecks(
        isReadyForOffline: false,
        checks: {
          'TERMINAL_LINKED': _checkEntity('TERMINAL_LINKED', 'PASS'),
          'PRINTER_AVAILABLE': _checkEntity('PRINTER_AVAILABLE', 'FAIL'),
        },
        blockers: ['PRINTER_AVAILABLE_FAILED: Printer is not ready'],
      );

      await tester.pumpWidget(buildWidget(viewModel));
      await tester.pumpAndSettle();

      await tester.enterText(
          find.byKey(const Key('activation_pin_field')), '1234');
      await tester.ensureVisible(find.byKey(const Key('run_pre_offline_button')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('run_pre_offline_button')));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('check_row_TERMINAL_LINKED')),
          findsOneWidget);
      expect(find.text('TERMINAL_LINKED'), findsOneWidget);
      expect(find.byKey(const Key('check_row_PRINTER_AVAILABLE')),
          findsOneWidget);
      expect(find.text('FAIL'), findsOneWidget);

      // The runner did not report SQLITE_DURABILITY in this summary, so the
      // screen must not invent it.
      expect(find.byKey(const Key('check_row_SQLITE_DURABILITY')),
          findsNothing);
      // The reported blockers render verbatim in the phase blockers block.
      // The view model surfaces the same failure in errorMessage too, but the
      // screen deduplicates the channels: the message renders exactly once.
      final blockersText = tester.widget<Text>(
        find.byKey(const Key('pre_offline_blockers')),
      );
      expect(
        blockersText.data,
        contains('PRINTER_AVAILABLE_FAILED: Printer is not ready'),
      );
      expect(
        find.text('PRINTER_AVAILABLE_FAILED: Printer is not ready'),
        findsOneWidget,
      );
    });

    testWidgets(
        'keeps the pin field usable after a failed check phase so the phase '
        'can be retried with a fresh entry', (tester) async {
      stubPreparationSuccess();
      stubPreOfflineChecks(
        isReadyForOffline: false,
        checks: {
          'PRINTER_AVAILABLE': _checkEntity('PRINTER_AVAILABLE', 'FAIL'),
        },
        blockers: ['PRINTER_AVAILABLE_FAILED: Printer is not ready'],
      );

      await tester.pumpWidget(buildWidget(viewModel));
      await tester.pumpAndSettle();

      await tester.enterText(
          find.byKey(const Key('activation_pin_field')), '1234');
      await tester.ensureVisible(find.byKey(const Key('run_pre_offline_button')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('run_pre_offline_button')));
      await tester.pumpAndSettle();

      // The phase failed: the field must remain available for a retry, and
      // the entered PIN must not be retained.
      expect(find.byKey(const Key('activation_pin_field')), findsOneWidget);
      final pinField = tester.widget<TextField>(
        find.byKey(const Key('activation_pin_field')),
      );
      expect(pinField.obscureText, isTrue);
      expect(pinField.controller!.text, isEmpty);

      // The operator fixes the cause and retries with a fresh PIN entry.
      stubPreOfflineChecks(
        isReadyForOffline: true,
        checks: {'TERMINAL_LINKED': _checkEntity('TERMINAL_LINKED', 'PASS')},
      );
      await tester.enterText(
          find.byKey(const Key('activation_pin_field')), '5678');
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('run_pre_offline_button')));
      await tester.pumpAndSettle();

      verify(() => sessionService.runPreOfflineChecks(
            authorizedUserId: 'user-1',
            authorizedUserPin: '5678',
          )).called(1);
      // Once the phase has succeeded the field is no longer needed.
      expect(find.byKey(const Key('activation_pin_field')), findsNothing);
    });

    testWidgets(
        'renders a failed check phase message exactly once on the screen',
        (tester) async {
      stubPreparationSuccess();
      stubPreOfflineChecks(
        isReadyForOffline: false,
        checks: {
          'PRINTER_AVAILABLE': _checkEntity('PRINTER_AVAILABLE', 'FAIL'),
        },
        blockers: ['PRINTER_AVAILABLE_FAILED: Printer is not ready'],
      );

      await tester.pumpWidget(buildWidget(viewModel));
      await tester.pumpAndSettle();

      await tester.enterText(
          find.byKey(const Key('activation_pin_field')), '1234');
      await tester.ensureVisible(find.byKey(const Key('run_pre_offline_button')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('run_pre_offline_button')));
      await tester.pumpAndSettle();

      // The blockers text is rendered verbatim in the phase blockers block,
      // and exactly once on the whole screen: the global error card must not
      // repeat the same message.
      expect(find.byKey(const Key('pre_offline_blockers')), findsOneWidget);
      expect(
        find.text('PRINTER_AVAILABLE_FAILED: Printer is not ready'),
        findsOneWidget,
      );
      expect(find.byKey(const Key('activation_error')), findsNothing);
    });

    testWidgets(
        'keeps the controlled sale phase unactionable while the pre-offline '
        'phase has not succeeded', (tester) async {
      stubPreparationSuccess();
      stubPreOfflineChecks(
        isReadyForOffline: false,
        checks: {
          'PRINTER_AVAILABLE': _checkEntity('PRINTER_AVAILABLE', 'FAIL'),
        },
        blockers: ['PRINTER_AVAILABLE_FAILED: Printer is not ready'],
      );

      await tester.pumpWidget(buildWidget(viewModel));
      await tester.pumpAndSettle();

      await tester.enterText(
          find.byKey(const Key('activation_pin_field')), '1234');
      await tester.ensureVisible(find.byKey(const Key('run_pre_offline_button')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('run_pre_offline_button')));
      await tester.pumpAndSettle();

      final controlledSaleButton = tester.widget<ElevatedButton>(
        find.byKey(const Key('run_controlled_sale_button')),
      );
      expect(controlledSaleButton.onPressed, isNull);
      await tester.ensureVisible(
          find.byKey(const Key('run_controlled_sale_button')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('run_controlled_sale_button')));
      await tester.pumpAndSettle();
      verifyNever(() => sessionService.executeControlledOfflineSale(
            cashierUserId: any(named: 'cashierUserId'),
          ));
    });

    testWidgets(
        'renders the controlled sale outcome with its verification ticket and '
        'reported checks', (tester) async {
      stubPreparationSuccess();
      stubPreOfflineChecks(
        isReadyForOffline: true,
        checks: {'TERMINAL_LINKED': _checkEntity('TERMINAL_LINKED', 'PASS')},
      );
      when(() => sessionService.executeControlledOfflineSale(
            cashierUserId: any(named: 'cashierUserId'),
          )).thenAnswer(
        (_) async => ControlledSaleResult(
          isSuccess: true,
          verificationTicketId: 'ticket-1',
          attemptStatus: 'LOCAL_ACTIVATION_EVIDENCE_COMPLETE',
          checks: {
            'OFFLINE_SALE_PAID': _checkEntity('OFFLINE_SALE_PAID', 'PASS'),
          },
        ),
      );

      await tester.pumpWidget(buildWidget(viewModel));
      await tester.pumpAndSettle();

      await tester.enterText(
          find.byKey(const Key('activation_pin_field')), '1234');
      await tester.ensureVisible(find.byKey(const Key('run_pre_offline_button')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('run_pre_offline_button')));
      await tester.pumpAndSettle();

      await tester.ensureVisible(
          find.byKey(const Key('run_controlled_sale_button')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('run_controlled_sale_button')));
      await tester.pumpAndSettle();

      expect(
          find.byKey(const Key('verification_ticket_id')), findsOneWidget);
      expect(find.text('ticket-1'), findsOneWidget);
      expect(find.byKey(const Key('check_row_OFFLINE_SALE_PAID')),
          findsOneWidget);
    });

    testWidgets(
        'renders the finalized status reported by the backend after the '
        'reconnect phase', (tester) async {
      await pumpThroughPhase1(tester);
      stubControlledSaleSuccess();
      stubReconnectSuccess(attemptStatus: 'ACTIVATED');

      await tester.ensureVisible(
          find.byKey(const Key('run_controlled_sale_button')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('run_controlled_sale_button')));
      await tester.pumpAndSettle();

      final reconnectButton = tester.widget<ElevatedButton>(
        find.byKey(const Key('run_reconnect_button')),
      );
      expect(reconnectButton.onPressed, isNotNull);

      await tester.ensureVisible(find.byKey(const Key('run_reconnect_button')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('run_reconnect_button')));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('finalized_status')), findsOneWidget);
      expect(find.text('ACTIVATED'), findsOneWidget);
      // The follow-up is credential provisioning and terminal readiness; the
      // screen must not claim the device credential was already created.
      expect(find.byKey(const Key('finalization_next_steps')), findsOneWidget);
      expect(find.textContaining('credencial'), findsOneWidget);
    });
  });
}
