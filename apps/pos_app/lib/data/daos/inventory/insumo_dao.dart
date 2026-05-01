import 'package:floor/floor.dart';
import '../../models/inventory/insumo_entity.dart';

@dao
abstract class InsumoDao {
  @Query('SELECT * FROM insumos WHERE is_active = 1')
  Future<List<InsumoEntity>> findAllActiveInsumos();

  @Query('SELECT * FROM insumos WHERE id = :id')
  Future<InsumoEntity?> findInsumoById(String id);

  @Insert(onConflict: OnConflictStrategy.replace)
  Future<void> insertInsumos(List<InsumoEntity> insumos);

  @Update(onConflict: OnConflictStrategy.replace)
  Future<void> updateInsumo(InsumoEntity insumo);

  @Query('UPDATE insumos SET stock = :newStock WHERE id = :id')
  Future<void> updateStock(String id, double newStock);
}
