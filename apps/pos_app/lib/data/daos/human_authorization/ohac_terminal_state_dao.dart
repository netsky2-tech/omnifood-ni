import 'package:floor/floor.dart';
import '../../models/human_authorization/ohac_delivery_entities.dart';

/// Access to `human_auth_terminal_state`, the terminal's mutable delivery
/// state.
///
/// A second insert for the same terminal aborts rather than silently
/// overwriting a state that the revision compare-and-set protects.
///
/// Transitions are compare-and-sets named after the design's transitions
/// (design §5): each one writes only the fields that transition owns, keeps
/// `revision = revision + 1` inside SQL, and returns the affected row count,
/// where `0` means the expected revision did not match and nothing changed —
/// including no partial application of the transition's own fields.
@dao
abstract class OhacTerminalStateDao {
  @Query(
    'SELECT * FROM human_auth_terminal_state '
    'WHERE tenant_id = :tenantId AND terminal_id = :terminalId LIMIT 1',
  )
  Future<OhacTerminalStateEntity?> findTerminalState(
    String tenantId,
    String terminalId,
  );

  @Insert(onConflict: OnConflictStrategy.abort)
  Future<void> insertTerminalState(OhacTerminalStateEntity state);

  /// Receive: the terminal takes the pending state and records the received
  /// candidate pair plus the four negotiated facts. This is the widest
  /// transition; it owns no other field.
  @Query(
    'UPDATE human_auth_terminal_state '
    'SET state = \'RECEIVE_PENDING\', '
    'candidate_sequence = :candidateSequence, '
    'candidate_digest = :candidateDigest, '
    'negotiated_pos_build = :negotiatedPosBuild, '
    'negotiated_backend_build = :negotiatedBackendBuild, '
    'negotiated_policy_schema = :negotiatedPolicySchema, '
    'negotiated_assertion_schema = :negotiatedAssertionSchema, '
    'revision = revision + 1, '
    'updated_at = :newUpdatedAt '
    'WHERE tenant_id = :tenantId AND terminal_id = :terminalId '
    'AND revision = :expectedRevision',
  )
  Future<int?> receiveEpoch(
    String tenantId,
    String terminalId,
    int expectedRevision,
    int candidateSequence,
    String candidateDigest,
    String negotiatedPosBuild,
    String negotiatedBackendBuild,
    String negotiatedPolicySchema,
    String negotiatedAssertionSchema,
    String newUpdatedAt,
  );

  /// Submit: the acknowledgement is being sent; the candidate is untouched.
  @Query(
    'UPDATE human_auth_terminal_state '
    'SET state = \'ACK_SUBMITTING\', '
    'revision = revision + 1, '
    'updated_at = :newUpdatedAt '
    'WHERE tenant_id = :tenantId AND terminal_id = :terminalId '
    'AND revision = :expectedRevision',
  )
  Future<int?> submitAcknowledgement(
    String tenantId,
    String terminalId,
    int expectedRevision,
    String newUpdatedAt,
  );

  /// Confirm: the candidate is promoted to active and cleared back to its
  /// sentinels (`0` / `''`, design §4.2); the state becomes active.
  @Query(
    'UPDATE human_auth_terminal_state '
    'SET state = \'ACTIVE\', '
    'active_sequence = candidate_sequence, '
    'active_digest = candidate_digest, '
    'candidate_sequence = 0, '
    "candidate_digest = '', "
    'revision = revision + 1, '
    'updated_at = :newUpdatedAt '
    'WHERE tenant_id = :tenantId AND terminal_id = :terminalId '
    'AND revision = :expectedRevision',
  )
  Future<int?> confirmAcknowledgement(
    String tenantId,
    String terminalId,
    int expectedRevision,
    String newUpdatedAt,
  );

  /// Record floor: the server-confirmed position, both halves together.
  @Query(
    'UPDATE human_auth_terminal_state '
    'SET server_floor_sequence = :serverFloorSequence, '
    'server_floor_digest = :serverFloorDigest, '
    'revision = revision + 1, '
    'updated_at = :newUpdatedAt '
    'WHERE tenant_id = :tenantId AND terminal_id = :terminalId '
    'AND revision = :expectedRevision',
  )
  Future<int?> recordServerFloor(
    String tenantId,
    String terminalId,
    int expectedRevision,
    int serverFloorSequence,
    String serverFloorDigest,
    String newUpdatedAt,
  );

  /// Mark integrity loss: the loss state and the classification together.
  @Query(
    'UPDATE human_auth_terminal_state '
    'SET state = \'INTEGRITY_LOSS\', '
    'integrity_classification = :integrityClassification, '
    'revision = revision + 1, '
    'updated_at = :newUpdatedAt '
    'WHERE tenant_id = :tenantId AND terminal_id = :terminalId '
    'AND revision = :expectedRevision',
  )
  Future<int?> markIntegrityLoss(
    String tenantId,
    String terminalId,
    int expectedRevision,
    String integrityClassification,
    String newUpdatedAt,
  );
}
