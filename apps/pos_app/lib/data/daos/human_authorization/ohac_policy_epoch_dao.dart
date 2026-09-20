import 'package:floor/floor.dart';
import '../../models/human_authorization/ohac_delivery_entities.dart';

/// Append-only access to `human_auth_policy_epochs`.
///
/// An epoch is what the backend signed; it is never rewritten in place, which
/// the schema enforces with triggers. This DAO deliberately declares no
/// `@Update`, no `@Delete` and no `DELETE` query.
@dao
abstract class OhacPolicyEpochDao {
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
}
