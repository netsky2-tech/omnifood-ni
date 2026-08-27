import 'package:floor/floor.dart';
import '../../models/sales/promotion_entity.dart';

@dao
abstract class PromotionDao {
  @Query('SELECT * FROM promotions WHERE is_active = 1 ORDER BY priority DESC')
  Future<List<PromotionEntity>> getActivePromotions();

  @Insert(onConflict: OnConflictStrategy.replace)
  Future<void> savePromotion(PromotionEntity promotion);

  @Insert(onConflict: OnConflictStrategy.replace)
  Future<void> savePromotions(List<PromotionEntity> promotions);

  @Update(onConflict: OnConflictStrategy.replace)
  Future<void> updatePromotion(PromotionEntity promotion);

  @Query('SELECT * FROM promotions WHERE target_product_id = :productId AND is_active = 1')
  Future<List<PromotionEntity>> getPromotionsByProduct(String productId);

  @Query('SELECT * FROM promotions WHERE target_category_id = :categoryId AND is_active = 1')
  Future<List<PromotionEntity>> getPromotionsByCategory(String categoryId);

  @Query('DELETE FROM promotions WHERE id = :id')
  Future<void> deletePromotionById(String id);
}
