import 'package:floor/floor.dart';
import '../../models/inventory/movement_entity.dart';

@dao
abstract class InventoryDao {
  @Insert(onConflict: OnConflictStrategy.abort)
  Future<void> insertMovement(MovementEntity movement);

  @Query('UPDATE insumos SET stock = :newStock WHERE id = :id')
  Future<void> updateStock(String id, double newStock);

  @transaction
  Future<void> processInventoryMovements(List<MovementEntity> movements) async {
    for (final movement in movements) {
      await insertMovement(movement);
      await updateStock(movement.insumoId, movement.newStock);
    }
  }
}
