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
}
