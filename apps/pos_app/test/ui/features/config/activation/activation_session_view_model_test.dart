import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:pos_app/data/models/activation/activation_attempt_local_entity.dart';
import 'package:pos_app/data/models/activation/activation_check_result_local_entity.dart';
import 'package:pos_app/data/ports/activation_priming_port.dart';
import 'package:pos_app/data/services/activation_controlled_sale_runner.dart';
import 'package:pos_app/data/services/activation_pre_offline_runner.dart';
import 'package:pos_app/data/services/activation_priming_service.dart';
import 'package:pos_app/data/services/activation_reconnect_sync_runner.dart';
import 'package:pos_app/data/services/activation_session_service.dart';
import 'package:pos_app/data/services/fiscal_inbox_handler.dart';
import 'package:pos_app/domain/models/user.dart';
import 'package:pos_app/domain/repositories/auth_repository.dart';
import 'package:pos_app/ui/features/config/activation/activation_session_view_model.dart';

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

ActivationCheckResultLocalEntity _checkEntity(String status) =>
    ActivationCheckResultLocalEntity(
      id: 'check-${status.toLowerCase()}-1',
      tenantId: 'tenant-1',
      activationAttemptId: 'attempt-1',
      checkCode: 'TERMINAL_LINKED',
      status: status,
      evidenceType: 'DEVICE_IDENTITY_PROOF',
      evidenceRef: 'terminal-1',
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

  void stubSuccessfulSession() {
    when(() => sessionService.prepare(tenantId: 'tenant-1')).thenAnswer(
      (_) async => ActivationSessionPreparationResult(
        isSuccess: true,
        attempt: _attemptEntity(),
      ),
    );
    when(() => sessionService.runPreOfflineChecks(
          authorizedUserId: any(named: 'authorizedUserId'),
          authorizedUserPin: any(named: 'authorizedUserPin'),
        )).thenAnswer(
      (_) async => PreOfflineRunnerSummary(
        isReadyForOffline: true,
        checks: {'TERMINAL_LINKED': _checkEntity('PASS')},
      ),
    );
    when(() => sessionService.executeControlledOfflineSale(
          cashierUserId: any(named: 'cashierUserId'),
        )).thenAnswer(
      (_) async => const ControlledSaleResult(
        isSuccess: true,
        attemptStatus: 'RUNNING',
      ),
    );
    when(() => sessionService.syncActivationEvidence()).thenAnswer(
      (_) async => const ActivationReconnectSyncResult(
        isSuccess: true,
        attemptStatus: 'EVIDENCE_ACKED',
      ),
    );
  }

  setUpAll(() {
    registerFallbackValue(
      const PreOfflineRunnerParams(
        attemptId: 'fallback',
        tenantId: 'fallback',
        authorizedUserId: 'fallback',
      ),
    );
  });

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

  group('prepare', () {
    test('uses the tenant of the currently logged-in user and exposes the '
        'resolved attempt on success', () async {
      stubSuccessfulSession();

      await viewModel.prepare();

      verify(() => sessionService.prepare(tenantId: 'tenant-1')).called(1);
      expect(viewModel.isPrepared, isTrue);
      expect(viewModel.attempt?.attemptId, 'attempt-1');
      expect(viewModel.blockerCode, isNull);
      expect(viewModel.blockerMessage, isNull);
    });

    test('failure surfaces the blocker code and the human message and leaves '
        'the phases not invocable', () async {
      when(() => sessionService.prepare(tenantId: 'tenant-1')).thenAnswer(
        (_) async => const ActivationSessionPreparationResult(
          isSuccess: false,
          blockerCode: 'NO_ACTIVE_ATTEMPT',
          blockerMessage: 'El backend no reporta intento activo',
        ),
      );

      await viewModel.prepare();

      expect(viewModel.isPrepared, isFalse);
      expect(viewModel.attempt, isNull);
      expect(viewModel.blockerCode, 'NO_ACTIVE_ATTEMPT');
      expect(viewModel.blockerMessage, 'El backend no reporta intento activo');

      await expectLater(
        viewModel.runPreOfflineChecks(authorizedUserPin: '4321'),
        throwsStateError,
      );
      await expectLater(
        viewModel.executeControlledOfflineSale(),
        throwsStateError,
      );
      await expectLater(
        viewModel.syncActivationEvidence(),
        throwsStateError,
      );
      verifyNever(() => sessionService.runPreOfflineChecks(
            authorizedUserId: any(named: 'authorizedUserId'),
            authorizedUserPin: any(named: 'authorizedUserPin'),
          ));
      verifyNever(() =>
          sessionService.executeControlledOfflineSale(
            cashierUserId: any(named: 'cashierUserId'),
          ));
      verifyNever(() => sessionService.syncActivationEvidence());
    });

    test('primes the terminal before prepare, in that order', () async {
      stubSuccessfulSession();

      await viewModel.prepare();

      verifyInOrder([
        () => primingService.primeTerminal(),
        () => sessionService.prepare(tenantId: 'tenant-1'),
      ]);
      expect(viewModel.isPrepared, isTrue);
      expect(viewModel.blockerCode, isNull);
    });

    test('a malformed priming payload surfaces its own named blocker and '
        'prepare() is never called', () async {
      when(() => primingService.primeTerminal()).thenThrow(
        const TerminalPrimingPayloadException(
          'TERMINAL_PRIMING_PAYLOAD_MALFORMED',
          'Server returned a non-object terminal priming payload',
        ),
      );

      await viewModel.prepare();

      expect(viewModel.isPrepared, isFalse);
      expect(viewModel.attempt, isNull);
      expect(viewModel.blockerCode, 'TERMINAL_PRIMING_PAYLOAD_MALFORMED');
      expect(viewModel.blockerMessage, isNotEmpty);
      verifyNever(() => sessionService.prepare(
            tenantId: any(named: 'tenantId'),
          ));

      await expectLater(
        viewModel.runPreOfflineChecks(authorizedUserPin: '4321'),
        throwsStateError,
      );
    });

    test('a priming transport failure surfaces a distinct named blocker and '
        'prepare() is never called', () async {
      when(() => primingService.primeTerminal()).thenThrow(
        StateError('DioException: connection refused'),
      );

      await viewModel.prepare();

      expect(viewModel.isPrepared, isFalse);
      expect(viewModel.attempt, isNull);
      expect(viewModel.blockerCode, 'TERMINAL_PRIMING_FAILED');
      expect(viewModel.blockerMessage, isNotEmpty);
      verifyNever(() => sessionService.prepare(
            tenantId: any(named: 'tenantId'),
          ));
    });

    test('priming is not run when the logged-in user cannot be resolved',
        () async {
      when(() => authRepository.getCurrentUser()).thenAnswer(
        (_) async => null,
      );

      await viewModel.prepare();

      expect(viewModel.isPrepared, isFalse);
      expect(viewModel.blockerCode, 'SESSION_USER_UNRESOLVED');
      verifyNever(() => primingService.primeTerminal());
      verifyNever(() => sessionService.prepare(
            tenantId: any(named: 'tenantId'),
          ));
    });

    test('a logged-in user without a tenant fails preparation closed',
        () async {
      when(() => authRepository.getCurrentUser()).thenAnswer(
        (_) async => const User(
          id: 'user-1',
          name: 'Operador',
          role: UserRole.cashier,
          isActive: true,
        ),
      );

      await viewModel.prepare();

      expect(viewModel.isPrepared, isFalse);
      expect(viewModel.blockerCode, 'SESSION_USER_UNRESOLVED');
      verifyNever(() => primingService.primeTerminal());
      verifyNever(() => sessionService.prepare(
            tenantId: any(named: 'tenantId'),
          ));
    });
  });

  group('runPreOfflineChecks', () {
    test('passes the human-supplied PIN and the logged-in user id to the '
        'service and does not retain the PIN afterwards', () async {
      stubSuccessfulSession();
      await viewModel.prepare();

      await viewModel.runPreOfflineChecks(authorizedUserPin: '4321');

      final captured = verify(() => sessionService.runPreOfflineChecks(
            authorizedUserId: captureAny(named: 'authorizedUserId'),
            authorizedUserPin: captureAny(named: 'authorizedUserPin'),
          )).captured;
      expect(captured[0], 'user-1');
      expect(captured[1], '4321');

      // The PIN must not survive the call in any state the view model
      // exposes to the screen (blockers, error message, attempt, results).
      final exposedState = [
        viewModel.blockerCode,
        viewModel.blockerMessage,
        viewModel.errorMessage,
        viewModel.attempt.toString(),
        viewModel.preOfflineChecksResult.toString(),
        viewModel.toString(),
      ];
      for (final value in exposedState) {
        expect(value, isNot(contains('4321')));
      }
    });

    test('returns the summary object exactly as the service returned it',
        () async {
      stubSuccessfulSession();
      await viewModel.prepare();
      final summary = PreOfflineRunnerSummary(
        isReadyForOffline: true,
        checks: {'TERMINAL_LINKED': _checkEntity('PASS')},
      );
      when(() => sessionService.runPreOfflineChecks(
            authorizedUserId: any(named: 'authorizedUserId'),
            authorizedUserPin: any(named: 'authorizedUserPin'),
          )).thenAnswer((_) async => summary);

      await viewModel.runPreOfflineChecks(authorizedUserPin: '4321');

      expect(identical(viewModel.preOfflineChecksResult, summary), isTrue);
      expect(viewModel.preOfflineChecksSucceeded, isTrue);
    });
  });

  group('phase result exposure', () {
    test('every phase exposes the service\'s own result object unchanged',
        () async {
      stubSuccessfulSession();
      await viewModel.prepare();
      final saleResult = const ControlledSaleResult(
        isSuccess: true,
        attemptStatus: 'RUNNING',
        verificationTicketId: 'ticket-1',
      );
      final syncResult = const ActivationReconnectSyncResult(
        isSuccess: true,
        attemptStatus: 'EVIDENCE_ACKED',
        syncedEnvelopesCount: 3,
      );
      when(() => sessionService.executeControlledOfflineSale(
            cashierUserId: 'user-1',
          )).thenAnswer((_) async => saleResult);
      when(() => sessionService.syncActivationEvidence())
          .thenAnswer((_) async => syncResult);

      await viewModel.runPreOfflineChecks(authorizedUserPin: '4321');
      await viewModel.executeControlledOfflineSale();
      await viewModel.syncActivationEvidence();

      expect(viewModel.preOfflineChecksSucceeded, isTrue);
      expect(viewModel.controlledSaleSucceeded, isTrue);
      expect(viewModel.reconnectSyncSucceeded, isTrue);
      expect(viewModel.controlledSaleResult?.verificationTicketId, 'ticket-1');
      expect(viewModel.reconnectSyncResult?.syncedEnvelopesCount, 3);
    });

    test('a failed phase prevents the next one from being reported as '
        'successful, while every result object stays verbatim', () async {
      when(() => sessionService.prepare(tenantId: 'tenant-1')).thenAnswer(
        (_) async => ActivationSessionPreparationResult(
          isSuccess: true,
          attempt: _attemptEntity(),
        ),
      );
      when(() => sessionService.runPreOfflineChecks(
            authorizedUserId: any(named: 'authorizedUserId'),
            authorizedUserPin: any(named: 'authorizedUserPin'),
          )).thenAnswer(
        (_) async => PreOfflineRunnerSummary(
          isReadyForOffline: false,
          checks: {'TERMINAL_LINKED': _checkEntity('FAIL')},
          blockers: ['AUTHORIZED_USER_LOCAL_FAILED: PIN inválido'],
        ),
      );
      // The service would still answer the next phase (its own refusal logic
      // is exercised elsewhere); the view model must not CLAIM success for a
      // phase that follows a failed one.
      const saleResult = ControlledSaleResult(
        isSuccess: true,
        attemptStatus: 'RUNNING',
      );
      when(() => sessionService.executeControlledOfflineSale(
            cashierUserId: any(named: 'cashierUserId'),
          )).thenAnswer((_) async => saleResult);

      await viewModel.prepare();
      await viewModel.runPreOfflineChecks(authorizedUserPin: '4321');
      await viewModel.executeControlledOfflineSale();

      expect(viewModel.preOfflineChecksResult?.isReadyForOffline, isFalse);
      expect(viewModel.preOfflineChecksSucceeded, isFalse);
      expect(
        identical(viewModel.controlledSaleResult, saleResult),
        isTrue,
      );
      expect(viewModel.controlledSaleSucceeded, isFalse);
      expect(viewModel.reconnectSyncSucceeded, isNot(equals(true)));
    });

    test('a service exception during a phase is surfaced verbatim and no '
        'phase result is fabricated', () async {
      stubSuccessfulSession();
      await viewModel.prepare();
      when(() => sessionService.runPreOfflineChecks(
            authorizedUserId: any(named: 'authorizedUserId'),
            authorizedUserPin: any(named: 'authorizedUserPin'),
          )).thenThrow(const ActivationSessionNotPreparedException());

      await viewModel.runPreOfflineChecks(authorizedUserPin: '4321');

      expect(viewModel.preOfflineChecksResult, isNull);
      expect(viewModel.preOfflineChecksSucceeded, isNull);
      expect(
        viewModel.errorMessage,
        contains(ActivationSessionNotPreparedException.code),
      );
    });
  });

  group('loading flags', () {
    test('each phase reports its own loading state while running', () async {
      stubSuccessfulSession();
      await viewModel.prepare();

      final checks = Completer<PreOfflineRunnerSummary>();
      when(() => sessionService.runPreOfflineChecks(
            authorizedUserId: any(named: 'authorizedUserId'),
            authorizedUserPin: any(named: 'authorizedUserPin'),
          )).thenAnswer((_) => checks.future);

      final pending = viewModel.runPreOfflineChecks(authorizedUserPin: '4321');
      expect(
        viewModel.isPhaseLoading(ActivationSessionPhase.preOfflineChecks),
        isTrue,
      );
      expect(
        viewModel.isPhaseLoading(ActivationSessionPhase.controlledOfflineSale),
        isFalse,
      );

      checks.complete(PreOfflineRunnerSummary(
        isReadyForOffline: true,
        checks: const {},
      ));
      await pending;

      expect(
        viewModel.isPhaseLoading(ActivationSessionPhase.preOfflineChecks),
        isFalse,
      );
    });
  });
}
