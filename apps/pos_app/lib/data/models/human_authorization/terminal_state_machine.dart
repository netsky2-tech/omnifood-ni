import 'package:pos_app/data/models/human_authorization/error_codes.dart';
import 'package:pos_app/data/models/human_authorization/field_guards.dart';

/// The persisted terminal-state vocabulary (design §5).
///
/// `ACK_CONFIRMED` is deliberately absent: design §5.4 has the POS record the
/// ack receipt and promote the candidate to `ACTIVE` inside one atomic local
/// write, so "confirmed" is a transient label that never persists. The
/// terminal never stores it, and `fromWire` must not resolve it.
enum OhacTerminalPhase {
  active('ACTIVE'),
  receivePending('RECEIVE_PENDING'),
  ackSubmitting('ACK_SUBMITTING'),
  integrityLoss('INTEGRITY_LOSS');

  const OhacTerminalPhase(this.wire);

  /// The persisted column value. Frozen contract vocabulary.
  final String wire;

  static OhacTerminalPhase? fromWire(String value) {
    for (final phase in OhacTerminalPhase.values) {
      if (phase.wire == value) return phase;
    }
    return null;
  }

  /// Whether authorization is frozen in this phase. §5's prose says the
  /// old epoch governs during `RECEIVE_PENDING`, so authorization is
  /// allowed there; during the ack states no policy governs (§5: "During
  /// all ack states, no policy governs"), so it is frozen. Integrity loss
  /// freezes too: §5 step 5 routes faults to `INTEGRITY_LOSS` and §9
  /// quarantines the local capability, so no policy governs there either.
  /// (§5's state table itself has no `INTEGRITY_LOSS` row.)
  bool get isAuthorizationFrozen =>
      this == OhacTerminalPhase.ackSubmitting ||
      this == OhacTerminalPhase.integrityLoss;
}

/// The §9 integrity classification vocabulary, as persisted in the terminal
/// state's `integrity_classification` column.
///
/// Note: §5.5's prose writes `ROLLBACK_DETECTED` where §9's table writes
/// `LOCAL_ROLLBACK`. §9 is the classification table, so `localRollback` is the
/// wire value used here; the divergence is recorded, not silently resolved.
enum OhacIntegrityClassification {
  authStateMissing('AUTH_STATE_MISSING'),
  digestMismatch('DIGEST_MISMATCH'),
  scopeMismatch('SCOPE_MISMATCH'),
  localRollback('LOCAL_ROLLBACK'),
  ackInconsistent('ACK_INCONSISTENT'),
  unsupportedSchemaBuild('UNSUPPORTED_SCHEMA_BUILD'),
  transportStateMissing('TRANSPORT_STATE_MISSING'),

  /// The column's sentinel: an empty classification means no fault observed.
  none('');

  const OhacIntegrityClassification(this.wire);

  /// The persisted column value. Frozen contract vocabulary.
  final String wire;

  static OhacIntegrityClassification? fromWire(String value) {
    for (final classification in OhacIntegrityClassification.values) {
      if (classification.wire == value) return classification;
    }
    return null;
  }
}

/// Sentinel values of the terminal-state pair columns: epoch sequences start
/// at 1, so sequence `0` means "no epoch", and a digest is `sha256:` plus 64
/// hex, so the empty string means "none". The Floor entity uses the same
/// sentinels because the columns are NOT NULL.
const int ohacNoEpochSequence = 0;
const String ohacNoEpochDigest = '';

/// An immutable mirror of the persisted terminal state — a value, not the
/// Floor entity. The future adapter maps `OhacTerminalStateEntity` into this
/// so the decisions below stay framework-free (design §2).
final class OhacTerminalSnapshot {
  final OhacTerminalPhase phase;

  /// The epoch the terminal currently asserts under.
  final int activeSequence;
  final String activeDigest;

  /// The received-but-not-yet-confirmed epoch.
  final int candidateSequence;
  final String candidateDigest;

  /// The highest fully confirmed position the server last acknowledged.
  final int serverFloorSequence;
  final String serverFloorDigest;

  /// The four negotiated facts (design §4.2). Empty means never negotiated.
  final String negotiatedPosBuild;
  final String negotiatedBackendBuild;
  final String negotiatedPolicySchema;
  final String negotiatedAssertionSchema;

  /// Terminal-local authorization sequence (design §4.2, §6).
  final int localAuthorizationSequence;

  const OhacTerminalSnapshot({
    required this.phase,
    required this.activeSequence,
    required this.activeDigest,
    required this.candidateSequence,
    required this.candidateDigest,
    required this.serverFloorSequence,
    required this.serverFloorDigest,
    required this.negotiatedPosBuild,
    required this.negotiatedBackendBuild,
    required this.negotiatedPolicySchema,
    required this.negotiatedAssertionSchema,
    required this.localAuthorizationSequence,
  });

  /// A pair is present only when BOTH halves are non-sentinel: the
  /// documented sentinel is `0` sequence AND empty digest (the terminal-state
  /// migration and the entity doc comment enforce the pairing as a
  /// test-checked invariant), so a real sequence with an empty digest — or
  /// the reverse — is not a present epoch.
  bool get hasActiveEpoch =>
      activeSequence != ohacNoEpochSequence &&
      activeDigest != ohacNoEpochDigest;

  bool get hasCandidate =>
      candidateSequence != ohacNoEpochSequence &&
      candidateDigest != ohacNoEpochDigest;

  @override
  bool operator ==(Object other) =>
      other is OhacTerminalSnapshot &&
      other.phase == phase &&
      other.activeSequence == activeSequence &&
      other.activeDigest == activeDigest &&
      other.candidateSequence == candidateSequence &&
      other.candidateDigest == candidateDigest &&
      other.serverFloorSequence == serverFloorSequence &&
      other.serverFloorDigest == serverFloorDigest &&
      other.negotiatedPosBuild == negotiatedPosBuild &&
      other.negotiatedBackendBuild == negotiatedBackendBuild &&
      other.negotiatedPolicySchema == negotiatedPolicySchema &&
      other.negotiatedAssertionSchema == negotiatedAssertionSchema &&
      other.localAuthorizationSequence == localAuthorizationSequence;

  @override
  int get hashCode => Object.hash(
        phase,
        activeSequence,
        activeDigest,
        candidateSequence,
        candidateDigest,
        serverFloorSequence,
        serverFloorDigest,
        negotiatedPosBuild,
        negotiatedBackendBuild,
        negotiatedPolicySchema,
        negotiatedAssertionSchema,
        localAuthorizationSequence,
      );

  @override
  String toString() => 'OhacTerminalSnapshot(${phase.wire}, '
      'active=$activeSequence, candidate=$candidateSequence, '
      'floor=$serverFloorSequence, localAuth=$localAuthorizationSequence)';
}

/// Sealed receive decision for a delivered epoch (design §5 step 1), in the
/// same style as `OhacResult`: pattern-match, never interpret flags.
sealed class OhacReceiveDecision {
  const OhacReceiveDecision();
}

/// Duplicate delivery of the epoch the terminal already holds (the active
/// pair or the candidate pair): nothing to do.
final class OhacReceiveDuplicate extends OhacReceiveDecision {
  const OhacReceiveDuplicate();
}

/// Same sequence as either the active or the candidate pair with a
/// different digest: terminal integrity loss (design §5 step 1). The
/// classification is carried on the decision so the caller applies a §9
/// code — a same-sequence digest conflict is `ACK_INCONSISTENT` — instead
/// of choosing one.
final class OhacReceiveIntegrityLoss extends OhacReceiveDecision {
  final OhacIntegrityClassification classification;

  const OhacReceiveIntegrityLoss(this.classification);
}

/// The epoch is exactly `active + 1` and may become the next candidate.
final class OhacReceiveAccept extends OhacReceiveDecision {
  const OhacReceiveAccept();
}

/// The epoch is stale, gapped, or its sequence is not Int64-canonical.
final class OhacReceiveReject extends OhacReceiveDecision {
  final OhacError error;

  const OhacReceiveReject(this.error);
}

/// Decides what a delivered epoch means for the terminal, given a snapshot
/// and the received epoch's sequence and digest. The epoch itself has already
/// been through `validateEpochAcceptance`: identity, build and chain
/// continuation are that function's decision and are not re-checked here.
///
/// `epochSequence` arrives as a decimal string from the contract, so this
/// function converts it exactly once through `isInt64DecimalString` and
/// rejects a non-Int64-canonical value instead of parsing it unguarded.
OhacReceiveDecision decideEpochReceive({
  required OhacTerminalSnapshot snapshot,
  required String epochSequence,
  required String epochDigest,
}) {
  if (!isInt64DecimalString(epochSequence)) {
    return const OhacReceiveReject(
      OhacError(OhacErrorCode.invalidField, 'sequence'),
    );
  }
  final sequence = int.parse(epochSequence);

  // Classify against BOTH pairs, in this order:
  //
  // 1. matches the active pair, or matches the candidate pair -> duplicate
  //    no-op (design §5 step 1). The active match matters: a redelivery of
  //    the epoch the terminal already holds is the same no-op a candidate
  //    redelivery is.
  // 2. same sequence as either pair but a different digest -> integrity
  //    loss. This must be checked for both pairs BEFORE the stale branch,
  //    because a conflict at the active sequence is exactly the case the
  //    stale branch would otherwise swallow and report as benign staleness,
  //    while the terminal keeps asserting under a body that conflicts with
  //    what the server publishes (§9: same-sequence digest conflict is
  //    ACK_INCONSISTENT).
  // 3. below the active sequence -> stale (`sequenceNotNewer`).
  // 4. exactly `active + 1` -> accept.
  // 5. anything else newer -> gap.
  final matchesActivePair = sequence == snapshot.activeSequence &&
      epochDigest == snapshot.activeDigest;
  final matchesCandidatePair = sequence == snapshot.candidateSequence &&
      epochDigest == snapshot.candidateDigest;
  if (matchesActivePair || matchesCandidatePair) {
    return const OhacReceiveDuplicate();
  }
  if (sequence == snapshot.activeSequence ||
      sequence == snapshot.candidateSequence) {
    return const OhacReceiveIntegrityLoss(
      OhacIntegrityClassification.ackInconsistent,
    );
  }

  // Contiguity, not mere newness: "Accept only ... sequence=active+1" (design
  // §5 step 1). The sentinel active pair (sequence 0) makes the first epoch 1
  // acceptable. Equal-to-active already returned above, so only genuinely
  // lower sequences reach the stale branch.
  if (sequence == snapshot.activeSequence + 1) {
    return const OhacReceiveAccept();
  }
  // Below the active sequence is stale: reuse the pre-existing stable code
  // instead of minting a new one.
  if (sequence < snapshot.activeSequence) {
    return const OhacReceiveReject(
      OhacError(OhacErrorCode.sequenceNotNewer, 'sequence'),
    );
  }
  // Newer but not next: a gap the terminal must request, never skip.
  return const OhacReceiveReject(
    OhacError(OhacErrorCode.sequenceGap, 'sequence'),
  );
}

/// Sealed reconciliation decision for a reconnect against the authoritative
/// server floor (design §5.5).
sealed class OhacReconciliationDecision {
  const OhacReconciliationDecision();
}

/// The local active is below the floor and the candidate matches the floor
/// pair exactly: the ack may be retried (enter `ACK_SUBMITTING`).
final class OhacRetryAcknowledgement extends OhacReconciliationDecision {
  const OhacRetryAcknowledgement();
}

/// The local state cannot legitimately produce the server floor: quarantine
/// with the given classification and recover.
final class OhacReconciliationIntegrityLoss
    extends OhacReconciliationDecision {
  final OhacIntegrityClassification classification;

  const OhacReconciliationIntegrityLoss(this.classification);
}

/// The local claim contradicts the server floor: fail closed with the given
/// classification (quarantine plus security investigation).
final class OhacReconciliationFailClosed extends OhacReconciliationDecision {
  final OhacIntegrityClassification classification;

  const OhacReconciliationFailClosed(this.classification);
}

/// A pending candidate that was never submitted may be discarded; the active
/// state remains intact and governs.
final class OhacDiscardPendingCandidate extends OhacReconciliationDecision {
  const OhacDiscardPendingCandidate();
}

/// The local and server positions agree and no fault was found.
final class OhacNothingToReconcile extends OhacReconciliationDecision {
  const OhacNothingToReconcile();
}

/// Decides what reconnect reconciliation must do, given a snapshot and the
/// authoritative floor pair from negotiation (design §5.5).
OhacReconciliationDecision decideReconciliation({
  required OhacTerminalSnapshot snapshot,
  required int serverFloorSequence,
  required String serverFloorDigest,
}) {
  // Below the floor: "Local below floor enters ACK_SUBMITTING if its matching
  // candidate is intact and retries; otherwise it enters
  // INTEGRITY_LOSS/LOCAL_ROLLBACK."
  if (snapshot.activeSequence < serverFloorSequence) {
    if (snapshot.candidateSequence == serverFloorSequence &&
        snapshot.candidateDigest == serverFloorDigest) {
      return const OhacRetryAcknowledgement();
    }
    return const OhacReconciliationIntegrityLoss(
      OhacIntegrityClassification.localRollback,
    );
  }

  // Above the floor: "Local above floor with a confirmed-active claim is
  // inconsistent and fails closed." A sentinel active pair (0) with a real
  // floor therefore also fails closed.
  if (snapshot.activeSequence > serverFloorSequence) {
    return const OhacReconciliationFailClosed(
      OhacIntegrityClassification.ackInconsistent,
    );
  }

  // Equal sequence. An absent active pair is handled before the digest
  // comparison, because an unenrolled terminal legitimately sits at floor
  // `0`/`GENESIS` with an empty active digest.
  if (!snapshot.hasActiveEpoch) {
    // A candidate without any active epoch is required-row loss (§9
    // AUTH_STATE_MISSING), so the discard below must not fire.
    if (snapshot.hasCandidate) {
      return const OhacReconciliationIntegrityLoss(
        OhacIntegrityClassification.authStateMissing,
      );
    }
    return const OhacNothingToReconcile();
  }

  // Same sequence with a different digest is the §9 ACK_INCONSISTENT
  // detection: "local/server floor or same-sequence digest conflict".
  if (snapshot.activeDigest != serverFloorDigest) {
    return const OhacReconciliationFailClosed(
      OhacIntegrityClassification.ackInconsistent,
    );
  }

  // Equal floor. A candidate in RECEIVE_PENDING was never submitted, so it
  // may be discarded; the active state is intact (checked above) and still
  // governs. In every other phase the candidate belongs to the ack path, and
  // reconciliation leaves it alone.
  if (snapshot.phase == OhacTerminalPhase.receivePending &&
      snapshot.hasCandidate) {
    return const OhacDiscardPendingCandidate();
  }
  return const OhacNothingToReconcile();
}
