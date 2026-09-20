import 'package:floor/floor.dart';
import '../../models/human_authorization/ohac_delivery_entities.dart';

/// Access to `human_auth_attempt_state`, the durable per-user PIN attempt
/// state keyed the same way the backend keys its attempt reset generation.
///
/// State changes go through `updateAttemptStateIfRevisionMatches`, whose
/// affected-row count is the CAS contract: `0` means a lost race.
@dao
abstract class OhacAttemptStateDao {
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
}
