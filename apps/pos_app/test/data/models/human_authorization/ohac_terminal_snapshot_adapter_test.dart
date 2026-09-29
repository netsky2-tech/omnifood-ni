import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/models/human_authorization/ohac_delivery_entities.dart';
import 'package:pos_app/data/models/human_authorization/ohac_terminal_snapshot_adapter.dart';
import 'package:pos_app/data/models/human_authorization/staff_policy_epoch_v1.dart';
import 'package:pos_app/data/models/human_authorization/terminal_state_machine.dart';

/// Coverage for the entity -> snapshot adapter (design §4.2, §5) and for the
/// one alignment B2b could not prove because no caller existed: the acceptance
/// head handed to `validateEpochAcceptance` must be the snapshot's own active
/// head, not a constant.
void main() {
  const activeHead =
      'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

  OhacTerminalStateEntity state({
    String tenantId = 'tenant-1',
    String terminalId = 'terminal-1',
    String state = 'ACTIVE',
    int activeSequence = 7,
    String activeDigest = activeHead,
    int candidateSequence = 0,
    String candidateDigest = '',
    int revision = 3,
  }) =>
      OhacTerminalStateEntity(
        tenantId: tenantId,
        terminalId: terminalId,
        state: state,
        activeSequence: activeSequence,
        activeDigest: activeDigest,
        candidateSequence: candidateSequence,
        candidateDigest: candidateDigest,
        serverFloorSequence: 5,
        serverFloorDigest: 'sha256:${'b' * 64}',
        negotiatedPosBuild: '1.0.0+1',
        negotiatedBackendBuild: 'backend-1',
        negotiatedPolicySchema: 'ohac.staff-policy-epoch.v1',
        negotiatedAssertionSchema: 'ohac.assertion.v1',
        integrityClassification: 'ACK_INCONSISTENT',
        localAuthorizationSequence: 11,
        revision: revision,
        updatedAt: '2026-01-03T00:00:00.000Z',
      );

  StaffPolicyEpochV1 epoch({
    String sequence = '8',
    String previousSequence = '7',
    String previousDigest = activeHead,
    String tenantId = 'tenant-1',
    String targetTerminalId = 'terminal-1',
    String targetPosBuild = '1.0.0+1',
  }) =>
      StaffPolicyEpochV1(
        schema: staffPolicyEpochV1Schema,
        tenantId: tenantId,
        targetTerminalId: targetTerminalId,
        sequence: sequence,
        previousSequence: previousSequence,
        previousDigest: previousDigest,
        publisherBackendBuild: 'backend-1',
        targetPosBuild: targetPosBuild,
        minimumAssertionSchema: 'ohac.assertion.v1',
        policyEntries: const [],
        digest: 'sha256:${'c' * 64}',
      );

  group('ohacTerminalSnapshotFromEntity', () {
    test('carries every persisted field into the snapshot', () {
      final snapshot = ohacTerminalSnapshotFromEntity(state());

      expect(snapshot.phase, OhacTerminalPhase.active);
      expect(snapshot.activeSequence, 7);
      expect(snapshot.activeDigest, activeHead);
      expect(snapshot.candidateSequence, 0);
      expect(snapshot.candidateDigest, '');
      expect(snapshot.serverFloorSequence, 5);
      expect(snapshot.serverFloorDigest, 'sha256:${'b' * 64}');
      expect(snapshot.negotiatedPosBuild, '1.0.0+1');
      expect(snapshot.negotiatedBackendBuild, 'backend-1');
      expect(snapshot.negotiatedPolicySchema, 'ohac.staff-policy-epoch.v1');
      expect(snapshot.negotiatedAssertionSchema, 'ohac.assertion.v1');
      expect(snapshot.localAuthorizationSequence, 11);
    });

    test('every persisted wire state resolves to a phase, and an unknown '
        'wire value fails closed instead of defaulting', () {
      for (final phase in OhacTerminalPhase.values) {
        expect(
          ohacTerminalSnapshotFromEntity(state(state: phase.wire)).phase,
          phase,
        );
      }

      expect(
        () => ohacTerminalSnapshotFromEntity(state(state: 'ACK_CONFIRMED')),
        throwsA(isA<StateError>()),
      );
      expect(
        () => ohacTerminalSnapshotFromEntity(state(state: 'UNENROLLED')),
        throwsA(isA<StateError>()),
      );
    });

    test('the sentinel pair is preserved, so a fresh terminal reports no '
        'active epoch and no candidate', () {
      final fresh = state(
        activeSequence: 0,
        activeDigest: 'GENESIS',
        candidateSequence: 0,
        candidateDigest: '',
      );

      final snapshot = ohacTerminalSnapshotFromEntity(fresh);

      expect(snapshot.hasActiveEpoch, isFalse);
      expect(snapshot.hasCandidate, isFalse);
    });
  });

  group('evaluateDeliveredEpoch alignment', () {
    test('the acceptance head comes from the persisted snapshot, so an epoch '
        'chaining off a non-sentinel active sequence is accepted', () {
      // B2b left this unproven because no caller existed: if the caller passed
      // the sentinel instead of the snapshot's head, an epoch chaining off 7
      // would be rejected as a broken previous-digest.
      final decision = evaluateDeliveredEpoch(
        epoch: epoch(),
        state: state(),
        supportedPosBuild: '1.0.0+1',
      );

      expect(decision, isA<OhacReceiveAccept>());
    });

    test('the same epoch is rejected when the head it chains off does not '
        'match the persisted one, which is what alignment prevents', () {
      final decision = evaluateDeliveredEpoch(
        epoch: epoch(previousSequence: '0', previousDigest: 'GENESIS'),
        state: state(),
        supportedPosBuild: '1.0.0+1',
      );

      expect(decision, isA<OhacReceiveReject>());
    });

    test('a fresh terminal at the sentinel head accepts epoch 1', () {
      final fresh = state(
        activeSequence: 0,
        activeDigest: 'GENESIS',
      );

      final decision = evaluateDeliveredEpoch(
        epoch: epoch(
          sequence: '1',
          previousSequence: '0',
          previousDigest: 'GENESIS',
        ),
        state: fresh,
        supportedPosBuild: '1.0.0+1',
      );

      expect(decision, isA<OhacReceiveAccept>());
    });

    test('a scope mismatch surfaces as a receive rejection rather than '
        'throwing', () {
      final decision = evaluateDeliveredEpoch(
        epoch: epoch(tenantId: 'tenant-other'),
        state: state(),
        supportedPosBuild: '1.0.0+1',
      );

      expect(decision, isA<OhacReceiveReject>());
      expect(
        (decision as OhacReceiveReject).error.code,
        'OHAC_TENANT_SCOPE_MISMATCH',
      );
    });

    test('an unsupported build pair fails closed', () {
      final decision = evaluateDeliveredEpoch(
        epoch: epoch(targetPosBuild: '9.9.9+9'),
        state: state(),
        supportedPosBuild: '1.0.0+1',
      );

      expect(decision, isA<OhacReceiveReject>());
      expect(
        (decision as OhacReceiveReject).error.code,
        'OHAC_UNSUPPORTED_BUILD_PAIR',
      );
    });

    test('a redelivery of the candidate already on record is a duplicate '
        'no-op, not a re-accept', () {
      final pending = state(
        state: 'RECEIVE_PENDING',
        candidateSequence: 8,
        candidateDigest: 'sha256:${'c' * 64}',
      );

      final decision = evaluateDeliveredEpoch(
        epoch: epoch(),
        state: pending,
        supportedPosBuild: '1.0.0+1',
      );

      expect(decision, isA<OhacReceiveDuplicate>());
    });
  });
}
