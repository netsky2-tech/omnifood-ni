import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/models/human_authorization/error_codes.dart';
import 'package:pos_app/data/models/human_authorization/field_guards.dart';
import 'package:pos_app/data/models/human_authorization/terminal_state_machine.dart';

/// Deterministic digests so sequence/digest pairs stay readable in tests.
String digest(int n) => 'sha256:${n.toString().padLeft(64, '0')}';

const noSequence = 0;
const noDigest = '';

OhacTerminalSnapshot snapshot({
  OhacTerminalPhase phase = OhacTerminalPhase.active,
  int activeSequence = 4,
  String activeDigest = 'sha256:4',
  int candidateSequence = noSequence,
  String candidateDigest = noDigest,
  int serverFloorSequence = 4,
  String serverFloorDigest = 'sha256:4',
  String negotiatedPosBuild = '',
  String negotiatedBackendBuild = '',
  String negotiatedPolicySchema = '',
  String negotiatedAssertionSchema = '',
  int localAuthorizationSequence = 0,
}) =>
    OhacTerminalSnapshot(
      phase: phase,
      activeSequence: activeSequence,
      activeDigest: activeDigest,
      candidateSequence: candidateSequence,
      candidateDigest: candidateDigest,
      serverFloorSequence: serverFloorSequence,
      serverFloorDigest: serverFloorDigest,
      negotiatedPosBuild: negotiatedPosBuild,
      negotiatedBackendBuild: negotiatedBackendBuild,
      negotiatedPolicySchema: negotiatedPolicySchema,
      negotiatedAssertionSchema: negotiatedAssertionSchema,
      localAuthorizationSequence: localAuthorizationSequence,
    );

OhacError rejectionOf(OhacReceiveDecision decision) {
  if (decision is OhacReceiveReject) return decision.error;
  throw StateError('expected the receive decision to reject the epoch');
}

/// Locates the machine's own source under `apps/pos_app/lib`, robustly
/// regardless of the working directory `flutter test` picks (same pattern as
/// `resolveHumanAuthorizationFixtureRoot`).
File resolveTerminalStateMachineSource() {
  var current = Directory.current.absolute;
  while (true) {
    final candidate = File(
      '${current.path}/lib/data/models/human_authorization/'
      'terminal_state_machine.dart',
    );
    if (candidate.existsSync()) return candidate;
    final parent = current.parent;
    if (parent.path == current.path) {
      throw StateError(
        'could not locate terminal_state_machine.dart '
        'from ${Directory.current.path}',
      );
    }
    current = parent;
  }
}

void main() {
  group('OhacTerminalPhase', () {
    test('every persisted phase round-trips through fromWire', () {
      for (final phase in OhacTerminalPhase.values) {
        expect(OhacTerminalPhase.fromWire(phase.wire), phase);
      }
    });

    test('an unknown wire value returns null instead of guessing', () {
      expect(OhacTerminalPhase.fromWire('SOMETHING_ELSE'), isNull);
      // ACK_CONFIRMED is deliberately not a persisted phase (design §5.4:
      // the POS records the receipt and promotes to ACTIVE atomically), so
      // the wire value must not resolve to any persisted state.
      expect(OhacTerminalPhase.fromWire('ACK_CONFIRMED'), isNull);
    });

    test('ACTIVE is not frozen: the active epoch governs authorization', () {
      expect(OhacTerminalPhase.active.isAuthorizationFrozen, isFalse);
    });

    test(
        'RECEIVE_PENDING is not frozen: during receive the old epoch still '
        'governs (design §5: during RECEIVE/PENDING old policy governs)', () {
      expect(OhacTerminalPhase.receivePending.isAuthorizationFrozen, isFalse);
    });

    test(
        'ACK_SUBMITTING is frozen: once the atomic candidate commits the old '
        'epoch is no longer usable, so no authorization may occur while the '
        'ack response may still be lost (design §5 step 2)', () {
      expect(OhacTerminalPhase.ackSubmitting.isAuthorizationFrozen, isTrue);
    });

    test(
        'INTEGRITY_LOSS is frozen: no policy governs after an integrity '
        'fault (design §5 step 5 routes faults to INTEGRITY_LOSS and §9 '
        'quarantines the local capability)', () {
      expect(OhacTerminalPhase.integrityLoss.isAuthorizationFrozen, isTrue);
    });
  });

  group('OhacIntegrityClassification', () {
    test('wire values match the design §9 classification table', () {
      expect(OhacIntegrityClassification.authStateMissing.wire,
          'AUTH_STATE_MISSING');
      expect(
          OhacIntegrityClassification.digestMismatch.wire, 'DIGEST_MISMATCH');
      expect(OhacIntegrityClassification.scopeMismatch.wire, 'SCOPE_MISMATCH');
      // §9's table says LOCAL_ROLLBACK; §5.5's prose writes ROLLBACK_DETECTED.
      // The classification table wins, so the wire value is LOCAL_ROLLBACK.
      expect(OhacIntegrityClassification.localRollback.wire, 'LOCAL_ROLLBACK');
      expect(
          OhacIntegrityClassification.ackInconsistent.wire, 'ACK_INCONSISTENT');
      expect(OhacIntegrityClassification.unsupportedSchemaBuild.wire,
          'UNSUPPORTED_SCHEMA_BUILD');
      expect(OhacIntegrityClassification.transportStateMissing.wire,
          'TRANSPORT_STATE_MISSING');
    });

    test('the empty string is the column sentinel meaning no fault', () {
      expect(OhacIntegrityClassification.none.wire, '');
      expect(
          OhacIntegrityClassification.fromWire(''), 
          OhacIntegrityClassification.none);
    });

    test('every classification round-trips and unknown values return null',
        () {
      for (final classification in OhacIntegrityClassification.values) {
        expect(
          OhacIntegrityClassification.fromWire(classification.wire),
          classification,
        );
      }
      expect(OhacIntegrityClassification.fromWire('ROLLBACK_DETECTED'), isNull);
    });
  });

  group('OhacTerminalSnapshot', () {
    test('is a value type: equal fields compare equal', () {
      expect(snapshot(), snapshot());
      expect(
        snapshot(phase: OhacTerminalPhase.receivePending),
        isNot(snapshot()),
      );
    });

    test(
        'hasActiveEpoch requires the documented sentinel PAIR (sequence 0 '
        'AND empty digest): a fully sentinel pair is absent, a present pair '
        'is present, and each half alone is absent', () {
      // Fully present pair.
      expect(
        snapshot(activeSequence: 4, activeDigest: digest(4)).hasActiveEpoch,
        isTrue,
      );
      // Fully sentinel pair.
      expect(
        snapshot(activeSequence: noSequence, activeDigest: noDigest)
            .hasActiveEpoch,
        isFalse,
      );
      // Each half alone: the sentinel is a pair, not a single column value.
      // A real sequence with an empty digest is not a present epoch.
      expect(
        snapshot(activeSequence: 4, activeDigest: noDigest).hasActiveEpoch,
        isFalse,
      );
      // A digest with sequence 0 is not a present epoch either.
      expect(
        snapshot(activeSequence: noSequence, activeDigest: digest(4))
            .hasActiveEpoch,
        isFalse,
      );
    });

    test(
        'hasCandidate requires the documented sentinel PAIR (sequence 0 '
        'AND empty digest): a fully sentinel pair is absent, a present pair '
        'is present, and each half alone is absent', () {
      // Fully present pair.
      expect(
        snapshot(
          candidateSequence: 5,
          candidateDigest: digest(5),
        ).hasCandidate,
        isTrue,
      );
      // Fully sentinel pair.
      expect(
        snapshot(
          candidateSequence: noSequence,
          candidateDigest: noDigest,
        ).hasCandidate,
        isFalse,
      );
      // Each half alone: the sentinel is a pair, not a single column value.
      expect(
        snapshot(
          candidateSequence: 5,
          candidateDigest: noDigest,
        ).hasCandidate,
        isFalse,
      );
      expect(
        snapshot(
          candidateSequence: noSequence,
          candidateDigest: digest(5),
        ).hasCandidate,
        isFalse,
      );
    });
  });

  group('decideEpochReceive (design §5 step 1)', () {
    test('a duplicate sequence+digest against the candidate is a no-op', () {
      final decision = decideEpochReceive(
        snapshot: snapshot(
          activeSequence: 4,
          activeDigest: digest(4),
          candidateSequence: 5,
          candidateDigest: digest(5),
          phase: OhacTerminalPhase.receivePending,
        ),
        epochSequence: '5',
        epochDigest: digest(5),
      );
      expect(decision, isA<OhacReceiveDuplicate>());
    });

    test(
        'the same sequence as the candidate with a different digest is '
        'terminal integrity loss, not a rejection, and the decision names '
        'its §9 classification: a same-sequence digest conflict is '
        'ACK_INCONSISTENT, so the caller applies a code instead of '
        'choosing one', () {
      final decision = decideEpochReceive(
        snapshot: snapshot(
          activeSequence: 4,
          activeDigest: digest(4),
          candidateSequence: 5,
          candidateDigest: digest(5),
          phase: OhacTerminalPhase.receivePending,
        ),
        epochSequence: '5',
        epochDigest: digest(9),
      );
      expect(decision, isA<OhacReceiveIntegrityLoss>());
      expect(
        (decision as OhacReceiveIntegrityLoss).classification,
        OhacIntegrityClassification.ackInconsistent,
      );
    });

    test('an epoch at exactly active + 1 is accepted', () {
      final decision = decideEpochReceive(
        snapshot: snapshot(
          activeSequence: 4,
          activeDigest: digest(4),
        ),
        epochSequence: '5',
        epochDigest: digest(5),
      );
      expect(decision, isA<OhacReceiveAccept>());
    });

    test('the first epoch after a sentinel active pair is accepted', () {
      final decision = decideEpochReceive(
        snapshot: snapshot(
          activeSequence: noSequence,
          activeDigest: noDigest,
        ),
        epochSequence: '1',
        epochDigest: digest(1),
      );
      expect(decision, isA<OhacReceiveAccept>());
    });

    test('a newer-but-not-next sequence is a gap, not a rejection to retry',
        () {
      final error = rejectionOf(decideEpochReceive(
        snapshot: snapshot(
          activeSequence: 4,
          activeDigest: digest(4),
        ),
        epochSequence: '6',
        epochDigest: digest(6),
      ));
      expect(error.code, OhacErrorCode.sequenceGap);
      expect(error.field, 'sequence');
    });

    test(
        'a redelivery of the epoch the terminal already holds ACTIVE is the '
        'same no-op a candidate redelivery is (design §5 step 1: duplicate '
        'sequence+digest is a no-op), not a rejection', () {
      final decision = decideEpochReceive(
        snapshot: snapshot(
          activeSequence: 4,
          activeDigest: digest(4),
        ),
        epochSequence: '4',
        epochDigest: digest(4),
      );
      expect(decision, isA<OhacReceiveDuplicate>());
    });

    test(
        'a same-sequence digest conflict against the ACTIVE epoch is '
        'terminal integrity loss carrying ACK_INCONSISTENT, not benign '
        'staleness (design §9: a same-sequence digest conflict is '
        'ACK_INCONSISTENT, and §5 step 1 says same sequence/different '
        'digest is terminal integrity loss)', () {
      final decision = decideEpochReceive(
        snapshot: snapshot(
          activeSequence: 4,
          activeDigest: digest(4),
        ),
        epochSequence: '4',
        epochDigest: digest(9),
      );
      expect(decision, isA<OhacReceiveIntegrityLoss>());
      expect(
        (decision as OhacReceiveIntegrityLoss).classification,
        OhacIntegrityClassification.ackInconsistent,
      );
    });

    test('an epoch below the active sequence is stale with the pre-existing code', () {
      final error = rejectionOf(decideEpochReceive(
        snapshot: snapshot(
          activeSequence: 4,
          activeDigest: digest(4),
        ),
        epochSequence: '3',
        epochDigest: digest(3),
      ));
      expect(error.code, OhacErrorCode.sequenceNotNewer);
    });

    test(
        'a non-Int64-canonical sequence is rejected rather than parsed, and '
        'the guard is load-bearing: int.parse happily accepts 017 while '
        'isInt64DecimalString rejects its leading zero', () {
      // Documents non-vacuity: an unguarded int.parse would accept this
      // value, so the machine's rejection below proves the guard is real.
      expect(int.parse('017'), 17);
      expect(isInt64DecimalString('017'), isFalse);

      final error = rejectionOf(decideEpochReceive(
        snapshot: snapshot(
          activeSequence: 4,
          activeDigest: digest(4),
        ),
        epochSequence: '017',
        epochDigest: digest(17),
      ));
      expect(error.code, OhacErrorCode.invalidField);
      expect(error.field, 'sequence');
    });

    test(
        'an over-Int64 sequence is rejected rather than wrapped: the guard '
        'refuses it before any arithmetic runs', () {
      final error = rejectionOf(decideEpochReceive(
        snapshot: snapshot(
          activeSequence: 9223372036854775807,
          activeDigest: digest(9223372036854775807),
        ),
        epochSequence: '9223372036854775808',
        epochDigest: digest(0),
      ));
      expect(error.code, OhacErrorCode.invalidField);
      expect(error.field, 'sequence');
    });

    test('the maximum Int64 sequence is accepted when it is exactly next', () {
      final decision = decideEpochReceive(
        snapshot: snapshot(
          activeSequence: 9223372036854775806,
          activeDigest: digest(9223372036854775806),
        ),
        epochSequence: '9223372036854775807',
        epochDigest: digest(9223372036854775807),
      );
      expect(decision, isA<OhacReceiveAccept>());
    });
  });

  group('decideReconciliation (design §5.5)', () {
    test(
        'below the floor with a candidate matching the floor pair exactly '
        'retries the acknowledgement', () {
      final decision = decideReconciliation(
        snapshot: snapshot(
          phase: OhacTerminalPhase.receivePending,
          activeSequence: 3,
          activeDigest: digest(3),
          candidateSequence: 4,
          candidateDigest: digest(4),
        ),
        serverFloorSequence: 4,
        serverFloorDigest: digest(4),
      );
      expect(decision, isA<OhacRetryAcknowledgement>());
    });

    test(
        'below the floor with anything other than the matching candidate is '
        'integrity loss classified LOCAL_ROLLBACK: the local state cannot '
        'produce that floor', () {
      final decision = decideReconciliation(
        snapshot: snapshot(
          phase: OhacTerminalPhase.active,
          activeSequence: 3,
          activeDigest: digest(3),
          candidateSequence: noSequence,
          candidateDigest: noDigest,
        ),
        serverFloorSequence: 4,
        serverFloorDigest: digest(4),
      );
      expect(decision, isA<OhacReconciliationIntegrityLoss>());
      expect(
        (decision as OhacReconciliationIntegrityLoss).classification,
        OhacIntegrityClassification.localRollback,
      );
    });

    test(
        'below the floor with a wrong candidate is also LOCAL_ROLLBACK, not '
        'a retry', () {
      final decision = decideReconciliation(
        snapshot: snapshot(
          phase: OhacTerminalPhase.active,
          activeSequence: 3,
          activeDigest: digest(3),
          candidateSequence: 5,
          candidateDigest: digest(5),
        ),
        serverFloorSequence: 4,
        serverFloorDigest: digest(4),
      );
      expect(decision, isA<OhacReconciliationIntegrityLoss>());
    });

    test(
        'above the floor while claiming a confirmed active state is '
        'inconsistent and fails closed with ACK_INCONSISTENT', () {
      final decision = decideReconciliation(
        snapshot: snapshot(
          phase: OhacTerminalPhase.active,
          activeSequence: 5,
          activeDigest: digest(5),
        ),
        serverFloorSequence: 4,
        serverFloorDigest: digest(4),
      );
      expect(decision, isA<OhacReconciliationFailClosed>());
      expect(
        (decision as OhacReconciliationFailClosed).classification,
        OhacIntegrityClassification.ackInconsistent,
      );
    });

    test(
        'the same sequence with a different digest than the floor is a '
        'same-sequence digest conflict and fails closed with '
        'ACK_INCONSISTENT (design §9 ACK_INCONSISTENT detection)', () {
      final decision = decideReconciliation(
        snapshot: snapshot(
          phase: OhacTerminalPhase.active,
          activeSequence: 4,
          activeDigest: digest(9),
        ),
        serverFloorSequence: 4,
        serverFloorDigest: digest(4),
      );
      expect(decision, isA<OhacReconciliationFailClosed>());
    });

    test(
        'an equal floor with a pending never-submitted candidate discards the '
        'candidate while the active pair stays intact', () {
      final decision = decideReconciliation(
        snapshot: snapshot(
          phase: OhacTerminalPhase.receivePending,
          activeSequence: 4,
          activeDigest: digest(4),
          candidateSequence: 5,
          candidateDigest: digest(5),
        ),
        serverFloorSequence: 4,
        serverFloorDigest: digest(4),
      );
      expect(decision, isA<OhacDiscardPendingCandidate>());
    });

    test(
        'the discard refuses when the active pair is the sentinel: a '
        'candidate without an active epoch to fall back on is state loss, '
        'not a discardable pending', () {
      final decision = decideReconciliation(
        snapshot: snapshot(
          phase: OhacTerminalPhase.receivePending,
          activeSequence: noSequence,
          activeDigest: noDigest,
          candidateSequence: 5,
          candidateDigest: digest(5),
        ),
        serverFloorSequence: 0,
        serverFloorDigest: 'GENESIS',
      );
      expect(decision, isNot(isA<OhacDiscardPendingCandidate>()));
      expect(decision, isA<OhacReconciliationIntegrityLoss>());
      expect(
        (decision as OhacReconciliationIntegrityLoss).classification,
        OhacIntegrityClassification.authStateMissing,
      );
    });

    test(
        'an equal floor with an intact candidate that was already submitted '
        'has nothing to reconcile: the ack path owns it', () {
      final decision = decideReconciliation(
        snapshot: snapshot(
          phase: OhacTerminalPhase.ackSubmitting,
          activeSequence: 4,
          activeDigest: digest(4),
          candidateSequence: 5,
          candidateDigest: digest(5),
        ),
        serverFloorSequence: 4,
        serverFloorDigest: digest(4),
      );
      expect(decision, isA<OhacNothingToReconcile>());
    });

    test('an unenrolled terminal at the genesis floor has nothing to reconcile',
        () {
      final decision = decideReconciliation(
        snapshot: snapshot(
          phase: OhacTerminalPhase.active,
          activeSequence: noSequence,
          activeDigest: noDigest,
          candidateSequence: noSequence,
          candidateDigest: noDigest,
        ),
        serverFloorSequence: 0,
        serverFloorDigest: 'GENESIS',
      );
      expect(decision, isA<OhacNothingToReconcile>());
    });
  });

  group(
      'design §3 boundary: the machine stays framework-free (§3 closes with '
      '"Domain policy does not import NestJS, TypeORM, Dio, Floor, or '
      'bcrypt")', () {
    test(
        'terminal_state_machine.dart imports no Floor, TypeORM, SQLite, '
        'Dio, bcrypt, path_provider, secure storage, or entity file', () {
      final source = resolveTerminalStateMachineSource().readAsStringSync();
      final imports = RegExp(
        r"^import\s+'([^']+)';",
        multiLine: true,
      )
          .allMatches(source)
          .map((match) => match.group(1)!)
          .toList();

      // Non-vacuous: the regex must have matched the machine's real imports,
      // otherwise the assertions below would pass against nothing.
      expect(imports, isNotEmpty);

      for (final import in imports) {
        for (final forbidden in [
          'floor',
          'typeorm',
          'sqflite',
          'dio',
          'bcrypt',
          'path_provider',
          'secure_storage',
        ]) {
          expect(import, isNot(contains(forbidden)),
              reason: 'forbidden import: $import');
        }
        expect(import, isNot(contains('entity')),
            reason: 'no entity file may be imported: $import');
      }
    });
  });
}
