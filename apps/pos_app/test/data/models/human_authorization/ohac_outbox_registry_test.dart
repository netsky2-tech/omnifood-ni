import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/security/ohac_outbox_registry.dart';

/// Unit coverage for the §5.1 assertion drain gate registry (design
/// `offline-human-authorization-credential`, §5.1 lines 176/180/182, §11.5
/// decision 31 line 427, review-ledger R1-008).
///
/// The registrants here are the design's named test exercisers: decision 31
/// implements the gate "as inert structure, exercised by a test registrant",
/// because no production outbox emits `ohac.assertion.v1` yet (the census of
/// the 11 existing outbox structures found no assertion and no epoch
/// sequence in any of them). The gate becomes load-bearing when DSI-6's
/// credit-note outbox registers the first real assertions.
/// The test registrant: a mutable assertion-bearing outbox whose drain and
/// quarantine state the tests move directly. This is decision 31's named
/// "test registrant" exerciser.
class TestOutbox
    implements OhacAssertionBearingOutbox, OhacQuarantineReportingOutbox {
  @override
  final String outboxId;

  int? lowestUnconsumed;
  int? lowestQuarantined;

  TestOutbox(
    this.outboxId, {
    this.lowestUnconsumed,
    this.lowestQuarantined,
  });

  @override
  Future<int?> lowestUnconsumedAssertionSequence() async => lowestUnconsumed;

  @override
  Future<int?> lowestQuarantinedAssertionSequence() async =>
      lowestQuarantined;
}

void main() {
  test('an empty registry always passes — the gate is inert (decision 31)',
      () async {
    final decision = await OhacOutboxRegistry().evaluate(
      candidateSequence: 7,
    );
    expect(decision.outcome, OhacDrainGateOutcome.passed);
    expect(decision.reasonCode, '');
    expect(decision.blockingOutboxIds, isEmpty);
  });

  test('a blocker at a sequence ≤ n-1 defers the candidate at n', () async {
    final registry = OhacOutboxRegistry();
    final outbox = TestOutbox('credit-note-outbox', lowestUnconsumed: 1);
    registry.register(outbox);

    // Candidate 2 must not flip while assertion sequence 1 is unconsumed:
    // "any ... unconsumed assertion attributed to any sequence ≤ n" for a
    // candidate at n+1 = 1 ≤ 2 - 1.
    final decision = await registry.evaluate(candidateSequence: 2);
    expect(decision.outcome, OhacDrainGateOutcome.deferred);
    expect(decision.reasonCode, 'OHAC_ACK_DEFERRED_OUTBOX');
    expect(decision.blockingOutboxIds, ['credit-note-outbox']);
  });

  test('a blocker at exactly n passes — only sequences ≤ n-1 block', () async {
    final registry = OhacOutboxRegistry();
    final outbox = TestOutbox('credit-note-outbox', lowestUnconsumed: 2);
    registry.register(outbox);

    // An assertion AT the candidate's own sequence (or above) belongs to the
    // epoch the candidate would open; §5.1 blocks on prior-epoch assertions
    // only (≤ n-1).
    final decision = await registry.evaluate(candidateSequence: 2);
    expect(decision.outcome, OhacDrainGateOutcome.passed);
    expect(decision.blockingOutboxIds, isEmpty);
  });

  test('a fully drained outbox (null) passes', () async {
    final registry = OhacOutboxRegistry();
    final outbox = TestOutbox('credit-note-outbox', lowestUnconsumed: null);
    registry.register(outbox);

    final decision = await registry.evaluate(candidateSequence: 2);
    expect(decision.outcome, OhacDrainGateOutcome.passed);
  });

  test('a blocker above the candidate boundary passes', () async {
    final registry = OhacOutboxRegistry();
    final outbox = TestOutbox('credit-note-outbox', lowestUnconsumed: 9);
    registry.register(outbox);

    final decision = await registry.evaluate(candidateSequence: 2);
    expect(decision.outcome, OhacDrainGateOutcome.passed);
  });

  test(
      'quarantined items are EXCLUDED from the gate: a quarantined reporter '
      'with nothing unconsumed yields the quarantined outcome — an effective '
      'pass over the quarantine exit (§5.1 line 182)',
      () async {
    final registry = OhacOutboxRegistry();
    final outbox = TestOutbox(
      'credit-note-outbox',
      lowestUnconsumed: null,
      lowestQuarantined: 1,
    );
    registry.register(outbox);

    final decision = await registry.evaluate(candidateSequence: 2);
    // NOT deferred: the quarantine exit does not block the flip. The
    // distinct outcome keeps the drain "operator-visible ... and never
    // silent" — it distinguishes this pass from a clean one. The reason code
    // stays empty: no deferral reason is persisted for an effective pass.
    expect(decision.outcome, OhacDrainGateOutcome.quarantined);
    expect(decision.reasonCode, '');
    expect(decision.blockingOutboxIds, ['credit-note-outbox']);
  });

  test(
      'a real blocker defers even when another outbox reports quarantined '
      'items — quarantine never masks an unconsumed blocker', () async {
    final registry = OhacOutboxRegistry();
    registry.register(
      TestOutbox('blocked-outbox', lowestUnconsumed: 1),
    );
    registry.register(
      TestOutbox(
        'quarantined-outbox',
        lowestUnconsumed: null,
        lowestQuarantined: 1,
      ),
    );

    final decision = await registry.evaluate(candidateSequence: 2);
    expect(decision.outcome, OhacDrainGateOutcome.deferred);
    expect(decision.reasonCode, 'OHAC_ACK_DEFERRED_OUTBOX');
    expect(decision.blockingOutboxIds, ['blocked-outbox'],
        reason: 'only the unconsumed blocker is reported');
  });

  test(
      'mixed outboxes: the decision names exactly the blocking outboxes, '
      'not the drained ones', () async {
    final registry = OhacOutboxRegistry();
    registry.register(TestOutbox('drained-outbox', lowestUnconsumed: null));
    registry.register(TestOutbox('future-outbox', lowestUnconsumed: 5));
    registry.register(TestOutbox('stale-outbox', lowestUnconsumed: 1));

    final decision = await registry.evaluate(candidateSequence: 2);
    expect(decision.outcome, OhacDrainGateOutcome.deferred);
    expect(decision.blockingOutboxIds, ['stale-outbox'],
        reason: '1 ≤ 2-1 blocks; 5 > 2-1 does not; null is drained');
  });

  test(
      'R1-008 fail-closed coupler: an unregistered outbox id is not '
      'registered, and registration makes it visible', () async {
    final registry = OhacOutboxRegistry();
    expect(
      registry.isRegistered('credit-note-outbox'),
      isFalse,
      reason: 'fail closed: an emitter that never registered must be refused '
          'assertion creation, because it would be invisible to the gate',
    );

    registry.register(TestOutbox('credit-note-outbox'));
    expect(registry.isRegistered('credit-note-outbox'), isTrue);
    expect(registry.isRegistered('other-outbox'), isFalse);
  });

  test(
      'the retry bound is the design placeholder value 5 — the design fixes '
      'no number (§5.1 line 182: "a bounded, configured number of push '
      'retries"); DSI-6 owns the real configuration',
      () {
    expect(OhacOutboxRegistry.ohacAckDeferredRetryBound, 5);
  });
}
