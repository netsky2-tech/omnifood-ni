import 'ohac_observability.dart';

/// Result of the injected OHAC token redeem step (U5a backend route
/// `POST /v1/sync/inbound/human-authorization/recovery/redeem`).
sealed class OhacTokenRedeemResult {
  const OhacTokenRedeemResult();
}

final class OhacTokenRedeemSucceeded extends OhacTokenRedeemResult {
  const OhacTokenRedeemSucceeded();
}

/// Redeem refused or failed. [reason] is a reason token/ID only.
final class OhacTokenRedeemFailed extends OhacTokenRedeemResult {
  final String reason;

  const OhacTokenRedeemFailed(this.reason);
}

/// Outcome of one ordered integrity-recovery attempt (design §9 recovery
/// ordering: transport FIRST, OHAC redeem only after transport success).
sealed class OhacIntegrityRecoveryOutcome {
  const OhacIntegrityRecoveryOutcome();
}

/// Step 1 failed: stop. The redeem step was never reached.
final class OhacRecoveryTransportFailed extends OhacIntegrityRecoveryOutcome {
  const OhacRecoveryTransportFailed();
}

/// Transport restored and no redeem step was injected: the caller owns
/// whatever the OHAC-side recovery is; only the transport moved.
final class OhacRecoveryTransportRestoredOnly
    extends OhacIntegrityRecoveryOutcome {
  const OhacRecoveryTransportRestoredOnly();
}

/// Transport restored and the injected redeem step ran to a result.
final class OhacRecoveryCompleted extends OhacIntegrityRecoveryOutcome {
  final OhacTokenRedeemResult redeem;

  const OhacRecoveryCompleted(this.redeem);
}

/// Ordered clear-data coordinator for a quarantined terminal (design §9).
///
/// **Inert until called**: there is deliberately NO production caller yet —
/// the DSI-7/activation flow wires it later, exactly like B3's outbox
/// registry. The two seams are injected:
///
/// - [restoreActivationTransport] wraps the existing
///   `DeviceSyncBootstrapCoordinator` call (transport restore). This
///   coordinator NEVER provisions, confirms, rotates or revokes device
///   credentials itself (design §9) — the only credential-touching code
///   lives behind this injected seam, owned by the DSI-7 flow.
/// - [redeemOhacToken] redeems the OHAC recovery token against the U5a
///   route. Absent by default: with no redeem port injected the recovery
///   stops after a successful transport restore and reports
///   `transportRestoredOnly` — a new Dio call wired to nowhere is never
///   created here.
///
/// Order is absolute: step 1 failure stops the recovery and the redeem
/// step is never reached.
class OhacIntegrityRecoveryCoordinator {
  final Future<bool> Function() _restoreActivationTransport;
  final Future<OhacTokenRedeemResult> Function()? _redeemOhacToken;
  final void Function(OhacObservabilityFact fact)? _observe;

  OhacIntegrityRecoveryCoordinator({
    required Future<bool> Function() restoreActivationTransport,
    Future<OhacTokenRedeemResult> Function()? redeemOhacToken,
    void Function(OhacObservabilityFact fact)? observe,
  }) : _restoreActivationTransport = restoreActivationTransport,
       _redeemOhacToken = redeemOhacToken,
       _observe = observe;

  Future<OhacIntegrityRecoveryOutcome> recover({
    required String tenantId,
    required String terminalId,
    required String integrityClassification,
  }) async {
    void emit(String step, String outcome, String detail) {
      _observe?.call(
        ohacRecoveryStepFact(
          step: step,
          outcome: outcome,
          classification: integrityClassification,
          detail: detail,
        ),
      );
    }

    // Step 1 — transport restore FIRST (design §9 ordering). The injected
    // seam wraps the existing DeviceSyncBootstrapCoordinator call; the only
    // credential-touching code lives behind it (DSI-7 ownership).
    emit('transport', 'started', 'restore_activation_transport');
    final bool restored;
    try {
      restored = await _restoreActivationTransport();
    } catch (e) {
      emit('transport', 'failed', 'transport_restore_threw');
      return const OhacRecoveryTransportFailed();
    }
    if (!restored) {
      // STOP: step 1 failed, so the redeem step is never reached (design §9).
      emit('transport', 'failed', 'bootstrap_unsuccessful');
      return const OhacRecoveryTransportFailed();
    }
    emit('transport', 'restored', 'bootstrap_successful');

    // Step 2 — OHAC token redeem, ONLY after transport success. Absent by
    // default: with no redeem port injected the recovery reports
    // transportRestoredOnly (no Dio call wired to nowhere).
    final redeem = _redeemOhacToken;
    if (redeem == null) {
      emit('redeem', 'skipped', 'no_redeem_port_injected');
      return const OhacRecoveryTransportRestoredOnly();
    }
    emit('redeem', 'started', 'ohac_token_redeem');
    final OhacTokenRedeemResult result;
    try {
      result = await redeem();
    } catch (e) {
      emit('redeem', 'failed', 'redeem_threw');
      return OhacRecoveryCompleted(const OhacTokenRedeemFailed('redeem_threw'));
    }
    final outcome = switch (result) {
      OhacTokenRedeemSucceeded() => 'succeeded',
      OhacTokenRedeemFailed() => 'failed',
    };
    final detail = switch (result) {
      OhacTokenRedeemSucceeded() => 'token_redeemed',
      OhacTokenRedeemFailed(:final reason) => reason,
    };
    emit('redeem', outcome, detail);
    return OhacRecoveryCompleted(result);
  }
}
