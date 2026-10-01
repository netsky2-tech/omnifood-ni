import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:pos_app/data/models/activation/activation_attempt_local_entity.dart';
import 'package:pos_app/data/models/activation/activation_check_result_local_entity.dart';
import 'package:pos_app/data/ports/activation_priming_port.dart';
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
    when(() => sessionService.getCompletedAttempt('tenant-1'))
        .thenAnswer((_) async => null);
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
    when(() => sessionService.getCompletedAttempt('tenant-1'))
        .thenAnswer((_) async => null);
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
    when(() => sessionService.getCompletedAttempt('tenant-1'))
        .thenAnswer((_) async => null);
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

  Widget buildWidget(
    ActivationSessionViewModel viewModel, {
    ActivationFiscalSeriesLoader? loadFiscalSeries,
  }) {
    return ChangeNotifierProvider<ActivationSessionViewModel>.value(
      value: viewModel,
      child: MaterialApp(
        home: ActivationTerminalView(loadFiscalSeries: loadFiscalSeries),
      ),
    );
  }

  /// Prepares the screen and runs phase 1 successfully so later phases can be
  /// exercised.
  Future<void> pumpThroughPhase1(
    WidgetTester tester, {
    String pin = '1234',
    ActivationFiscalSeriesLoader? loadFiscalSeries,
  }) async {
    stubPreparationSuccess();
    stubPreOfflineChecks(
      isReadyForOffline: true,
      checks: {'TERMINAL_LINKED': _checkEntity('TERMINAL_LINKED', 'PASS')},
    );
    await tester.pumpWidget(
      buildWidget(viewModel, loadFiscalSeries: loadFiscalSeries),
    );
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
      expect(find.text('Asignado'), findsOneWidget);
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
      // The raw NO_ACTIVE_ATTEMPT code must never render: the label map
      // translates it to operator-facing Spanish.
      expect(
        find.text('No hay un intento de activación en curso.'),
        findsOneWidget,
      );
      expect(find.text('NO_ACTIVE_ATTEMPT'), findsNothing);
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
      expect(find.text('Terminal vinculada'), findsOneWidget);
      expect(find.text('Aprobado'), findsOneWidget);
      expect(find.byKey(const Key('check_row_PRINTER_AVAILABLE')),
          findsOneWidget);
      expect(find.text('Impresora disponible'), findsOneWidget);
      expect(find.text('Fallido'), findsOneWidget);

      // The runner did not report SQLITE_DURABILITY in this summary, so the
      // screen must not invent it.
      expect(find.byKey(const Key('check_row_SQLITE_DURABILITY')),
          findsNothing);
      // The reported blockers render with the code head localized and the
      // reported detail preserved. The view model surfaces the same failure
      // in errorMessage too, but the screen deduplicates the channels: the
      // message renders exactly once.
      final blockersText = tester.widget<Text>(
        find.byKey(const Key('pre_offline_blockers')),
      );
      expect(
        blockersText.data,
        'La impresora no está lista. Revise su estado en Configuración. — '
        'Printer is not ready',
      );
      expect(
        find.text(
          'La impresora no está lista. Revise su estado en Configuración. — '
          'Printer is not ready',
        ),
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

      // The blockers render with the code head localized and the reported
      // detail preserved, exactly once on the whole screen: the global error
      // card must not repeat the same failure.
      expect(find.byKey(const Key('pre_offline_blockers')), findsOneWidget);
      expect(
        find.text(
          'La impresora no está lista. Revise su estado en Configuración. — '
          'Printer is not ready',
        ),
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
      expect(find.text('Estado del intento: Evidencia local completa'),
          findsOneWidget);
      expect(find.byKey(const Key('check_row_OFFLINE_SALE_PAID')),
          findsOneWidget);
    });

    testWidgets(
        'renders the completion screen with redirect after the reconnect phase succeeds', (tester) async {
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

      // The completion screen replaces the phase cards after a successful
      // reconnect — it shows the outcome and a redirect to the POS.
      expect(find.byKey(const Key('go_to_pos_button')), findsOneWidget);
      expect(find.text('Terminal activado'), findsOneWidget);
    });

    testWidgets(
        'renders a localized priming blocker when the terminal priming '
        'payload is unusable', (tester) async {
      when(() => primingService.primeTerminal()).thenThrow(
        const TerminalPrimingPayloadException(
          'TERMINAL_PRIMING_PAYLOAD_MALFORMED',
          'Server returned a non-object terminal priming payload',
        ),
      );

      await tester.pumpWidget(buildWidget(viewModel));
      await tester.pumpAndSettle();

      // The raw priming failure code never reaches the operator: the
      // blocker-code site renders the label-map translation.
      expect(find.byKey(const Key('activation_blocker_code')), findsOneWidget);
      expect(
        find.text(
          'La respuesta de preparación de la terminal no es utilizable. '
          'Verifique la conexión e intente de nuevo.',
        ),
        findsOneWidget,
      );
      expect(find.text('TERMINAL_PRIMING_PAYLOAD_MALFORMED'), findsNothing);
      expect(find.byKey(const Key('activation_terminal_id')), findsNothing);
      expect(find.byKey(const Key('activation_attempt_status')), findsNothing);
    });
  });

  group('phase 2 fiscal consequence notice', () {
    const irreversibleStatement =
        'Esta fase emite una factura fiscal real que consume un número '
        'consecutivo DGI de forma permanente: no puede deshacerse ni '
        'reutilizarse.';

    testWidgets(
        'states the irreversible fiscal consequence and the concrete folio '
        'when the series is configured, keeping the phase executable',
        (tester) async {
      await pumpThroughPhase1(
        tester,
        loadFiscalSeries: () async => const ActivationFiscalSeriesSnapshot(
          prefix: '001-001-01',
          currentNumber: '3',
        ),
      );

      expect(
          find.byKey(const Key('controlled_sale_fiscal_notice')),
          findsOneWidget);
      expect(find.text(irreversibleStatement), findsOneWidget);
      expect(find.byKey(const Key('controlled_sale_folio')), findsOneWidget);
      // Prefix + zero-padded 8-digit consecutivo: the folio exactly as the
      // DGI numbering service will emit it.
      expect(
        find.text('Folio que se emitirá: 001-001-0100000003'),
        findsOneWidget,
      );
      expect(
        find.byKey(const Key('controlled_sale_fiscal_unconfigured_warning')),
        findsNothing,
      );
      expect(
        find.byKey(const Key('controlled_sale_fiscal_generic_warning')),
        findsNothing,
      );

      // Informational only: the verification sale stays executable.
      final controlledSaleButton = tester.widget<ElevatedButton>(
        find.byKey(const Key('run_controlled_sale_button')),
      );
      expect(controlledSaleButton.onPressed, isNotNull);
    });

    testWidgets(
        'renders the folio as the plain consecutivo when the prefix is '
        'legitimately blank', (tester) async {
      await pumpThroughPhase1(
        tester,
        loadFiscalSeries: () async => const ActivationFiscalSeriesSnapshot(
          prefix: '',
          currentNumber: '7',
        ),
      );

      expect(find.byKey(const Key('controlled_sale_folio')), findsOneWidget);
      expect(
        find.text('Folio que se emitirá: 7'),
        findsOneWidget,
      );
      // No stub prefix: the D-21 pure numeric consecutive renders alone.
      expect(find.textContaining('00000007'), findsNothing);

      final controlledSaleButton = tester.widget<ElevatedButton>(
        find.byKey(const Key('run_controlled_sale_button')),
      );
      expect(controlledSaleButton.onPressed, isNotNull);
    });

    testWidgets(
        'shows the bootstrap warning when no series is configured at all, '
        'naming the authorized-start risk and keeping the phase executable',
        (tester) async {
      await pumpThroughPhase1(
        tester,
        loadFiscalSeries: () async => const ActivationFiscalSeriesSnapshot(),
      );

      expect(find.text(irreversibleStatement), findsOneWidget);
      expect(
        find.byKey(const Key('controlled_sale_fiscal_unconfigured_warning')),
        findsOneWidget,
      );
      expect(
        find.text(
          'La serie fiscal no está configurada. La activación aprovisionará '
          'una serie inicial y esta venta emitirá el número 1. Si la '
          'autorización DGI del cliente comienza en otro número, configure '
          'primero la serie fiscal en Configuración del Negocio; de lo '
          'contrario, la primera venta comercial no será el número '
          'autorizado inicial.',
        ),
        findsOneWidget,
      );
      expect(find.byKey(const Key('controlled_sale_folio')), findsNothing);
      expect(
        find.byKey(const Key('controlled_sale_fiscal_generic_warning')),
        findsNothing,
      );

      // The warning must never block the activation phase.
      final controlledSaleButton = tester.widget<ElevatedButton>(
        find.byKey(const Key('run_controlled_sale_button')),
      );
      expect(controlledSaleButton.onPressed, isNotNull);
    });

    testWidgets(
        'degrades to the generic warning when the config read throws, and '
        'never breaks the screen or blocks the phase', (tester) async {
      await pumpThroughPhase1(
        tester,
        loadFiscalSeries: () async => throw Exception('config read failed'),
      );

      expect(
          find.byKey(const Key('controlled_sale_fiscal_notice')),
          findsOneWidget);
      expect(find.text(irreversibleStatement), findsOneWidget);
      expect(
        find.byKey(const Key('controlled_sale_fiscal_generic_warning')),
        findsOneWidget,
      );
      expect(
        find.text(
          'No se pudo determinar la serie fiscal local. Si la autorización '
          'DGI del cliente comienza en otro número, verifique la serie '
          'fiscal en Configuración del Negocio antes de continuar.',
        ),
        findsOneWidget,
      );
      expect(find.byKey(const Key('controlled_sale_folio')), findsNothing);
      expect(
        find.byKey(const Key('controlled_sale_fiscal_unconfigured_warning')),
        findsNothing,
      );

      final controlledSaleButton = tester.widget<ElevatedButton>(
        find.byKey(const Key('run_controlled_sale_button')),
      );
      expect(controlledSaleButton.onPressed, isNotNull);
    });

    testWidgets(
        'shows lastPersisted + 1 when the persisted invoice is AHEAD of the '
        'configured cursor (D-18 lag), not the lagging cursor', (tester) async {
      await pumpThroughPhase1(
        tester,
        loadFiscalSeries: () async => const ActivationFiscalSeriesSnapshot(
          prefix: '001-001-01',
          currentNumber: '5',
          lastInvoiceNumber: '001-001-01-00000007',
        ),
      );

      expect(find.byKey(const Key('controlled_sale_folio')), findsOneWidget);
      // The cursor says 5 but the last persisted invoice is 7: the numbering
      // service will emit 8. The notice must never show the stale cursor.
      expect(
        find.text('Folio que se emitirá: 001-001-0100000008'),
        findsOneWidget,
      );
      expect(find.textContaining('00000005'), findsNothing);

      final controlledSaleButton = tester.widget<ElevatedButton>(
        find.byKey(const Key('run_controlled_sale_button')),
      );
      expect(controlledSaleButton.onPressed, isNotNull);
    });

    testWidgets(
        'does not lower the shown folio when the persisted invoice is BEHIND '
        'the configured cursor (the cursor wins)', (tester) async {
      await pumpThroughPhase1(
        tester,
        loadFiscalSeries: () async => const ActivationFiscalSeriesSnapshot(
          prefix: '001-001-01',
          currentNumber: '10',
          lastInvoiceNumber: '001-001-01-00000007',
        ),
      );

      expect(find.byKey(const Key('controlled_sale_folio')), findsOneWidget);
      expect(
        find.text('Folio que se emitirá: 001-001-0100000010'),
        findsOneWidget,
      );

      final controlledSaleButton = tester.widget<ElevatedButton>(
        find.byKey(const Key('run_controlled_sale_button')),
      );
      expect(controlledSaleButton.onPressed, isNotNull);
    });

    testWidgets(
        'advances past the persisted invoice when its sequence EQUALS the '
        'configured cursor, exactly like the numbering service', (tester) async {
      await pumpThroughPhase1(
        tester,
        loadFiscalSeries: () async => const ActivationFiscalSeriesSnapshot(
          prefix: '001-001-01',
          currentNumber: '7',
          lastInvoiceNumber: '001-001-01-00000007',
        ),
      );

      expect(find.byKey(const Key('controlled_sale_folio')), findsOneWidget);
      // `_resolveNextSequence` uses >= : an equal sequence is already
      // consumed, so the next folio is lastSequence + 1.
      expect(
        find.text('Folio que se emitirá: 001-001-0100000008'),
        findsOneWidget,
      );

      final controlledSaleButton = tester.widget<ElevatedButton>(
        find.byKey(const Key('run_controlled_sale_button')),
      );
      expect(controlledSaleButton.onPressed, isNotNull);
    });

    testWidgets(
        'falls back to the configured cursor when there is no persisted '
        'invoice', (tester) async {
      await pumpThroughPhase1(
        tester,
        loadFiscalSeries: () async => const ActivationFiscalSeriesSnapshot(
          prefix: '001-001-01',
          currentNumber: '3',
          lastInvoiceNumber: null,
        ),
      );

      expect(find.byKey(const Key('controlled_sale_folio')), findsOneWidget);
      expect(
        find.text('Folio que se emitirá: 001-001-0100000003'),
        findsOneWidget,
      );

      final controlledSaleButton = tester.widget<ElevatedButton>(
        find.byKey(const Key('run_controlled_sale_button')),
      );
      expect(controlledSaleButton.onPressed, isNotNull);
    });

    testWidgets(
        'degrades to the configured cursor when the persisted invoice number '
        'has no parseable trailing sequence, never crashing or showing a '
        'bogus folio', (tester) async {
      await pumpThroughPhase1(
        tester,
        loadFiscalSeries: () async => const ActivationFiscalSeriesSnapshot(
          prefix: '001-001-01',
          currentNumber: '3',
          lastInvoiceNumber: 'FACTURA-SIN-CONSECUTIVO',
        ),
      );

      expect(find.byKey(const Key('controlled_sale_folio')), findsOneWidget);
      expect(
        find.text('Folio que se emitirá: 001-001-0100000003'),
        findsOneWidget,
      );

      final controlledSaleButton = tester.widget<ElevatedButton>(
        find.byKey(const Key('run_controlled_sale_button')),
      );
      expect(controlledSaleButton.onPressed, isNotNull);
    });

    testWidgets(
        'keeps the plain-consecutivo format in the lag case when the prefix '
        'is legitimately blank', (tester) async {
      await pumpThroughPhase1(
        tester,
        loadFiscalSeries: () async => const ActivationFiscalSeriesSnapshot(
          prefix: '',
          currentNumber: '5',
          lastInvoiceNumber: '7',
        ),
      );

      expect(find.byKey(const Key('controlled_sale_folio')), findsOneWidget);
      // Blank prefix (D-21): the folio is the plain decimal consecutive,
      // with no padding and no prefix, even when the persisted invoice
      // forces the sequence forward.
      expect(
        find.text('Folio que se emitirá: 8'),
        findsOneWidget,
      );
      expect(find.textContaining('00000008'), findsNothing);

      final controlledSaleButton = tester.widget<ElevatedButton>(
        find.byKey(const Key('run_controlled_sale_button')),
      );
      expect(controlledSaleButton.onPressed, isNotNull);
    });

    testWidgets(
        'names the lagging-cursor stop when the local consecutive is behind '
        'the cloud maximum: the activation will refuse to sell until the '
        'sequence is reconciled, and the phase stays executable',
        (tester) async {
      await pumpThroughPhase1(
        tester,
        loadFiscalSeries: () async => const ActivationFiscalSeriesSnapshot(
          prefix: '001-001-01',
          currentNumber: '5',
          cloudHighestSequence: '10',
        ),
      );

      expect(
          find.byKey(const Key('controlled_sale_fiscal_notice')),
          findsOneWidget);
      expect(find.text(irreversibleStatement), findsOneWidget);

      final laggingWarning = tester.widget<Text>(
        find.byKey(const Key('controlled_sale_fiscal_lagging_warning')),
      );
      // Names BOTH numbers: the local consecutive and the cloud maximum.
      expect(laggingWarning.data, contains('consecutivo local'));
      expect(laggingWarning.data, contains('(5)'));
      expect(laggingWarning.data, contains('ya emitido en la nube (10)'));
      // Unmistakable stop: refusal plus support, not a self-resolving
      // warning.
      expect(laggingWarning.data, contains('se negará a vender'));
      expect(laggingWarning.data, contains('llame a soporte'));
      // The raw runner status code never reaches operator copy.
      expect(
        find.textContaining('FISCAL_SEQUENCE_RECOVERY_REQUIRED'),
        findsNothing,
      );
      expect(
        find.byKey(const Key('controlled_sale_fiscal_generic_warning')),
        findsNothing,
      );
      expect(
        find.byKey(const Key('controlled_sale_fiscal_unconfigured_warning')),
        findsNothing,
      );
      // The folio line keeps rendering: it remains the only emitted-number
      // claim of the notice.
      expect(find.byKey(const Key('controlled_sale_folio')), findsOneWidget);

      // Informational only: the refusal is the runner's decision, not the
      // notice's — the phase stays executable so the operator can proceed
      // and get the named refusal state if they choose to.
      final controlledSaleButton = tester.widget<ElevatedButton>(
        find.byKey(const Key('run_controlled_sale_button')),
      );
      expect(controlledSaleButton.onPressed, isNotNull);
    });

    testWidgets(
        'does not name a fiscal number when the cursor row is absent: it '
        'reports the unconfigured consecutive instead of showing (0)',
        (tester) async {
      await pumpThroughPhase1(
        tester,
        loadFiscalSeries: () async => const ActivationFiscalSeriesSnapshot(
          prefix: '001-001-01',
          // No currentNumber: the prefix row exists but the cursor does not.
          cloudHighestSequence: '10',
        ),
      );

      final laggingWarning = tester.widget<Text>(
        find.byKey(const Key('controlled_sale_fiscal_lagging_warning')),
      );
      // The refusal still holds, and the operator is told what is actually
      // wrong rather than being shown a consecutive of zero, which is not a
      // real fiscal number.
      expect(laggingWarning.data, contains('no tiene un consecutivo local'));
      expect(laggingWarning.data, contains('se negará a vender'));
      expect(laggingWarning.data, contains('número 10'));
      expect(laggingWarning.data, isNot(contains('(0)')));
    });

    testWidgets(
        'states the cloud continuation when the series is unconfigured and '
        'the tenant already issued invoices in the cloud', (tester) async {
      await pumpThroughPhase1(
        tester,
        loadFiscalSeries: () async => const ActivationFiscalSeriesSnapshot(
          cloudHighestSequence: '10',
        ),
      );

      final unconfiguredWarning = tester.widget<Text>(
        find.byKey(const Key('controlled_sale_fiscal_unconfigured_warning')),
      );
      expect(
          unconfiguredWarning.data,
          contains('La serie fiscal no está configurada'));
      // Names the cloud maximum and states the continuation from it.
      expect(
        unconfiguredWarning.data,
        contains('continuando desde el máximo ya emitido en la nube (10)'),
      );
      // The single emitted-number claim of this state: the provisioned
      // series starts right after the cloud maximum.
      expect(
        unconfiguredWarning.data,
        contains('esta venta emitirá el número 11'),
      );
      expect(
        unconfiguredWarning.data,
        contains('no usará el número inicial autorizado del cliente'),
      );

      expect(find.byKey(const Key('controlled_sale_folio')), findsNothing);
      expect(
          find.byKey(const Key('controlled_sale_fiscal_lagging_warning')),
          findsNothing);

      final controlledSaleButton = tester.widget<ElevatedButton>(
        find.byKey(const Key('run_controlled_sale_button')),
      );
      expect(controlledSaleButton.onPressed, isNotNull);
    });

    testWidgets(
        'shows neither the lagging-cursor line nor the cloud-continuation '
        'line for a fresh tenant with no cloud history', (tester) async {
      await pumpThroughPhase1(
        tester,
        loadFiscalSeries: () async => const ActivationFiscalSeriesSnapshot(),
      );

      expect(
          find.byKey(const Key('controlled_sale_fiscal_lagging_warning')),
          findsNothing);
      // The fresh-tenant bootstrap warning stays as-is: it must not claim a
      // cloud continuation that does not exist.
      expect(find.textContaining('ya emitido en la nube'), findsNothing);
      expect(
        find.byKey(const Key('controlled_sale_fiscal_unconfigured_warning')),
        findsOneWidget,
      );
    });

    testWidgets(
        'keeps the folio line the only emitted-number claim in the '
        'lagging-cursor case, even when a persisted invoice is ahead of the '
        'cloud maximum (D-18)', (tester) async {
      await pumpThroughPhase1(
        tester,
        loadFiscalSeries: () async => const ActivationFiscalSeriesSnapshot(
          prefix: '001-001-01',
          currentNumber: '5',
          lastInvoiceNumber: '001-001-01-00000012',
          cloudHighestSequence: '10',
        ),
      );

      // The folio line stays the single emitted-number claim: D-18 makes
      // the persisted invoice (12) authoritative, so the next folio is 13 —
      // not the cloud maximum + 1.
      expect(
        find.text('Folio que se emitirá: 001-001-0100000013'),
        findsOneWidget,
      );

      final laggingWarning = tester.widget<Text>(
        find.byKey(const Key('controlled_sale_fiscal_lagging_warning')),
      );
      // The lag text names the state (local 5 behind cloud 10) but never
      // presents a number as the folio that will be emitted — otherwise it
      // would compete with the folio line above.
      expect(laggingWarning.data, contains('(5)'));
      expect(laggingWarning.data, contains('ya emitido en la nube (10)'));
      expect(laggingWarning.data, isNot(contains('Folio')));
      expect(laggingWarning.data, isNot(contains('emitirá')));
      expect(laggingWarning.data, isNot(contains('11')));
    });
  });
}
