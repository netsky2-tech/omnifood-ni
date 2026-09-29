import 'package:pos_app/data/models/human_authorization/error_codes.dart';
import 'package:pos_app/data/models/human_authorization/ohac_delivery_entities.dart';
import 'package:pos_app/data/models/human_authorization/staff_policy_epoch_v1.dart';
import 'package:pos_app/data/models/human_authorization/terminal_state_machine.dart';

/// Maps the persisted terminal state onto the framework-free snapshot the
/// receive decisions operate on (design §4.2, §5).
///
/// This file lives in the data layer on purpose. `terminal_state_machine.dart`
/// must not import Floor (design §3 closes with "domain policy does not import
/// NestJS, TypeORM, Dio, Floor, or bcrypt"), so the Floor entity cannot travel
/// across that boundary; the direction here is entity -> domain, which is the
/// one that is allowed.
///
/// An unrecognised wire `state` fails closed by throwing rather than defaulting.
/// The entity's own doc comment lists `ACK_CONFIRMED`, which the machine
/// deliberately cannot represent, and an unknown value treated as `ACTIVE` would
/// let a terminal authorise under a state nobody defined.
OhacTerminalSnapshot ohacTerminalSnapshotFromEntity(
  OhacTerminalStateEntity state,
) {
  final phase = OhacTerminalPhase.fromWire(state.state);
  if (phase == null) {
    throw StateError('Unknown OHAC terminal state: ${state.state}');
  }
  return OhacTerminalSnapshot(
    phase: phase,
    activeSequence: state.activeSequence,
    activeDigest: state.activeDigest,
    candidateSequence: state.candidateSequence,
    candidateDigest: state.candidateDigest,
    serverFloorSequence: state.serverFloorSequence,
    serverFloorDigest: state.serverFloorDigest,
    negotiatedPosBuild: state.negotiatedPosBuild,
    negotiatedBackendBuild: state.negotiatedBackendBuild,
    negotiatedPolicySchema: state.negotiatedPolicySchema,
    negotiatedAssertionSchema: state.negotiatedAssertionSchema,
    localAuthorizationSequence: state.localAuthorizationSequence,
  );
}

/// Evaluates a delivered epoch against the persisted terminal state, in design
/// §5 step 1's order: acceptance first, then the receive decision.
///
/// The two calls this composes were both written before any caller existed, and
/// they must read the **same** head. `validateEpochAcceptance` takes the head as
/// explicit input (`acceptedSequence` / `acceptedDigest`); `decideEpochReceive`
/// reads it from the snapshot. Handing anything other than the snapshot's own
/// active head to the first call would accept an epoch whose chain continuation
/// does not match the epoch the terminal actually asserts under — for example a
/// terminal at sequence 7 accepting an epoch that claims to follow sequence 0.
/// B2b recorded that misalignment as unproven because no caller existed; this
/// function is the caller, and a caller cannot reach either check without going
/// through it.
///
/// `supportedPosBuild` is this terminal's own negotiated build (design decision
/// 30: read from the package version at runtime), not the last-negotiated build
/// stored on the row: the check asks whether the epoch targets the build we are
/// running now.
OhacReceiveDecision evaluateDeliveredEpoch({
  required StaffPolicyEpochV1 epoch,
  required OhacTerminalStateEntity state,
  required String supportedPosBuild,
}) {
  final snapshot = ohacTerminalSnapshotFromEntity(state);
  final validated = validateEpochAcceptance(
    OhacEpochAcceptanceInput(
      epoch: epoch,
      expectedTenantId: state.tenantId,
      expectedTerminalId: state.terminalId,
      acceptedSequence: snapshot.activeSequence.toString(),
      acceptedDigest: snapshot.activeDigest,
      supportedPosBuild: supportedPosBuild,
    ),
  );
  if (validated is OhacFailure<StaffPolicyEpochV1>) {
    return OhacReceiveReject(validated.error);
  }
  return decideEpochReceive(
    snapshot: snapshot,
    epochSequence: epoch.sequence,
    epochDigest: epoch.digest,
  );
}
