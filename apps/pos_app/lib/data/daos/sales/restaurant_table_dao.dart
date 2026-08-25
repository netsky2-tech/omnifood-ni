import 'package:floor/floor.dart';
import '../../models/sales/restaurant_table_entity.dart';

@dao
abstract class RestaurantTableDao {
  @Query('SELECT * FROM restaurant_tables ORDER BY table_number ASC')
  Future<List<RestaurantTableEntity>> getAllTables();

  @Query('SELECT * FROM restaurant_tables WHERE area_id = :areaId ORDER BY table_number ASC')
  Future<List<RestaurantTableEntity>> getTablesByArea(String areaId);

  @Query('SELECT * FROM restaurant_tables WHERE id = :id')
  Future<RestaurantTableEntity?> getTableById(String id);

  @Query('SELECT * FROM restaurant_tables WHERE current_ticket_id = :ticketId')
  Future<RestaurantTableEntity?> getTableByTicketId(String ticketId);

  @Query('SELECT * FROM restaurant_tables WHERE status = :status')
  Future<List<RestaurantTableEntity>> getTablesByStatus(String status);

  @Insert(onConflict: OnConflictStrategy.replace)
  Future<void> insertTable(RestaurantTableEntity table);

  @Insert(onConflict: OnConflictStrategy.replace)
  Future<void> insertTables(List<RestaurantTableEntity> tables);

  @Update(onConflict: OnConflictStrategy.replace)
  Future<int> updateTable(RestaurantTableEntity table);

  @Query('UPDATE restaurant_tables SET status = :status, current_ticket_id = :ticketId, active_guests = :guests, opened_at = :openedAt WHERE id = :id')
  Future<void> occupyTable(
    String id,
    String status,
    String ticketId,
    int guests,
    int openedAt,
  );

  @Query("UPDATE restaurant_tables SET status = 'DISPONIBLE', current_ticket_id = NULL, active_guests = NULL, opened_at = NULL WHERE id = :id")
  Future<void> releaseTable(String id);

  @Query('DELETE FROM restaurant_tables WHERE id = :id')
  Future<void> deleteTable(String id);
}
