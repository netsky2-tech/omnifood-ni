import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/models/human_authorization/terminal_state_machine.dart';
import 'package:pos_app/domain/security/ohac_integrity_classifier.dart';

/// Unit U5b (design §9): the integrity classifier is the SINGLE mapping from
/// an observed condition to a §9 classification. Every recognized condition
/// maps to exactly its §9 class; an unknown condition maps to the closest
/// fail-closed class (`ACK_INCONSISTENT`, the local/server-disagreement
/// family: quarantine plus security investigation) and NEVER to `none`.
void main() {
  group('classifyOhacIntegrity maps each condition to its §9 class', () {
    test('AUTH_STATE_MISSING', () {
      final classification = classifyOhacIntegrity(
        const OhacConditionAuthStateMissing('candidate_pair_missing'),
      );
      expect(classification, OhacIntegrityClassification.authStateMissing);
      expect(classification.wire, 'AUTH_STATE_MISSING');
    });

    test('DIGEST_MISMATCH', () {
      final classification = classifyOhacIntegrity(
        const OhacConditionDigestMismatch('sibling_pair_mismatch'),
      );
      expect(classification, OhacIntegrityClassification.digestMismatch);
      expect(classification.wire, 'DIGEST_MISMATCH');
    });

    test('SCOPE_MISMATCH', () {
      final classification = classifyOhacIntegrity(
        const OhacConditionScopeMismatch('credential_scope'),
      );
      expect(classification, OhacIntegrityClassification.scopeMismatch);
      expect(classification.wire, 'SCOPE_MISMATCH');
    });

    test('LOCAL_ROLLBACK', () {
      final classification = classifyOhacIntegrity(
        const OhacConditionLocalRollback('candidate_not_intact'),
      );
      expect(classification, OhacIntegrityClassification.localRollback);
      expect(classification.wire, 'LOCAL_ROLLBACK');
    });

    test('ACK_INCONSISTENT', () {
      final classification = classifyOhacIntegrity(
        const OhacConditionAckInconsistent('ack_response_mismatch'),
      );
      expect(classification, OhacIntegrityClassification.ackInconsistent);
      expect(classification.wire, 'ACK_INCONSISTENT');
    });

    test('UNSUPPORTED_SCHEMA_BUILD', () {
      final classification = classifyOhacIntegrity(
        const OhacConditionUnsupportedSchemaBuild('schema_unsupported'),
      );
      expect(
        classification,
        OhacIntegrityClassification.unsupportedSchemaBuild,
      );
      expect(classification.wire, 'UNSUPPORTED_SCHEMA_BUILD');
    });

    test('TRANSPORT_STATE_MISSING', () {
      final classification = classifyOhacIntegrity(
        const OhacConditionTransportStateMissing('credential_absent'),
      );
      expect(classification, OhacIntegrityClassification.transportStateMissing);
      expect(classification.wire, 'TRANSPORT_STATE_MISSING');
    });
  });

  group('fail-closed default (no fallback to none)', () {
    test('an unknown condition maps to the closest fail-closed class', () {
      final classification = classifyOhacIntegrity(
        const OhacConditionUnknown('SOMETHING_NEW'),
      );
      expect(classification, isNot(OhacIntegrityClassification.none));
      expect(classification, OhacIntegrityClassification.ackInconsistent);
    });

    test('an unknown condition never resolves to none for any input', () {
      for (final detail in const ['', 'x', 'NONE', 'null', '0']) {
        final classification = classifyOhacIntegrity(
          OhacConditionUnknown(detail),
        );
        expect(
          classification,
          isNot(OhacIntegrityClassification.none),
          reason: 'detail=$detail must fail closed',
        );
      }
    });
  });

  group('classifyOhacAckRejection (backend 409 resultCodes)', () {
    test('claim-conflict codes classify ACK_INCONSISTENT', () {
      for (final code in const [
        'DIGEST_MISMATCH',
        'CHAIN_MISMATCH',
        'UNKNOWN_EPOCH',
        'IDEMPOTENCY_CONFLICT',
        'SEQUENCE_GAP',
      ]) {
        final verdict = classifyOhacAckRejection(code);
        expect(verdict, isA<OhacAckIntegrityLoss>(), reason: code);
        final loss = verdict as OhacAckIntegrityLoss;
        expect(
          loss.classification,
          OhacIntegrityClassification.ackInconsistent,
          reason: code,
        );
      }
    });

    test(
      'STALE_SEQUENCE classifies LOCAL_ROLLBACK (§9 below-floor family)',
      () {
        final verdict = classifyOhacAckRejection('STALE_SEQUENCE');
        expect(verdict, isA<OhacAckIntegrityLoss>());
        expect(
          (verdict as OhacAckIntegrityLoss).classification,
          OhacIntegrityClassification.localRollback,
        );
      },
    );

    test('UNAVAILABLE stays indeterminate (retry the identical ack)', () {
      expect(
        classifyOhacAckRejection('UNAVAILABLE'),
        isA<OhacAckIndeterminate>(),
      );
    });

    test('unmapped and null codes fail closed (never indeterminate)', () {
      for (final code in const [null, '', 'SOMETHING_ELSE', 'weird code']) {
        final verdict = classifyOhacAckRejection(code);
        expect(verdict, isA<OhacAckIntegrityLoss>(), reason: '$code');
        final loss = verdict as OhacAckIntegrityLoss;
        expect(
          loss.classification,
          isNot(OhacIntegrityClassification.none),
          reason: '$code',
        );
        expect(
          loss.classification,
          OhacIntegrityClassification.ackInconsistent,
          reason: 'unmapped rejection verdict is never worth a retry',
        );
        expect(loss.condition, isA<OhacConditionUnknown>());
      }
    });
  });
}
