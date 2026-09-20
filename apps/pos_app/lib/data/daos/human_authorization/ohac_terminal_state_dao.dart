import 'package:floor/floor.dart';
import '../../models/human_authorization/ohac_delivery_entities.dart';

/// Access to `human_auth_terminal_state`, the terminal's mutable delivery
/// state.
///
/// A second insert for the same terminal aborts rather than silently
/// overwriting a state that the revision compare-and-set protects. State
/// transitions go through `updateTerminalStateIfRevisionMatches`, whose
/// affected-row count is the CAS contract: `0` means a lost race.
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

  /// Compare-and-set on `revision`. The increment is derived inside SQL so it
  /// cannot be applied wrongly; returns the affected row count, where `0`
  /// means the expected revision did not match and nothing changed. The
  /// nullable typing is a Floor generator constraint for `@Query` updates;
  /// the count is never actually null.
  @Query(
    'UPDATE human_auth_terminal_state '
    'SET state = :newState, '
    'active_sequence = :newActiveSequence, '
    'active_digest = :newActiveDigest, '
    'revision = revision + 1, '
    'updated_at = :newUpdatedAt '
    'WHERE tenant_id = :tenantId AND terminal_id = :terminalId '
    'AND revision = :expectedRevision',
  )
  Future<int?> updateTerminalStateIfRevisionMatches(
    String tenantId,
    String terminalId,
    int expectedRevision,
    String newState,
    int newActiveSequence,
    String newActiveDigest,
    String newUpdatedAt,
  );
}
