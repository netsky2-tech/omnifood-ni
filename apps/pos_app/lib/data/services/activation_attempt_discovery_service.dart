import 'package:dio/dio.dart';

import '../../domain/models/activation/activation_attempt_snapshot.dart';
import '../adapters/activation/dio_activation_sync_port.dart';
import '../database/app_database.dart';
import '../models/activation/activation_attempt_local_entity.dart';
import '../ports/activation_sync_port.dart';
import 'activation_clock_manager.dart';
import 'terminal_identity_service.dart';

/// Named blocker codes surfaced by [ActivationAttemptDiscoveryService].
class ActivationAttemptDiscoveryBlockers {
  /// The backend reports no active activation attempt for the tenant.
  static const String noActiveAttempt = 'NO_ACTIVE_ATTEMPT';

  /// The candidate terminal registered in the back office is not this terminal.
  static const String terminalMismatch = 'TERMINAL_MISMATCH';

  /// The active attempt returned by the backend belongs to another tenant.
  static const String tenantMismatch = 'TENANT_MISMATCH';

  /// The backend could not be reached to resolve the active attempt.
  static const String activeAttemptFetchFailed = 'ACTIVE_ATTEMPT_FETCH_FAILED';

  /// The backend responded, but the active-attempt payload was unusable
  /// (malformed body, missing identity/pinned field, invalid server anchor).
  static const String activeAttemptPayloadInvalid =
      'ACTIVE_ATTEMPT_PAYLOAD_INVALID';
}

class ActivationAttemptDiscoveryResult {
  /// True when an attempt was resolved (locally or from the backend).
  final bool isSuccess;

  /// True when the attempt came from the persisted local row instead of the
  /// backend (restart-safe resolution, no re-fetch and no rewrite).
  final bool resolvedFromLocal;

  /// Named blocker code when [isSuccess] is false.
  final String? blockerCode;

  /// Human-readable blocker detail when [isSuccess] is false.
  final String? blockerMessage;

  final ActivationAttemptLocalEntity? attempt;

  const ActivationAttemptDiscoveryResult({
    required this.isSuccess,
    this.resolvedFromLocal = false,
    this.blockerCode,
    this.blockerMessage,
    this.attempt,
  });
}

/// Discovers the activation attempt the back office currently has active and
/// persists it into `activation_attempts_local` so the local runners can execute.
///
/// Guarantees:
/// - Restart-safe resolution: a local attempt that is genuinely in progress is
///   preferred; the backend is reconciled whenever the only local row is
///   finished or terminal (e.g. FAILED, ACTIVATED), so a newly created back
///   office attempt is never blocked by a stale local row.
/// - Local progress is never clobbered: a row for the same attempt is left
///   intact; insertion happens only when the row is absent.
/// - Fail closed on mismatch: the snapshot's tenant and candidate terminal are
///   compared against the requested tenant and this device's canonical identity
///   before persisting. The terminal-mismatch guard is never skipped, not even
///   when the attempt resolves from a local row.
/// - Fail closed on unusable payloads: malformed or incomplete backend payloads
///   map to named blockers and persist nothing; local time is never substituted
///   for the backend's server time anchor.
/// - Time anchors: `serverTimeAnchorAt` is the backend's server_time_anchor_at
///   value from the response; `anchorMonotonicTicks` is a local monotonic
///   reading taken at discovery (monotonic ticks are device-relative by
///   definition and can never come from the server). Both use the same
///   boot-session and clock conventions the runners consume
///   (`anchor-<attemptId>`).
class ActivationAttemptDiscoveryService {
  ActivationAttemptDiscoveryService({
    required AppDatabase database,
    required ActivationSyncPort syncPort,
    required TerminalIdentityService terminalIdentityService,
    ActivationClockManager? clockManager,
    DateTime Function()? nowProvider,
    int Function()? monotonicTicksProvider,
  })  : _database = database,
        _syncPort = syncPort,
        _terminalIdentity = terminalIdentityService,
        _clock = clockManager ?? ActivationClockManager.instance,
        _nowProvider = nowProvider,
        _monotonicTicksProvider = monotonicTicksProvider;

  final AppDatabase _database;
  final ActivationSyncPort _syncPort;
  final TerminalIdentityService _terminalIdentity;
  final ActivationClockManager _clock;
  final DateTime Function()? _nowProvider;
  final int Function()? _monotonicTicksProvider;

  DateTime _resolveNow() => _nowProvider?.call() ?? DateTime.now().toUtc();

  int _resolveMonotonicTicks() =>
      _monotonicTicksProvider?.call() ?? _clock.currentMonotonicMicroseconds;

  /// Local statuses that mean the attempt is genuinely in progress on this
  /// device. Everything else (ACTIVATED, ACTIVATED_WITH_WARNING, FAILED, ...)
  /// is a finished/terminal row that must never block a newly created back
  /// office attempt. Unknown statuses are treated as not in progress so the
  /// backend is always reconciled (fail closed).
  static const _genuinelyInProgressStatuses = {
    'ASSIGNED',
    'RUNNING',
    'LOCAL_ACTIVATION_EVIDENCE_COMPLETE',
    'SYNC_VERIFICATION_PENDING',
  };

  Future<ActivationAttemptDiscoveryResult> discoverActiveAttempt({
    required String tenantId,
  }) async {
    final trimmedTenantId = tenantId.trim();

    // 1. Restart-safe resolution: prefer a local attempt that is genuinely in
    // progress. A terminal or finished local row must not block a newly
    // created attempt, so anything else falls through to backend reconcile.
    final localActive =
        await _database.activationAttemptLocalDao.getActiveAttempt(trimmedTenantId);
    if (localActive != null &&
        _genuinelyInProgressStatuses.contains(localActive.localStatus)) {
      // The terminal-mismatch guard is never skipped, even on the local path:
      // a re-provisioned device identity must not silently resume another
      // terminal's attempt.
      final localDeviceId = (await _terminalIdentity.resolveDeviceId()).trim();
      if (localActive.candidateTerminalId.trim() != localDeviceId) {
        return ActivationAttemptDiscoveryResult(
          isSuccess: false,
          blockerCode: ActivationAttemptDiscoveryBlockers.terminalMismatch,
          blockerMessage:
              'TERMINAL_MISMATCH: the terminal registered in the back office (${localActive.candidateTerminalId.trim()}) is not this terminal ($localDeviceId)',
        );
      }
      return ActivationAttemptDiscoveryResult(
        isSuccess: true,
        resolvedFromLocal: true,
        attempt: localActive,
      );
    }

    // 2. Reconcile with the backend: no local attempt, or the only local row
    // is finished/terminal and must not hide a newly created attempt.
    final ActivationAttemptSnapshot? snapshot;
    try {
      snapshot = await _syncPort.fetchActiveAttempt();
    } on DioException catch (e) {
      return ActivationAttemptDiscoveryResult(
        isSuccess: false,
        blockerCode: ActivationAttemptDiscoveryBlockers.activeAttemptFetchFailed,
        blockerMessage:
            'Active activation attempt could not be fetched from the backend: $e',
      );
    } on ActivationAttemptPayloadException catch (e) {
      // Distinct from NO_ACTIVE_ATTEMPT: the backend answered but the payload
      // was unusable. Nothing is persisted.
      return ActivationAttemptDiscoveryResult(
        isSuccess: false,
        blockerCode: ActivationAttemptDiscoveryBlockers.activeAttemptPayloadInvalid,
        blockerMessage: 'Active activation attempt payload is unusable: $e',
      );
    }

    if (snapshot == null) {
      return ActivationAttemptDiscoveryResult(
        isSuccess: false,
        blockerCode: ActivationAttemptDiscoveryBlockers.noActiveAttempt,
        blockerMessage:
            "The backend reports no active activation attempt for tenant '$trimmedTenantId'",
      );
    }

    // 3. Fail closed on a tenant mismatch: the snapshot must belong to the
    // tenant discovery was asked about.
    if (snapshot.tenantId.trim() != trimmedTenantId) {
      return ActivationAttemptDiscoveryResult(
        isSuccess: false,
        blockerCode: ActivationAttemptDiscoveryBlockers.tenantMismatch,
        blockerMessage:
            'TENANT_MISMATCH: the active attempt belongs to tenant (${snapshot.tenantId.trim()}), not the requested tenant ($trimmedTenantId)',
      );
    }

    // 4. Fail closed on a terminal mismatch: never enroll the wrong device.
    final resolvedTerminalId =
        (await _terminalIdentity.resolveDeviceId()).trim();
    final registeredTerminalId = snapshot.candidateTerminalId.trim();
    if (registeredTerminalId != resolvedTerminalId) {
      return ActivationAttemptDiscoveryResult(
        isSuccess: false,
        blockerCode: ActivationAttemptDiscoveryBlockers.terminalMismatch,
        blockerMessage:
            'TERMINAL_MISMATCH: the terminal registered in the back office ($registeredTerminalId) is not this terminal ($resolvedTerminalId)',
      );
    }

    // 5. Never clobber local progress: leave an existing row for the same
    // attempt intact (it may be in a locally advanced or terminal status).
    final existing =
        await _database.activationAttemptLocalDao.getAttemptById(snapshot.attemptId.trim());
    if (existing != null) {
      return ActivationAttemptDiscoveryResult(
        isSuccess: true,
        resolvedFromLocal: true,
        attempt: existing,
      );
    }

    // 6. Persist the freshly discovered attempt anchored to the backend's
    // server time. The server anchor comes from the response — local time is
    // never substituted. anchorMonotonicTicks, in contrast, is deliberately a
    // LOCAL monotonic reading taken at discovery: monotonic ticks are
    // device-relative by definition and can never come from the server.
    final serverAnchorAt = DateTime.tryParse(snapshot.serverTimeAnchorAt.trim());
    if (serverAnchorAt == null) {
      // Defensive: the sync port already validates and guarantees a parseable
      // anchor. Fail closed instead of ever anchoring to local time.
      return ActivationAttemptDiscoveryResult(
        isSuccess: false,
        blockerCode: ActivationAttemptDiscoveryBlockers.activeAttemptPayloadInvalid,
        blockerMessage:
            'Active activation attempt payload has an unparseable serverTimeAnchorAt: ${snapshot.serverTimeAnchorAt}',
      );
    }
    final serverAnchorIso = serverAnchorAt.toUtc().toIso8601String();
    final nowIso = _resolveNow().toUtc().toIso8601String();
    final anchorTicks = _resolveMonotonicTicks();
    final entity = ActivationAttemptLocalEntity(
      attemptId: snapshot.attemptId.trim(),
      tenantId: snapshot.tenantId.trim(),
      candidateTerminalId: registeredTerminalId,
      localStatus: 'ASSIGNED',
      requiredFiscalRevision: snapshot.requiredFiscalRevision,
      requiredFiscalFingerprint: snapshot.requiredFiscalFingerprint.trim(),
      verificationProductId: snapshot.verificationProductId.trim(),
      serverTimeAnchorAt: serverAnchorIso,
      anchorMonotonicTicks: anchorTicks,
      bootSessionId: _clock.bootSessionId,
      assignedAt: snapshot.assignedAt.trim().isEmpty
          ? serverAnchorIso
          : snapshot.assignedAt.trim(),
      updatedAt: nowIso,
    );
    await _database.activationAttemptLocalDao.saveAttempt(entity);

    // Register the anchor with the clock manager using the runner conventions
    // so controlled-sale clock resolution starts anchored to SERVER time.
    _clock.setAnchor(
      serverTimeAnchorAt: serverAnchorAt.toUtc(),
      anchorMonotonicTicks: anchorTicks,
      serverTimeAnchorId: 'anchor-${snapshot.attemptId.trim()}',
      bootSessionId: _clock.bootSessionId,
    );

    return ActivationAttemptDiscoveryResult(
      isSuccess: true,
      resolvedFromLocal: false,
      attempt: entity,
    );
  }
}
