import 'package:floor/floor.dart';
import '../../models/inventory/batch_entity.dart';

@dao
abstract class BatchDao {
  @Query('SELECT * FROM batches WHERE insumo_id = :insumoId AND remaining_stock > 0 ORDER BY expiration_date ASC')
  Future<List<BatchEntity>> findActiveBatchesByInsumoId(String insumoId);

  @Insert(onConflict: OnConflictStrategy.replace)
  Future<void> insertBatch(BatchEntity batch);

  @Update(onConflict: OnConflictStrategy.replace)
  Future<void> updateBatch(BatchEntity batch);
}
