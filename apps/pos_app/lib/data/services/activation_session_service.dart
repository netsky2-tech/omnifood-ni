import '../database/app_database.dart';
import '../models/activation/activation_attempt_local_entity.dart';
import 'activation_attempt_discovery_service.dart';
import 'activation_controlled_sale_runner.dart';
import 'activation_pre_offline_runner.dart';
import 'activation_reconnect_sync_runner.dart';

/// Named blocker codes surfaced by [ActivationSessionService.prepare].
class ActivationSessionBlockers {
  /// The attempt's pinned verification product does not exist in the LOCAL
  /// product catalog. The session never fetches or syncs the product: see
  /// [ActivationSessionService.prepare].
  static const String verificationProductMissing =
      'VERIFICATION_PRODUCT_MISSING';

  ActivationSessionBlockers._();
}

/// Result of assembling the activation session in
/// [ActivationSessionService.prepare]. On success it carries the resolved
/// attempt; on failure it carries the named blocker from whichever step
/// failed (discovery or the local verification-product check).
class ActivationSessionPreparationResult {
  /// True when discovery succeeded AND the pinned verification product
  /// exists in the local catalog.
  final bool isSuccess;

  /// The attempt resolved by discovery. Null on any failure: a session whose
  /// prepare failed must never expose an attempt to the phase methods.
  final ActivationAttemptLocalEntity? attempt;

  /// Named blocker code when [isSuccess] is false.
  final String? blockerCode;

  /// Human-readable blocker detail when [isSuccess] is false.
  final String? blockerMessage;

  const ActivationSessionPreparationResult({
    required this.isSuccess,
    this.attempt,
    this.blockerCode,
    this.blockerMessage,
  });
}

/// Named error thrown by the phase methods when [ActivationSessionService.prepare]
/// has not resolved an attempt. The phases refuse instead of running with
/// nulls so a UI cannot drive a runner against an unidentified attempt.
class ActivationSessionNotPreparedException implements Exception {
  /// Stable, machine-readable identifier for this refusal.
  static const String code = 'ATTEMPT_NOT_PREPARED';

  final String message;

  const ActivationSessionNotPreparedException([
    this.message =
        'No se puede iniciar la fase: falta preparar el intento de activación.',
  ]);

  @override
  String toString() =>
      'ActivationSessionNotPreparedException($code): $message';
}

/// Single production entry point that assembles the terminal activation
/// phases in order: discovery/prepare, pre-offline checks, controlled
/// offline sale, and reconnect sync. A UI drives this session instead of
/// reimplementing any of the orchestration.
///
/// Design guarantees:
/// - The runners are injected, never constructed internally, so tests can
///   supply fake collaborators and the session owns no runner logic.
/// - `tenantId`/`attemptId` for every phase come exclusively from the attempt
///   resolved by [prepare]; human identifiers (`authorizedUserId`,
///   `authorizedUserPin`, `cashierUserId`) are passed through to the runners.
/// - The runners' OWN result objects are returned unchanged: no summarised
///   checks, no invented fields, no fabricated outcomes.
/// - The local status machine lives in the runners: a phase that runs out of
///   order is refused by the runner itself and that refusal is surfaced as-is
///   (or as an exception carrying the runner's error) — never duplicated here.
class ActivationSessionService {
  ActivationSessionService({
    required AppDatabase database,
    required ActivationAttemptDiscoveryService discoveryService,
    required ActivationPreOfflineRunner preOfflineRunner,
    required ActivationControlledSaleRunner controlledSaleRunner,
    required ActivationReconnectSyncRunner reconnectSyncRunner,
  })  : _database = database,
        _discovery = discoveryService,
        _preOfflineRunner = preOfflineRunner,
        _controlledSaleRunner = controlledSaleRunner,
        _reconnectSyncRunner = reconnectSyncRunner;

  final AppDatabase _database;
  final ActivationAttemptDiscoveryService _discovery;
  final ActivationPreOfflineRunner _preOfflineRunner;
  final ActivationControlledSaleRunner _controlledSaleRunner;
  final ActivationReconnectSyncRunner _reconnectSyncRunner;

  /// The attempt resolved by the last successful [prepare], or null.
  ActivationAttemptLocalEntity? _attempt;

  /// Resolves the activation attempt for [tenantId] and verifies that the
  /// attempt's pinned verification product exists in the LOCAL catalog.
  ///
  /// NOTE on the verification product: retrieving or syncing the catalog is
  /// the sync engine's responsibility (offline-first: the local catalog is
  /// the source of truth). This session guarantees-or-fails-closed instead:
  /// if the pinned product is absent locally, preparation fails with
  /// [ActivationSessionBlockers.verificationProductMissing] naming the
  /// missing product id, and no phase may run.
  Future<ActivationSessionPreparationResult> prepare({
    required String tenantId,
  }) async {
    final discovery = await _discovery.discoverActiveAttempt(
      tenantId: tenantId,
    );
    if (!discovery.isSuccess || discovery.attempt == null) {
      _attempt = null;
      return ActivationSessionPreparationResult(
        isSuccess: false,
        blockerCode: discovery.blockerCode,
        blockerMessage: discovery.blockerMessage,
      );
    }
    final attempt = discovery.attempt!;
    final productId = attempt.verificationProductId.trim();

    // Local catalog lookup only — the sync engine owns catalog retrieval.
    final product = await _database.productDao.findProductByIdAndTenant(
          productId,
          attempt.tenantId.trim(),
        ) ??
        await _database.productDao.findProductById(productId);

    if (product == null) {
      _attempt = null;
      return ActivationSessionPreparationResult(
        isSuccess: false,
        blockerCode: ActivationSessionBlockers.verificationProductMissing,
        blockerMessage:
            'VERIFICATION_PRODUCT_MISSING: verification product \'$productId\' pinned by attempt '
            '\'${attempt.attemptId}\' was not found in the local catalog. '
            'Sync the product catalog and retry preparation.',
      );
    }

    _attempt = attempt;
    return ActivationSessionPreparationResult(
      isSuccess: true,
      attempt: attempt,
    );
  }

  /// Phase 1: runs the pre-offline checks through the injected runner.
  Future<PreOfflineRunnerSummary> runPreOfflineChecks({
    required String authorizedUserId,
    String? authorizedUserPin,
  }) async {
    final attempt = _requirePreparedAttempt();
    return _preOfflineRunner.runPreOfflineChecks(
      PreOfflineRunnerParams(
        attemptId: attempt.attemptId,
        tenantId: attempt.tenantId,
        authorizedUserId: authorizedUserId,
        authorizedUserPin: authorizedUserPin,
      ),
    );
  }

  /// Phase 2: executes the controlled offline sale through the injected runner.
  Future<ControlledSaleResult> executeControlledOfflineSale({
    required String cashierUserId,
  }) async {
    final attempt = _requirePreparedAttempt();
    return _controlledSaleRunner.executeControlledOfflineSale(
      ControlledSaleParams(
        tenantId: attempt.tenantId,
        attemptId: attempt.attemptId,
        cashierUserId: cashierUserId,
      ),
    );
  }

  /// Phase 3: syncs the activation evidence on reconnect through the injected
  /// runner (the runner replays the persisted checks itself).
  Future<ActivationReconnectSyncResult> syncActivationEvidence() async {
    final attempt = _requirePreparedAttempt();
    return _reconnectSyncRunner.syncActivationEvidence(
      ActivationReconnectSyncParams(
        tenantId: attempt.tenantId,
        attemptId: attempt.attemptId,
      ),
    );
  }

  /// Refuses with a named error when prepare() has not resolved an attempt.
  ActivationAttemptLocalEntity _requirePreparedAttempt() {
    final attempt = _attempt;
    if (attempt == null) {
      throw const ActivationSessionNotPreparedException();
    }
    return attempt;
  }
}
