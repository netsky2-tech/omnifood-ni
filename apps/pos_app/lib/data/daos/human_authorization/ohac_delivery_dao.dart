import 'package:floor/floor.dart';
import '../../models/human_authorization/ohac_delivery_entities.dart';

/// Consolidated DAO for the OHAC local delivery tables.
///
/// Grouping: the immutable policy tables (`human_auth_policy_epochs`,
/// `human_auth_policy_entries`), the mutable delivery state
/// (`human_auth_terminal_state`, `human_auth_attempt_state`), and the
/// append-only event log (`human_auth_local_events`).
///
/// A second terminal-state insert aborts rather than overwriting a state the
/// compare-and-set protects.
///
/// Transitions are compare-and-sets named after the design's transitions
/// (design §5): each one writes only the fields that transition owns.
///
/// The append-only tables declare no update and no delete at all: an epoch,
/// an entry and a local event are never rewritten in place, which the schema
/// enforces with triggers.
@dao
abstract class OhacDeliveryDao {
  // ---------------------------------------------------------------------------
  // Immutable policy tables: epochs and entries (append-only).
  // ---------------------------------------------------------------------------

  /// Append-only access to `human_auth_policy_epochs`.
  ///
  /// An epoch is what the backend signed; it is never rewritten in place, which
  /// the schema enforces with triggers. This DAO deliberately declares no
  /// `@Update`, no `@Delete` and no `DELETE` query.
  @Insert(onConflict: OnConflictStrategy.abort)
  Future<void> insertEpoch(OhacPolicyEpochEntity epoch);

  @Query(
    'SELECT * FROM human_auth_policy_epochs '
    'WHERE tenant_id = :tenantId AND terminal_id = :terminalId AND sequence = :sequence '
    'LIMIT 1',
  )
  Future<OhacPolicyEpochEntity?> findEpoch(
    String tenantId,
    String terminalId,
    int sequence,
  );

  @Query(
    'SELECT * FROM human_auth_policy_epochs '
    'WHERE tenant_id = :tenantId AND terminal_id = :terminalId '
    'ORDER BY sequence DESC LIMIT 1',
  )
  Future<OhacPolicyEpochEntity?> findNewestEpoch(
    String tenantId,
    String terminalId,
  );

  /// The contiguous-delivery read: every epoch after a known sequence,
  /// ascending, so the terminal can walk the tenant-global chain in order.
  @Query(
    'SELECT * FROM human_auth_policy_epochs '
    'WHERE tenant_id = :tenantId AND terminal_id = :terminalId AND sequence > :sequence '
    'ORDER BY sequence ASC',
  )
  Future<List<OhacPolicyEpochEntity>> findEpochsAfter(
    String tenantId,
    String terminalId,
    int sequence,
  );

  /// Append-only access to `human_auth_policy_entries`, and the only writer of
  /// entry rows.
  ///
  /// An entry is what its epoch says about a user; like the epoch it is never
  /// rewritten in place, which the schema enforces with triggers. This DAO
  /// deliberately declares no `@Update`, no `@Delete` and no `DELETE` query.
  @Insert(onConflict: OnConflictStrategy.abort)
  Future<void> insertEntries(List<OhacPolicyEntryEntity> entries);

  /// Ordered by `user_id` ascending, because the epoch contract sorts entries
  /// by `userId`.
  @Query(
    'SELECT * FROM human_auth_policy_entries '
    'WHERE tenant_id = :tenantId AND terminal_id = :terminalId AND sequence = :sequence '
    'ORDER BY user_id ASC',
  )
  Future<List<OhacPolicyEntryEntity>> findEntries(
    String tenantId,
    String terminalId,
    int sequence,
  );

  /// The per-user lookup the authorization path needs. It resolves through the
  /// table's four-column primary key rather than through
  /// `index_human_auth_policy_entries_user`, because this query constrains all
  /// four of those columns and that index covers only the first three.
  @Query(
    'SELECT * FROM human_auth_policy_entries '
    'WHERE tenant_id = :tenantId AND terminal_id = :terminalId AND sequence = :sequence '
    'AND user_id = :userId LIMIT 1',
  )
  Future<OhacPolicyEntryEntity?> findEntryForUser(
    String tenantId,
    String terminalId,
    int sequence,
    String userId,
  );

  // ---------------------------------------------------------------------------
  // Mutable state: terminal delivery state and per-user attempt state.
  // ---------------------------------------------------------------------------

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

  /// Access to `human_auth_attempt_state`, the durable per-user PIN attempt
  /// state keyed the same way the backend keys its attempt reset generation.
  ///
  /// State changes go through `updateAttemptStateIfRevisionMatches`, whose
  /// affected-row count is the CAS contract: `0` means a lost race.
  @Query(
    'SELECT * FROM human_auth_attempt_state '
    'WHERE tenant_id = :tenantId AND terminal_id = :terminalId AND user_id = :userId '
    'LIMIT 1',
  )
  Future<OhacAttemptStateEntity?> findAttemptState(
    String tenantId,
    String terminalId,
    String userId,
  );

  @Insert(onConflict: OnConflictStrategy.abort)
  Future<void> insertAttemptState(OhacAttemptStateEntity state);

  /// Compare-and-set on `revision`. The increment is derived inside SQL so it
  /// cannot be applied wrongly; returns the affected row count, where `0`
  /// means the expected revision did not match and nothing changed.
  ///
  /// `locked_until` is nullable in the schema but Floor 1.5.0 forbids nullable
  /// query parameters, so the lock is cleared by passing an empty string
  /// (`NULLIF` stores `NULL`); `locked_until` is always an ISO-8601 instant,
  /// never an empty string, so the sentinel is unambiguous.
  @Query(
    'UPDATE human_auth_attempt_state '
    'SET failure_timestamps = :newFailureTimestamps, '
    'locked_until = NULLIF(:newLockedUntil, \'\'), '
    'reset_generation = :newResetGeneration, '
    'local_authorization_sequence = :newLocalAuthorizationSequence, '
    'revision = revision + 1, '
    'updated_at = :newUpdatedAt '
    'WHERE tenant_id = :tenantId AND terminal_id = :terminalId AND user_id = :userId '
    'AND revision = :expectedRevision',
  )
  Future<int?> updateAttemptStateIfRevisionMatches(
    String tenantId,
    String terminalId,
    String userId,
    int expectedRevision,
    String newFailureTimestamps,
    String newLockedUntil,
    String newResetGeneration,
    int newLocalAuthorizationSequence,
    String newUpdatedAt,
  );

  // ---------------------------------------------------------------------------
  // Append-only event log (forensic evidence).
  // ---------------------------------------------------------------------------

  /// Append-only access to `human_auth_local_events`.
  ///
  /// The event log is forensic evidence; it is never rewritten or erased in
  /// place, which the schema enforces with triggers. This DAO deliberately
  /// declares no `@Update`, no `@Delete` and no `DELETE` query.
  @Insert(onConflict: OnConflictStrategy.abort)
  Future<void> appendEvent(OhacLocalEventEntity event);

  /// Ascending by `created_at` then `id`, so the order is deterministic when
  /// two events share a timestamp; served by
  /// `index_human_auth_local_events_terminal`.
  @Query(
    'SELECT * FROM human_auth_local_events '
    'WHERE tenant_id = :tenantId AND terminal_id = :terminalId '
    'ORDER BY created_at ASC, id ASC',
  )
  Future<List<OhacLocalEventEntity>> findEventsForTerminal(
    String tenantId,
    String terminalId,
  );
}
