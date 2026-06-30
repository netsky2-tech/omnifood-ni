import 'package:floor/floor.dart';
import '../../models/inventory/movement_entity.dart';

@dao
abstract class MovementDao {
  @Query('SELECT * FROM inventory_movements ORDER BY timestamp DESC')
  Future<List<MovementEntity>> findAllMovements();

  @Query('''
    SELECT inventory_movements.*
    FROM inventory_movements
    LEFT JOIN inventory_movement_sync_state
      ON inventory_movement_sync_state.movement_id = inventory_movements.id
    WHERE inventory_movement_sync_state.sync_status IS NULL
      OR inventory_movement_sync_state.sync_status != 'synced'
  ''')
  Future<List<MovementEntity>> findUnsyncedMovements();

  @Insert(onConflict: OnConflictStrategy.abort)
  Future<void> insertMovement(MovementEntity movement);

  @Query('SELECT * FROM inventory_movements WHERE type = :type ORDER BY timestamp DESC LIMIT :limit')
  Future<List<MovementEntity>> findMovementsByType(String type, int limit);
}
