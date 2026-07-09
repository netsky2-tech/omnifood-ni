import 'package:floor/floor.dart';

import '../../models/inventory/movement_sync_state_entity.dart';

@dao
abstract class MovementSyncStateDao {
  @Insert(onConflict: OnConflictStrategy.replace)
  Future<void> upsertSyncState(MovementSyncStateEntity state);

  @Query(
    'SELECT * FROM inventory_movement_sync_state WHERE movement_id = :movementId',
  )
  Future<MovementSyncStateEntity?> findByMovementId(String movementId);

  @Query('''
    SELECT * FROM inventory_movement_sync_state
    WHERE movement_id IN (:movementIds)
  ''')
  Future<List<MovementSyncStateEntity>> findByMovementIds(
    List<String> movementIds,
  );

  @Query('''
    SELECT COALESCE(MAX(local_sequence), 0)
    FROM inventory_movement_sync_state
    WHERE terminal_id = :terminalId AND flow_type = :flowType
  ''')
  Future<int?> findMaxLocalSequence(String terminalId, String flowType);
}
