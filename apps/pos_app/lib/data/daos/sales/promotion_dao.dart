import 'package:floor/floor.dart';
import '../../models/sales/promotion_entity.dart';

@dao
abstract class PromotionDao {
  @Query('SELECT * FROM promotions WHERE is_active = 1 ORDER BY priority DESC')
  Future<List<PromotionEntity>> getActivePromotions();

  @Query('SELECT * FROM promotions ORDER BY priority DESC')
  Future<List<PromotionEntity>> getAllPromotions();

  @Query('UPDATE promotions SET is_active = :isActive WHERE id = :id')
  Future<void> setPromotionActive(String id, bool isActive);

  @Insert(onConflict: OnConflictStrategy.replace)
  Future<void> savePromotion(PromotionEntity promotion);

  @Insert(onConflict: OnConflictStrategy.replace)
  Future<void> savePromotions(List<PromotionEntity> promotions);

  @Update(onConflict: OnConflictStrategy.replace)
  Future<void> updatePromotion(PromotionEntity promotion);

  @Query('SELECT * FROM promotions WHERE target_product_id = :productId AND is_active = 1')
  Future<List<PromotionEntity>> getPromotionsByProduct(String productId);

  // T0.5c: getPromotionsByCategory was deleted — it had zero callers (the
  // engine matches promotions strictly in memory by category id, never via a
  // free-text category DAO lookup).

  @Query('DELETE FROM promotions WHERE id = :id')
  Future<void> deletePromotionById(String id);
}
