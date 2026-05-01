import 'package:floor/floor.dart';
import '../../models/inventory/warehouse_entity.dart';

@dao
abstract class WarehouseDao {
  @Query('SELECT * FROM warehouses WHERE is_active = 1')
  Future<List<WarehouseEntity>> findAllActiveWarehouses();

  @Query('SELECT * FROM warehouses WHERE id = :id')
  Future<WarehouseEntity?> findWarehouseById(String id);

  @Insert(onConflict: OnConflictStrategy.replace)
  Future<void> insertWarehouses(List<WarehouseEntity> warehouses);

  @Update(onConflict: OnConflictStrategy.replace)
  Future<void> updateWarehouse(WarehouseEntity warehouse);
}
