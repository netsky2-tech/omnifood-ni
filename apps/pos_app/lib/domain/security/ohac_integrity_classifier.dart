import 'package:pos_app/data/models/human_authorization/terminal_state_machine.dart';

/// An observed integrity condition at a POS decision boundary (design §9).
///
/// The classifier below is the single mapping source for SERVICE-BOUNDARY
/// conditions; callers observe a condition, they never choose a class. See
/// the scope note on [classifyOhacIntegrity] for how this coexists with the
/// terminal state machine's decision-attached classifications.
sealed class OhacIntegrityCondition {
  /// Short reason token describing where the condition was observed.
  /// IDs and reason tokens only — never a PIN, verifier or assertion body.
  final String detail;

  const OhacIntegrityCondition(this.detail);
}

/// Required local authorization rows are missing (terminal state, candidate
/// pair on a submitting terminal, epoch row behind a live claim).
final class OhacConditionAuthStateMissing extends OhacIntegrityCondition {
  const OhacConditionAuthStateMissing([super.detail = '']);
}

/// A byte-level digest verification failed against material the chain
/// signed (§9 `DIGEST_MISMATCH`).
final class OhacConditionDigestMismatch extends OhacIntegrityCondition {
  const OhacConditionDigestMismatch([super.detail = '']);
}

/// A claim or credential covers a different scope than the one published
/// for it (§9 `SCOPE_MISMATCH`).
final class OhacConditionScopeMismatch extends OhacIntegrityCondition {
  const OhacConditionScopeMismatch([super.detail = '']);
}

/// The local state cannot legitimately produce the server floor: rows were
/// lost or rolled back locally (§9 `LOCAL_ROLLBACK`).
final class OhacConditionLocalRollback extends OhacIntegrityCondition {
  const OhacConditionLocalRollback([super.detail = '']);
}

/// A local/server acknowledgement disagreement: same-sequence digest
/// conflict, floor conflict, receipt mismatch, claim-consistency refusal.
final class OhacConditionAckInconsistent extends OhacIntegrityCondition {
  const OhacConditionAckInconsistent([super.detail = '']);
}

/// The negotiated schema/build facts cannot support the operation
/// (§9 `UNSUPPORTED_SCHEMA_BUILD`).
final class OhacConditionUnsupportedSchemaBuild extends OhacIntegrityCondition {
  const OhacConditionUnsupportedSchemaBuild([super.detail = '']);
}

/// The device-sync transport state is missing (credential material for the
/// transport layer is absent where the flow requires it).
final class OhacConditionTransportStateMissing extends OhacIntegrityCondition {
  const OhacConditionTransportStateMissing([super.detail = '']);
}

/// Any condition this classifier does not recognize. Fail-closed default
/// applies; never `none`.
final class OhacConditionUnknown extends OhacIntegrityCondition {
  const OhacConditionUnknown(super.detail);
}

/// Maps an observed condition to its §9 classification.
///
/// Scope of the "single mapping source" claim, stated precisely: this is the
/// single source for SERVICE-BOUNDARY conditions — the sync pull/ack paths
/// (`sync_service.dart`), authorization, and recovery — which observe a
/// condition and must never choose a §9 class themselves.
///
/// It is deliberately NOT the only place `OhacIntegrityClassification`
/// constants appear: `terminal_state_machine.dart`'s `decideEpochReceive` and
/// `decideReconciliation` attach classifications directly to their sealed
/// receive/reconcile decisions at the model layer. That is a separate,
/// deliberately decoupled decision layer, not a violation of this scope: the
/// state machine is a pure `data/models` type and data/models must not import
/// domain, so the machine's decision-attached classifications stay local by
/// construction while every cross-layer service condition routes through here.
///
/// The unknown-condition default is the closest fail-closed class:
/// `ACK_INCONSISTENT`, the local/server-disagreement family — it quarantines
/// the terminal and routes to security investigation, which is the safe
/// reading of "we observed something the vocabulary does not name". It is
/// NEVER `none`: an observed condition is by definition a fault (design §9,
/// spec `Integrity Loss Fails Closed`).
OhacIntegrityClassification classifyOhacIntegrity(
  OhacIntegrityCondition condition,
) {
  switch (condition) {
    case OhacConditionAuthStateMissing():
      return OhacIntegrityClassification.authStateMissing;
    case OhacConditionDigestMismatch():
      return OhacIntegrityClassification.digestMismatch;
    case OhacConditionScopeMismatch():
      return OhacIntegrityClassification.scopeMismatch;
    case OhacConditionLocalRollback():
      return OhacIntegrityClassification.localRollback;
    case OhacConditionAckInconsistent():
      return OhacIntegrityClassification.ackInconsistent;
    case OhacConditionUnsupportedSchemaBuild():
      return OhacIntegrityClassification.unsupportedSchemaBuild;
    case OhacConditionTransportStateMissing():
      return OhacIntegrityClassification.transportStateMissing;
    case OhacConditionUnknown():
      // Fail-closed default: unknown → closest fail-closed class, never
      // `none` (documented above).
      return OhacIntegrityClassification.ackInconsistent;
  }
}

/// Verdict for a backend ack-rejection `resultCode`.
sealed class OhacAckRejectionVerdict {
  const OhacAckRejectionVerdict();
}

/// Indeterminate (`UNAVAILABLE`): the claim may or may not be accepted;
/// stay in `ACK_SUBMITTING` and retry the identical request.
final class OhacAckIndeterminate extends OhacAckRejectionVerdict {
  const OhacAckIndeterminate();
}

/// A claim-fatal rejection: integrity loss with the classified condition.
final class OhacAckIntegrityLoss extends OhacAckRejectionVerdict {
  final OhacIntegrityCondition condition;
  final OhacIntegrityClassification classification;

  const OhacAckIntegrityLoss(this.condition, this.classification);
}

/// Maps a backend ack-rejection `resultCode` to a verdict.
///
/// Every mapped code means the claim can never be accepted (§9/§10):
/// - `DIGEST_MISMATCH`, `CHAIN_MISMATCH`: the claim conflicts with what the
///   server signed/published for this chain — §9's same-sequence-digest and
///   floor-conflict family → `ACK_INCONSISTENT`. (Note: the backend's
///   resultCode `DIGEST_MISMATCH` is a claim-conflict signal, distinct from
///   the §9 class `DIGEST_MISMATCH`, which names a byte-level local digest
///   verification failure.)
/// - `UNKNOWN_EPOCH`: the server has no epoch at this position — the local
///   claim contradicts the server's chain → `ACK_INCONSISTENT`.
/// - `IDEMPOTENCY_CONFLICT`: impossible with a claim-derived key unless the
///   server sees a DIFFERENT claim under this terminal's key →
///   `ACK_INCONSISTENT`.
/// - `SEQUENCE_GAP`: only reachable when the claim sequence is AHEAD of the
///   server's floor (`contracts/acknowledgement.ts`) — a floor conflict →
///   `ACK_INCONSISTENT`. §10 tension (retryable `OHAC_SEQUENCE_GAP`
///   vocabulary describes the pull-side delivery loop) recorded here, not
///   silently resolved.
/// - `STALE_SEQUENCE`: the claim is behind the floor the server already
///   holds — §9's local-below-floor family → `LOCAL_ROLLBACK`.
/// - `UNAVAILABLE`: the backend could not decide → indeterminate; stay in
///   `ACK_SUBMITTING` and retry the identical request.
/// - anything else (including null): unmapped — fail closed via the
///   unknown-condition default; an unknown rejection verdict is never worth
///   a retry that could confirm a claim the server may already have refused
///   terminally.
OhacAckRejectionVerdict classifyOhacAckRejection(String? resultCode) {
  switch (resultCode) {
    case 'DIGEST_MISMATCH':
    case 'CHAIN_MISMATCH':
    case 'UNKNOWN_EPOCH':
    case 'IDEMPOTENCY_CONFLICT':
    case 'SEQUENCE_GAP':
      const condition = OhacConditionAckInconsistent('ack_rejected');
      return OhacAckIntegrityLoss(condition, classifyOhacIntegrity(condition));
    case 'STALE_SEQUENCE':
      const condition = OhacConditionLocalRollback('ack_rejected');
      return OhacAckIntegrityLoss(condition, classifyOhacIntegrity(condition));
    case 'UNAVAILABLE':
      return const OhacAckIndeterminate();
    default:
      final condition = OhacConditionUnknown(resultCode ?? 'null_code');
      return OhacAckIntegrityLoss(condition, classifyOhacIntegrity(condition));
  }
}
