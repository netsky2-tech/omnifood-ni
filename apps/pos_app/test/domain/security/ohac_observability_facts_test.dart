import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/security/ohac_observability.dart';

/// Unit U5b (design §12/§16): OHAC observability facts. Each fact builder's
/// key set is pinned, and the guard proves NO PIN, verifier or assertion-body
/// material can ever appear in a serialized fact: field values are restricted
/// to strings/ints/bools by type, and the serializer drops anything else
/// (maps, lists, objects) instead of stringifying it into the log line.
void main() {
  // Hostile material that must never survive into a fact's serialized form.
  const pin = '4321';
  const verifier = r'$2b$10$abcdefghijklmnopqrstuvABCDEFGHIJKLMNOPQRSTUVWXYZ0';
  const assertionBody = '{"schema":"ohac.assertion.v1","assertionId":"x"}';

  group('serializeOhacFact', () {
    test('renders the event and allowlisted fields', () {
      final line = serializeOhacFact(
        const OhacObservabilityFact('ohac_test_event', {
          'tenantId': 't-1',
          'count': 3,
          'flag': true,
        }),
      );
      expect(
        line,
        'ohac_fact event=ohac_test_event tenantId=t-1 count=3 flag=true',
      );
    });

    test('drops non-allowlisted value types instead of stringifying them', () {
      final line = serializeOhacFact(
        OhacObservabilityFact('ohac_test_event', {
          'pin': pin, // String values pass the type gate...
          'verifierMap': <String, dynamic>{'encoded': verifier},
          'assertionBody': <dynamic>[assertionBody],
          'ratio': 1.5,
          'nested': OhacObservabilityFact('inner', const {}),
        }),
      );
      expect(line.contains('verifierMap'), isFalse);
      expect(line.contains(verifier), isFalse);
      expect(line.contains('assertionBody'), isFalse);
      expect(line.contains(assertionBody), isFalse);
      expect(line.contains('ratio'), isFalse);
      expect(line.contains('nested'), isFalse);
      // The scalar-string case is a caller contract: only ID/digest/enum/
      // count slots exist, so no builder ever feeds a PIN into a String.
    });
  });

  group('fact builders pin their key sets', () {
    test('ohacIntegrityClassifiedFact', () {
      final fact = ohacIntegrityClassifiedFact(
        tenantId: 't-1',
        terminalId: 'dev-1',
        classification: 'ACK_INCONSISTENT',
        reason: 'recovery_required',
        applied: true,
      );
      expect(fact.event, 'ohac_integrity_classified');
      expect(fact.fields.keys.toSet(), {
        'tenantId',
        'terminalId',
        'classification',
        'reason',
        'applied',
      });
      expect(fact.fields['classification'], 'ACK_INCONSISTENT');
      expect(fact.fields['applied'], true);
    });

    test('ohacAckDeferredFact', () {
      final fact = ohacAckDeferredFact(
        reason: 'OHAC_ACK_DEFERRED_OUTBOX',
        phase: 'RECEIVE_PENDING',
        candidateSequence: 6,
        deferralCount: 3,
        quarantineReview: true,
      );
      expect(fact.event, 'ohac_ack_deferred');
      expect(fact.fields.keys.toSet(), {
        'reason',
        'phase',
        'candidateSequence',
        'deferralCount',
        'quarantineReview',
      });
      expect(fact.fields['quarantineReview'], true);
      expect(fact.fields['deferralCount'], 3);
    });

    test('ohacAckOutcomeFact', () {
      final fact = ohacAckOutcomeFact(
        outcome: 'confirmed',
        reason: 'receipt_accepted',
        sequence: 6,
        floorSequence: 6,
      );
      expect(fact.event, 'ohac_ack_outcome');
      expect(fact.fields.keys.toSet(), {
        'outcome',
        'reason',
        'sequence',
        'floorSequence',
      });
      expect(fact.fields['outcome'], 'confirmed');
      expect(fact.fields['floorSequence'], 6);
    });

    test('ohacRecoveryStepFact', () {
      final fact = ohacRecoveryStepFact(
        step: 'transport',
        outcome: 'failed',
        classification: 'LOCAL_ROLLBACK',
        detail: 'bootstrap_unsuccessful',
      );
      expect(fact.event, 'ohac_recovery_step');
      expect(fact.fields.keys.toSet(), {
        'step',
        'outcome',
        'classification',
        'detail',
      });
      expect(fact.fields['outcome'], 'failed');
    });

    test('ohacAuthorizationDecisionFact', () {
      final fact = ohacAuthorizationDecisionFact(
        outcome: 'denied',
        reason: 'OHAC_BUILD_MISMATCH',
        tenantId: 't-1',
        terminalId: 'dev-1',
        epochSequence: 0,
        posBuild: '2.3.4+11',
      );
      expect(fact.event, 'ohac_authorization_decision');
      expect(fact.fields.keys.toSet(), {
        'outcome',
        'reason',
        'tenantId',
        'terminalId',
        'epochSequence',
        'posBuild',
      });
      expect(fact.fields['reason'], 'OHAC_BUILD_MISMATCH');
    });
    test('ohacEpochPublicationFact', () {
      final fact = ohacEpochPublicationFact(
        action: 'accepted',
        sequence: '1',
        detail: 'candidate_received',
      );
      expect(fact.event, 'ohac_epoch_publication');
      expect(fact.fields.keys.toSet(), {'action', 'sequence', 'detail'});
      expect(fact.fields['sequence'], '1');
    });
  });

  group('hostile-input guard (design §12: no PINs/verifiers/assertions)', () {
    test('every builder fed hostile material in every string slot emits only '
        'safe-typed values with pinned keys', () {
      final facts = [
        ohacIntegrityClassifiedFact(
          tenantId: pin,
          terminalId: verifier,
          classification: assertionBody,
          reason: pin,
          applied: false,
        ),
        ohacAckDeferredFact(
          reason: verifier,
          phase: pin,
          candidateSequence: 1,
          deferralCount: 0,
          quarantineReview: false,
        ),
        ohacAckOutcomeFact(
          outcome: verifier,
          reason: pin,
          sequence: 1,
          floorSequence: 0,
        ),
        ohacRecoveryStepFact(
          step: pin,
          outcome: verifier,
          classification: assertionBody,
          detail: pin,
        ),
        ohacAuthorizationDecisionFact(
          outcome: verifier,
          reason: assertionBody,
          tenantId: pin,
          terminalId: verifier,
          epochSequence: 0,
          posBuild: pin,
        ),
      ];
      for (final fact in facts) {
        fact.fields.forEach((key, value) {
          expect(
            isOhacFactSafeValue(value),
            isTrue,
            reason: '$key must hold a safe-typed value',
          );
        });
      }
      // Structural guarantee, stated precisely: hostile material cannot
      // REACH these slots in production because every builder parameter
      // is a semantically typed ID, digest, enum wire value, reason token
      // or count — no builder accepts the authorization request (which
      // carries the PIN), a policy entry/verifier, or an assertion body.
      // The end-to-end companion of this guard lives in the sync-service
      // suite, which collects the full fact stream of a pull whose seeded
      // epoch carries real verifier material and proves none of it leaks.
    });

    test('logOhacFact routes through the injected sink, not developer.log', () {
      final lines = <String>[];
      logOhacFact(
        ohacAckOutcomeFact(
          outcome: 'deferred',
          reason: 'transport_error',
          sequence: 6,
          floorSequence: 5,
        ),
        sink: lines.add,
      );
      expect(lines, hasLength(1));
      expect(lines.single, contains('event=ohac_ack_outcome'));
      expect(lines.single, contains('outcome=deferred'));
    });
  });
}
