import 'package:floor/floor.dart';
import '../../models/inventory/kardex_recalculate_queue_entity.dart';

@dao
abstract class KardexRecalculateQueueDao {
  @Query('SELECT * FROM kardex_recalculate_queue WHERE status = :status ORDER BY created_at ASC')
  Future<List<KardexRecalculateQueueEntity>> findQueueByStatus(String status);

  @Query('SELECT * FROM kardex_recalculate_queue WHERE insumo_id = :insumoId ORDER BY created_at ASC')
  Future<List<KardexRecalculateQueueEntity>> findQueueByInsumoId(String insumoId);

  @Query('SELECT * FROM kardex_recalculate_queue WHERE id = :id')
  Future<KardexRecalculateQueueEntity?> findQueueById(String id);

  @Insert(onConflict: OnConflictStrategy.replace)
  Future<void> insertQueueItem(KardexRecalculateQueueEntity item);

  @Update(onConflict: OnConflictStrategy.replace)
  Future<void> updateQueueItem(KardexRecalculateQueueEntity item);

  @Query('DELETE FROM kardex_recalculate_queue WHERE id = :id')
  Future<void> deleteQueueItemById(String id);

  @transaction
  Future<void> claimQueueItem(
    String id,
    String status,
    String claimedAt,
    int attempts,
  ) async {
    final item = await findQueueById(id);
    if (item != null) {
      await updateQueueItem(KardexRecalculateQueueEntity(
        id: item.id,
        insumoId: item.insumoId,
        originMovementId: item.originMovementId,
        triggerMovementId: item.triggerMovementId,
        status: status,
        attempts: attempts,
        claimedAt: claimedAt,
        lastError: item.lastError,
        createdAt: item.createdAt,
        updatedAt: claimedAt,
      ));
    }
  }
}
