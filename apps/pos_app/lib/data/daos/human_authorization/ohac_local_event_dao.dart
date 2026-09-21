import 'package:floor/floor.dart';
import '../../models/human_authorization/ohac_delivery_entities.dart';

/// Append-only access to `human_auth_local_events`.
///
/// The event log is forensic evidence; it is never rewritten or erased in
/// place, which the schema enforces with triggers. This DAO deliberately
/// declares no `@Update`, no `@Delete` and no `DELETE` query.
@dao
abstract class OhacLocalEventDao {
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
