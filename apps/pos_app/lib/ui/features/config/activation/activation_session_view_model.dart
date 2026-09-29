import 'package:flutter/foundation.dart';

import '../../../../data/models/activation/activation_attempt_local_entity.dart';
import '../../../../data/services/activation_controlled_sale_runner.dart';
import '../../../../data/services/activation_pre_offline_runner.dart';
import '../../../../data/services/activation_reconnect_sync_runner.dart';
import '../../../../data/services/activation_priming_service.dart';
import '../../../../data/services/activation_session_service.dart';
import '../../../../data/ports/activation_priming_port.dart';
import '../../../../domain/models/user.dart';
import '../../../../domain/repositories/auth_repository.dart';

/// The guided activation phases a screen can drive, in execution order.
enum ActivationSessionPhase { preOfflineChecks, controlledOfflineSale, reconnectSync }

/// Thrown by the phase methods when [ActivationSessionViewModel.prepare] has
/// not succeeded yet. The view model refuses to drive any phase against an
/// unidentified attempt instead of forwarding nulls to the service.
class ActivationPhaseNotPreparedException extends StateError {
  ActivationPhaseNotPreparedException(ActivationSessionPhase phase)
      : super(
          'No se puede iniciar esta fase de activación antes de completar '
          'la anterior.',
        );
}

/// View model for the guided terminal-activation screen.
///
/// This is a thin driver over [ActivationSessionService]: it resolves the
/// logged-in user (id and tenant) from [AuthRepository.getCurrentUser] — the
/// same production source `SaleViewModel` uses — and forwards the human
/// inputs (the authorized PIN) to the session. The runners and the session
/// keep their own status machines and refusals; this view model never
/// reimplements them.
///
/// Guarantees:
/// - Phase results are exposed EXACTLY as the service returned them: no
///   recomputed checks, no summarised statuses, no fabricated outcomes.
/// - A later phase is never CLAIMED successful when an earlier phase failed
///   (see `controlledSaleSucceeded` / `reconnectSyncSucceeded`), even though
///   each result object itself is surfaced verbatim.
/// - Credentials (the authorized PIN) are held only for the duration of the
///   phase call: they are parameters, never fields, and are never logged,
///   exposed or persisted.
/// - Offline-first: nothing here requires connectivity except the phases
///   that inherently do (discovery and reconnect sync live inside the
///   session/runners).
class ActivationSessionViewModel extends ChangeNotifier {
  ActivationSessionViewModel({
    required ActivationSessionService sessionService,
    required ActivationPrimingService primingService,
    required AuthRepository authRepository,
  })  : _sessionService = sessionService,
        _primingService = primingService,
        _authRepository = authRepository;

  final ActivationSessionService _sessionService;
  final ActivationPrimingService _primingService;
  final AuthRepository _authRepository;

  bool _isPrepared = false;
  ActivationAttemptLocalEntity? _attempt;
  String? _blockerCode;
  String? _blockerMessage;
  String? _errorMessage;
  final Set<ActivationSessionPhase> _loadingPhases = {};
  PreOfflineRunnerSummary? _preOfflineChecksResult;
  ControlledSaleResult? _controlledSaleResult;
  ActivationReconnectSyncResult? _reconnectSyncResult;
  bool? _preOfflineChecksSucceeded;
  bool? _controlledSaleSucceeded;
  bool? _reconnectSyncSucceeded;

  /// Whether prepare() resolved an attempt successfully.
  bool get isPrepared => _isPrepared;

  /// The attempt resolved by the last successful prepare(), or null.
  ActivationAttemptLocalEntity? get attempt => _attempt;

  /// Named blocker code when prepare() failed. Distinct from the human
  /// message because the screen renders codes and messages differently.
  String? get blockerCode => _blockerCode;

  /// Human-readable blocker detail when prepare() failed.
  String? get blockerMessage => _blockerMessage;

  /// Error surfaced by a failed phase invocation (runner blockers or the
  /// service's own exception text, surfaced verbatim).
  String? get errorMessage => _errorMessage;

  /// Translates raw runner errors to operator-friendly Spanish.
  /// Raw messages carry envelope UUIDs and snake_case event types that
  /// must never reach the UI (NHILOS §39.4).
  static String friendlyError(List<String> rawErrors) {
    final friendly = <String>[];
    for (final e in rawErrors) {
      if (e.contains('Delivery unacknowledged') ||
          e.contains('delivery unacknowledged')) {
        friendly.add(
          'No se pudo confirmar la entrega de un evento de activación al servidor. '
          'Verifique su conexión e intente de nuevo.',
        );
      } else if (e.contains('Error delivering envelope')) {
        friendly.add(
          'Error al enviar evidencia de activación al servidor. '
          'Verifique su conexión e intente de nuevo.',
        );
      } else if (e.contains('replay unacknowledged')) {
        friendly.add(
          'Una verificación previa no fue reconocida por el servidor. '
          'Reintente la fase.',
        );
      } else if (e.contains('POST_RECONNECT_SYNC')) {
        friendly.add(
          'La sincronización posterior a la reconexión falló. '
          'Verifique su conexión e intente de nuevo.',
        );
      } else if (e.contains('SALE_RECEIPT_PATH_FAILED')) {
        friendly.add(
          'No se pudo imprimir el comprobante de la venta de verificación. '
          'Revise la impresora e intente de nuevo.',
        );
      } else if (e.contains('Error de comunicación con el servidor')) {
        friendly.add(e);
      } else if (e.contains('ATTEMPT_NOT_READY_FOR_CHECKS') ||
          e.contains('ATTEMPT_NOT_PREPARED') ||
          e.contains('NO_ACTIVE_ATTEMPT') ||
          e.contains('ATTEMPT_NOT_IN_RUNNING') ||
          e.contains('ATTEMPT_NOT_READY_FOR_SYNC')) {
        friendly.add(
          'El intento de activación no está en el estado correcto para esta fase. '
          'Reinicie el proceso desde el dashboard.',
        );
      } else {
        // NHILOS §39.4: never expose raw backend error text to the operator.
        // Unknown codes get a generic message; the raw text stays in logs.
        // ignore: avoid_print
        print('[FriendlyError] Unmapped raw error: $e');
        friendly.add(
          'Ocurrió un error inesperado durante la activación. '
          'Revise la conexión e intente de nuevo.',
        );
      }
    }
    return friendly.join('\n');
  }

  /// Result of the pre-offline checks phase, exactly as the service
  /// returned it. Null until the phase has run.
  PreOfflineRunnerSummary? get preOfflineChecksResult =>
      _preOfflineChecksResult;

  /// Result of the controlled offline sale phase, exactly as the service
  /// returned it. Null until the phase has run.
  ControlledSaleResult? get controlledSaleResult => _controlledSaleResult;

  /// Result of the reconnect sync phase, exactly as the service returned
  /// it. Null until the phase has run.
  ActivationReconnectSyncResult? get reconnectSyncResult =>
      _reconnectSyncResult;

  /// Whether the pre-offline checks phase succeeded. Null = not run yet.
  bool? get preOfflineChecksSucceeded => _preOfflineChecksSucceeded;

  /// Whether the controlled offline sale phase succeeded. A phase only
  /// claims success when its own result succeeded AND every earlier phase
  /// succeeded. Null = not run yet.
  bool? get controlledSaleSucceeded => _controlledSaleSucceeded;

  /// Whether the reconnect sync phase succeeded (same ordering rule).
  /// Null = not run yet.
  bool? get reconnectSyncSucceeded => _reconnectSyncSucceeded;

  /// Whether the given phase is currently running (per-phase loading flag).
  bool isPhaseLoading(ActivationSessionPhase phase) =>
      _loadingPhases.contains(phase);

  /// Resolves the activation attempt using the tenant of the currently
  /// logged-in user. Fails closed with a named blocker when no valid
  /// session user is available.
  ///
  /// L1-10c: BEFORE the session's prepare(), the terminal is primed with its
  /// tenant's catalog and fiscal projection over the human-authenticated
  /// path (the same trust level as the activation discovery call). A priming
  /// failure is a distinct, named blocker and PREVENTS prepare() from
  /// running: a half-primed terminal must never reach the activation
  /// lifecycle, whose checks pin local catalog and fiscal revisions.
  Future<void> prepare() async {
    _isPrepared = false;
    _attempt = null;
    _blockerCode = null;
    _blockerMessage = null;
    _errorMessage = null;
    notifyListeners();

    final user = await _authRepository.getCurrentUser();
    final tenantId = user?.tenantId?.trim() ?? '';
    if (user == null || tenantId.isEmpty) {
      _blockerCode = 'SESSION_USER_UNRESOLVED';
      _blockerMessage =
          'No hay una sesión de usuario válida con tenant asignado. Inicie sesión e intente nuevamente.';
      notifyListeners();
      return;
    }

    try {
      await _primingService.primeTerminal();
    } on TerminalPrimingPayloadException catch (error) {
      _blockerCode = error.code;
      _blockerMessage =
          'No se pudo preparar el terminal antes de la activación: la respuesta '
          'de priming no es utilizable. Detalle: ${error.message}';
      notifyListeners();
      return;
    } catch (error) {
      _blockerCode = 'TERMINAL_PRIMING_FAILED';
      _blockerMessage =
          'No se pudo descargar los datos iniciales del terminal (catálogo y '
          'proyección fiscal) antes de la activación. Verifique la conexión e '
          'intente nuevamente. Detalle: $error';
      notifyListeners();
      return;
    }

    final result = await _sessionService.prepare(tenantId: tenantId);

    // If discovery returned a fresh/unstarted attempt but a completed attempt
    // already exists locally, prefer the completed one so the UI shows the
    // completion screen instead of re-offering phases that already finished.
    var attempt = result.attempt;
    var attemptIsSuccess = result.isSuccess;
    var attemptBlockerCode = result.blockerCode;
    var attemptBlockerMessage = result.blockerMessage;
    if (attempt != null &&
        (attempt.localStatus == 'ASSIGNED' || attempt.localStatus == 'RUNNING')) {
      final completed = await _sessionService
          .getCompletedAttempt(tenantId);
      if (completed != null &&
          (completed.localStatus == 'ACTIVATED' ||
              completed.localStatus == 'ACTIVATED_WITH_WARNING')) {
        attempt = completed;
      }
    }

    _isPrepared = attemptIsSuccess && attempt != null;
    _attempt = attempt;
    _blockerCode = attemptBlockerCode;
    _blockerMessage = attemptBlockerMessage;

    // Restore phase gates from the attempt's persisted status so a resumed
    // activation (app restart, page re-entry) doesn't re-require phases that
    // already completed. Without this, preOfflineChecksSucceeded and
    // controlledSaleSucceeded stay null and every button stays disabled.
    final status = result.attempt?.localStatus;
    if (status != null) {
      const phase2Plus = {
        'LOCAL_ACTIVATION_EVIDENCE_COMPLETE',
        'SYNC_VERIFICATION_PENDING',
        'EVIDENCE_ACKED',
        'ACTIVATED',
        'ACTIVATED_WITH_WARNING',
      };
      const phase1Plus = {
        ...phase2Plus,
        'RUNNING',
      };
      if (phase1Plus.contains(status)) {
        _preOfflineChecksSucceeded = true;
      }
      if (phase2Plus.contains(status)) {
        _controlledSaleSucceeded = true;
      }
      // R3-001/R4-001: statuses at or past EVIDENCE_ACKED prove the
      // reconnect-sync phase already succeeded on a prior run. Restoring
      // this gate prevents a resumed activation from deadlocking on a
      // phase that is already complete.
      const syncComplete = {
        'EVIDENCE_ACKED',
        'ACTIVATED',
        'ACTIVATED_WITH_WARNING',
      };
      if (syncComplete.contains(status)) {
        _reconnectSyncSucceeded = _controlledSaleSucceeded ?? false;
      }
    }

    notifyListeners();
  }

  /// Phase 1: runs the pre-offline checks. The PIN comes from the human and
  /// is forwarded only as a call parameter; the authorized user id comes
  /// from the logged-in user, never from the screen.
  Future<void> runPreOfflineChecks({
    required String authorizedUserPin,
  }) async {
    await _runPhase(ActivationSessionPhase.preOfflineChecks, () async {
      final user = await _requireCurrentUser();
      final summary = await _sessionService.runPreOfflineChecks(
        authorizedUserId: user.id.trim(),
        authorizedUserPin: authorizedUserPin,
      );
      _preOfflineChecksResult = summary;
      _preOfflineChecksSucceeded = summary.isReadyForOffline;
      if (!summary.isReadyForOffline) {
        _errorMessage = friendlyError(summary.blockers);
      }
    });
  }

  /// Phase 2: executes the controlled offline sale. The cashier id comes
  /// from the logged-in user.
  Future<void> executeControlledOfflineSale() async {
    await _runPhase(ActivationSessionPhase.controlledOfflineSale, () async {
      final user = await _requireCurrentUser();
      final result = await _sessionService.executeControlledOfflineSale(
        cashierUserId: user.id.trim(),
      );
      _controlledSaleResult = result;
      _controlledSaleSucceeded =
          result.isSuccess && (_preOfflineChecksSucceeded ?? false);
      if (!result.isSuccess) {
        _errorMessage = friendlyError(result.errors);
      }
    });
  }

  /// Phase 3: syncs the activation evidence on reconnect.
  Future<void> syncActivationEvidence() async {
    await _runPhase(ActivationSessionPhase.reconnectSync, () async {
      final result = await _sessionService.syncActivationEvidence();
      _reconnectSyncResult = result;
      _reconnectSyncSucceeded =
          result.isSuccess && (_controlledSaleSucceeded ?? false);
      if (!result.isSuccess) {
        _errorMessage = friendlyError(result.errors);
      }
    });
  }

  Future<User> _requireCurrentUser() async {
    final user = await _authRepository.getCurrentUser();
    if (user == null || user.id.trim().isEmpty) {
      throw StateError(
        'No hay una sesión de usuario válida para ejecutar la fase de activación.',
      );
    }
    return user;
  }

  Future<void> _runPhase(
    ActivationSessionPhase phase,
    Future<void> Function() run,
  ) async {
    if (!_isPrepared) {
      throw ActivationPhaseNotPreparedException(phase);
    }
    _loadingPhases.add(phase);
    _errorMessage = null;
    notifyListeners();
    try {
      await run();
    } catch (error) {
      // Surface the service's own refusal/error verbatim; never swallow it
      // and never fabricate a phase result.
      _errorMessage = error.toString();
      notifyListeners();
    } finally {
      _loadingPhases.remove(phase);
      notifyListeners();
    }
  }
}
