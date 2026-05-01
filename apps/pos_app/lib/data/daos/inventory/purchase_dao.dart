import 'package:floor/floor.dart';
import '../../models/inventory/purchase_entity.dart';

@dao
abstract class PurchaseDao {
  @Insert(onConflict: OnConflictStrategy.abort)
  Future<void> insertPurchase(PurchaseEntity purchase);

  @Query('SELECT * FROM purchases WHERE is_synced = 0')
  Future<List<PurchaseEntity>> findUnsyncedPurchases();

  @Query('UPDATE purchases SET is_synced = 1 WHERE id = :id')
  Future<void> markAsSynced(String id);
}
