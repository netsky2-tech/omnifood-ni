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

  @Query('UPDATE inventory_movements SET is_synced = 1 WHERE id = :id')
  Future<void> markAsSynced(String id);
}
