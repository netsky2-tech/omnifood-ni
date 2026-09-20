import 'package:floor/floor.dart';
import '../../models/human_authorization/ohac_delivery_entities.dart';

/// Append-only access to `human_auth_policy_entries`, and the only writer of
/// entry rows.
///
/// An entry is what its epoch says about a user; like the epoch it is never
/// rewritten in place, which the schema enforces with triggers. This DAO
/// deliberately declares no `@Update`, no `@Delete` and no `DELETE` query.
@dao
abstract class OhacPolicyEntryDao {
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
}
