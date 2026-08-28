import 'package:floor/floor.dart';
import '../../models/sales/restaurant_area_entity.dart';

@dao
abstract class RestaurantAreaDao {
  @Query('SELECT * FROM restaurant_areas WHERE is_active = 1 ORDER BY display_order ASC')
  Future<List<RestaurantAreaEntity>> getActiveAreas();

  @Query('SELECT * FROM restaurant_areas ORDER BY display_order ASC')
  Future<List<RestaurantAreaEntity>> getAllAreas();

  @Query('SELECT * FROM restaurant_areas WHERE id = :id')
  Future<RestaurantAreaEntity?> getAreaById(String id);

  @Insert(onConflict: OnConflictStrategy.replace)
  Future<void> insertArea(RestaurantAreaEntity area);

  @Insert(onConflict: OnConflictStrategy.replace)
  Future<void> insertAreas(List<RestaurantAreaEntity> areas);

  @Update(onConflict: OnConflictStrategy.replace)
  Future<int> updateArea(RestaurantAreaEntity area);

  @Query('DELETE FROM restaurant_areas WHERE id = :id')
  Future<void> deleteArea(String id);
}
