import 'package:floor/floor.dart';
import '../../models/inventory/movement_entity.dart';

@dao
abstract class MovementDao {
  @Query('SELECT * FROM inventory_movements ORDER BY timestamp DESC')
  Future<List<MovementEntity>> findAllMovements();

  @Query('SELECT * FROM inventory_movements WHERE is_synced = 0')
  Future<List<MovementEntity>> findUnsyncedMovements();

  @Insert(onConflict: OnConflictStrategy.abort)
  Future<void> insertMovement(MovementEntity movement);

  @Query('SELECT * FROM inventory_movements WHERE type = :type ORDER BY timestamp DESC LIMIT :limit')
  Future<List<MovementEntity>> findMovementsByType(String type, int limit);

  @Query('UPDATE inventory_movements SET is_synced = 1 WHERE id = :id')
  Future<void> markAsSynced(String id);

  @Query('UPDATE inventory_movements SET is_synced = -1 WHERE id = :id')
  Future<void> markAsFailed(String id);
}
