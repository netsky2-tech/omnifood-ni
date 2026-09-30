/// The §5.1 assertion drain gate and its registration coupler (design
/// `openspec/changes/offline-human-authorization-credential/design.md`,
/// §5.1 invariant and deferral, §11.5 decision 31, review-ledger R1-008).
///
/// Framework-free on purpose: no Floor, no Dio, no Flutter imports. The gate
/// is a pure decision over what registered outboxes report, so the epoch
/// state machine (transaction S) can consult it as the last precondition of
/// the atomic candidate transaction without the domain depending on any
/// persistence or transport detail.
///
/// **The invariant (§5.1, line 176):** a terminal MUST NOT enter
/// `ACK_SUBMITTING` (and therefore MUST NOT cause the server floor to
/// advance) for epoch n+1 while any local outbox that emits
/// `ohac.assertion.v1` payloads still holds an unconsumed assertion
/// attributed to any sequence ≤ n. Consumer-domain outboxes participate by
/// registering as assertion-bearing outboxes with their assertions' epoch
/// sequences. Unconsumed means queued, in-flight, or failed; an assertion
/// counts as drained only after the backend has durably consumed it
/// (consumer receipt) or it has been deterministically dispositioned.
///
/// **Deferral (§5.1, line 180):** while prior-epoch assertions are
/// unconsumed, the epoch stays `RECEIVE/PENDING`, epoch n continues to
/// govern, and authorization is not frozen. The deferral is observable
/// (terminal-state reason `OHAC_ACK_DEFERRED_OUTBOX`, §10) and retried on
/// every subsequent sync cycle.
///
/// **Quarantine (§5.1, line 182):** an assertion that cannot be delivered
/// after a bounded, configured number of push retries — or that an
/// authorized operator explicitly dispositioned — moves to a quarantined,
/// append-only state *excluded from the drain gate*. The retry bound governs
/// the drain gate only; it imposes no admissibility TTL on the assertion
/// itself. See [OhacQuarantineReportingOutbox] and
/// [OhacDrainGateOutcome.quarantined] for how that exclusion is decided
/// here.
///
/// **Decision 31 (§11.5, line 427):** the gate, its registration coupler,
/// the blocked `ACK_SUBMITTING` transition, the `OHAC_ACK_DEFERRED_OUTBOX`
/// reason, its bounded retry count, and its quarantine are implemented as
/// *inert structure*, exercised by test registrants, and become load-bearing
/// when DSI-6's credit-note outbox produces the first assertions.
///
/// **Why nothing is registered in production (the census):** the registry is
/// empty by construction today. All 11 existing outbox structures in this
/// app (activation outbox, generic outbox events, sync queues and their
/// siblings) carry no assertion and no epoch sequence — they were measured
/// while landing this unit, and none of them emits `ohac.assertion.v1`. An
/// empty registry always passes (see [OhacOutboxRegistry.evaluate]), which
/// is exactly the inert behavior decision 31 requires until DSI-6 lands.
library;

/// The §10 terminal-state deferral reason the drain gate reports when it
/// holds the `ACK_SUBMITTING` flip (§5.1 line 180: "the deferral is
/// observable (terminal-state reason `OHAC_ACK_DEFERRED_OUTBOX`, §10 ...)").
///
/// The same wire value is the local event type
/// (`OhacLocalEventType.ackDeferredOutbox`) and the value persisted in the
/// `ack_deferral_reason` column; this constant is the single source of truth
/// and the data layer references it.
const String ohacAckDeferredOutboxReason = 'OHAC_ACK_DEFERRED_OUTBOX';

/// One outbox that emits `ohac.assertion.v1` payloads and therefore
/// participates in the §5.1 drain gate.
///
/// Registration is the R1-008 coupler: assertion creation from an outbox
/// that has not registered MUST be refused (fail closed). The emitter U4
/// will consume [OhacOutboxRegistry.isRegistered] for that refusal; the
/// registry itself refuses nothing — it only answers the question.
abstract interface class OhacAssertionBearingOutbox {
  /// Stable identity used in gate decisions, deferral event payloads and
  /// operator-facing classification.
  String get outboxId;

  /// The lowest epoch sequence that still has an unconsumed assertion in
  /// this outbox, or `null` when the outbox is **fully drained**.
  ///
  /// Unconsumed means queued, in-flight, or failed. Quarantined or otherwise
  /// deterministically dispositioned assertions do NOT count here — they are
  /// excluded from the gate (§5.1 line 182) and, when reportable, are
  /// surfaced through [OhacQuarantineReportingOutbox] instead.
  Future<int?> lowestUnconsumedAssertionSequence();
}

/// Optional capability of an outbox that can report quarantined assertions.
///
/// §5.1 line 182 moves an assertion that exceeded its bounded retry count —
/// or that an authorized operator explicitly dispositioned — into a
/// "quarantined, append-only state excluded from the drain gate", and makes
/// that quarantine "operator-visible ... and never silent". Excluded means:
/// a quarantined item never blocks the flip. Reportable means: when the only
/// items an outbox holds are quarantined ones, the gate still clears, but it
/// clears through [OhacDrainGateOutcome.quarantined] rather than
/// [OhacDrainGateOutcome.passed], so the observability layer can tell a
/// clean drain from a drain that happened over the quarantine exit.
abstract interface class OhacQuarantineReportingOutbox {
  /// The lowest epoch sequence with a quarantined (dispositioned) assertion
  /// in this outbox, or `null` when nothing is quarantined.
  Future<int?> lowestQuarantinedAssertionSequence();
}

/// What the drain gate decided for a candidate sequence.
enum OhacDrainGateOutcome {
  /// No registered outbox holds a blocker: the flip may proceed.
  passed,

  /// At least one registered outbox holds an unconsumed assertion at a
  /// sequence ≤ candidate - 1: the flip MUST NOT proceed (§5.1 line 176).
  /// The terminal stays `RECEIVE_PENDING`, epoch n keeps governing, and the
  /// deferral is retried on every subsequent sync cycle.
  deferred,

  /// No unconsumed blocker remains, but at least one outbox reports
  /// quarantined items: the flip proceeds exactly as [passed] — quarantine
  /// is excluded from the gate (§5.1 line 182) — and this outcome exists
  /// only so the drain is "operator-visible ... and never silent": it
  /// distinguishes a clean pass from a pass over the quarantine exit.
  /// DSI-6 owns the terminal-side quarantine classification; nothing is
  /// quarantinable before the first real assertion-bearing outbox exists.
  quarantined,
}

/// The immutable result of one gate evaluation.
final class OhacDrainGateDecision {
  /// What the gate decided.
  final OhacDrainGateOutcome outcome;

  /// The §10 reason code to persist when the decision is
  /// [OhacDrainGateOutcome.deferred]; empty otherwise (a pass — clean or
  /// over quarantine — persists no deferral reason).
  final String reasonCode;

  /// The outbox identities behind the decision: the blockers for
  /// [OhacDrainGateOutcome.deferred], the quarantined reporters for
  /// [OhacDrainGateOutcome.quarantined], empty for [OhacDrainGateOutcome.passed].
  final List<String> blockingOutboxIds;

  const OhacDrainGateDecision(
    this.outcome,
    this.reasonCode,
    this.blockingOutboxIds,
  );
}

/// The §5.1 drain gate registry: the assertion-bearing outboxes of this
/// terminal plus the evaluation the epoch state machine consults.
///
/// The registry is the R1-008 registration coupler's read side: it answers
/// [isRegistered] so an assertion emitter can refuse creation from an
/// unregistered outbox (fail closed). It holds no production registrants —
/// decision 31 keeps it inert until DSI-6.
final class OhacOutboxRegistry {
  /// The design's "bounded, configured number of push retries" (§5.1 line
  /// 182) that governs when a deferral stops retrying and becomes
  /// quarantine-review material. The design fixes NO value — this constant
  /// is the placeholder pending DSI-6's real configuration, recorded here so
  /// the bound is a named decision rather than a magic number. When the
  /// deferral count for a candidate reaches this bound, the deferral log
  /// carries `quarantineReview=true` and the deferral event payload carries
  /// `retryBoundReached: true`; actual terminal-side quarantine remains
  /// DSI-6's decision (nothing is quarantinable before the first real
  /// assertion-bearing outbox exists).
  static const int ohacAckDeferredRetryBound = 5;

  final List<OhacAssertionBearingOutbox> _outboxes = [];

  /// Registers [outbox] as an assertion-bearing outbox. Called once per
  /// outbox at composition time; the registry performs no deduplication —
  /// registering the same outbox twice is a caller bug the gate reports as
  /// two blockers.
  void register(OhacAssertionBearingOutbox outbox) => _outboxes.add(outbox);

  /// The R1-008 fail-closed coupler: whether [outboxId] has registered as an
  /// assertion-bearing outbox. An assertion emitter MUST refuse to create an
  /// assertion when this answers `false` — an unregistered emitter would be
  /// invisible to the drain gate, so creation is refused rather than allowed
  /// to bypass it.
  bool isRegistered(String outboxId) =>
      _outboxes.any((outbox) => outbox.outboxId == outboxId);

  /// Evaluates the §5.1 invariant for a candidate at [candidateSequence].
  ///
  /// The gate defers iff any registered outbox reports an unconsumed
  /// assertion at a sequence ≤ `candidateSequence - 1` (§5.1 line 176:
  /// "any ... unconsumed assertion attributed to any sequence ≤ n" for a
  /// candidate at n+1). An empty registry — today's production shape —
  /// always passes: the invariant is conditional on an outbox that emits
  /// `ohac.assertion.v1`, and none exists (decision 31), so the gate is
  /// inert until one registers.
  Future<OhacDrainGateDecision> evaluate({
    required int candidateSequence,
  }) async {
    final blocking = <String>[];
    for (final outbox in _outboxes) {
      final lowest = await outbox.lowestUnconsumedAssertionSequence();
      if (lowest != null && lowest <= candidateSequence - 1) {
        blocking.add(outbox.outboxId);
      }
    }
    if (blocking.isNotEmpty) {
      return OhacDrainGateDecision(
        OhacDrainGateOutcome.deferred,
        ohacAckDeferredOutboxReason,
        blocking,
      );
    }

    // §5.1 line 182: quarantined items are excluded from the gate. They
    // never defer the flip; they only color a pass as `quarantined` when the
    // outbox can report them, so the drain over the quarantine exit stays
    // operator-visible rather than silent.
    final quarantinedReporters = <String>[];
    for (final outbox in _outboxes) {
      // Pattern match (not `is!`-promotion): the quarantine capability is a
      // separate interface, not a subtype of OhacAssertionBearingOutbox, so
      // no type promotion would apply.
      if (outbox case OhacQuarantineReportingOutbox reporter) {
        final lowestQuarantined =
            await reporter.lowestQuarantinedAssertionSequence();
        if (lowestQuarantined != null) {
          quarantinedReporters.add(outbox.outboxId);
        }
      }
    }
    if (quarantinedReporters.isNotEmpty) {
      return OhacDrainGateDecision(
        OhacDrainGateOutcome.quarantined,
        '',
        quarantinedReporters,
      );
    }

    return const OhacDrainGateDecision(
      OhacDrainGateOutcome.passed,
      '',
      [],
    );
  }
}
