import 'package:floor/floor.dart';
import '../../models/inventory/purchase_entity.dart';

@dao
abstract class PurchaseDao {
  @Insert(onConflict: OnConflictStrategy.abort)
  Future<void> insertPurchase(PurchaseEntity purchase);

  @Query('''
    SELECT * FROM purchases
    WHERE is_synced = 0
      AND id NOT IN (
        SELECT movement_id FROM inventory_movement_sync_state
        WHERE sync_status = 'rejected'
      )
  ''')
  Future<List<PurchaseEntity>> findUnsyncedPurchases();

  @Query('SELECT * FROM purchases ORDER BY timestamp DESC')
  Future<List<PurchaseEntity>> findAllPurchases();

  @Query('UPDATE purchases SET is_synced = 1 WHERE id = :id')
  Future<void> markAsSynced(String id);
}
