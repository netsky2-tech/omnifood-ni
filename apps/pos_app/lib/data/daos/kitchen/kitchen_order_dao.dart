import 'package:floor/floor.dart';
import '../../models/kitchen/kitchen_order_entity.dart';
import '../../models/kitchen/kitchen_order_item_entity.dart';

@dao
abstract class KitchenOrderDao {
  @Query('SELECT * FROM kitchen_orders WHERE status != :servedStatus ORDER BY created_at ASC')
  Future<List<KitchenOrderEntity>> getActiveOrders(String servedStatus);

  @Query('SELECT * FROM kitchen_orders WHERE station = :station AND status != :servedStatus ORDER BY created_at ASC')
  Future<List<KitchenOrderEntity>> getActiveOrdersByStation(String station, String servedStatus);

  @Query('SELECT * FROM kitchen_orders ORDER BY created_at DESC')
  Future<List<KitchenOrderEntity>> getAllOrders();

  @Query('SELECT * FROM kitchen_orders WHERE id = :id')
  Future<KitchenOrderEntity?> getOrderById(String id);

  @Query('SELECT * FROM kitchen_orders WHERE ticket_id = :ticketId')
  Future<List<KitchenOrderEntity>> getOrdersByTicketId(String ticketId);

  @Query('SELECT * FROM kitchen_order_items WHERE kitchen_order_id = :orderId')
  Future<List<KitchenOrderItemEntity>> getItemsForOrder(String orderId);

  @Insert(onConflict: OnConflictStrategy.replace)
  Future<void> insertOrder(KitchenOrderEntity order);

  @Insert(onConflict: OnConflictStrategy.replace)
  Future<void> insertOrders(List<KitchenOrderEntity> orders);

  @Insert(onConflict: OnConflictStrategy.replace)
  Future<void> insertOrderItems(List<KitchenOrderItemEntity> items);

  @Update(onConflict: OnConflictStrategy.replace)
  Future<void> updateOrder(KitchenOrderEntity order);

  @Query('UPDATE kitchen_orders SET status = :status, ready_at = :readyAt WHERE id = :id')
  Future<void> updateOrderStatus(String id, String status, int readyAt);

  @Query('UPDATE kitchen_orders SET status = :status, started_at = :startedAt WHERE id = :id')
  Future<void> startOrderPreparation(String id, String status, int startedAt);

  @Query('UPDATE kitchen_orders SET status = :status, served_at = :servedAt WHERE id = :id')
  Future<void> markOrderServed(String id, String status, int servedAt);

  @Query('UPDATE kitchen_order_items SET status = :status WHERE id = :id')
  Future<void> updateItemStatus(String id, String status);

  @Query('DELETE FROM kitchen_orders WHERE ticket_id = :ticketId')
  Future<void> deleteOrdersByTicketId(String ticketId);

  @Query('DELETE FROM kitchen_orders WHERE id = :id')
  Future<void> deleteOrder(String id);

  @Query('DELETE FROM kitchen_order_items WHERE kitchen_order_id = :orderId')
  Future<void> deleteItemsForOrder(String orderId);

  /// Positional arguments only for Floor @transaction
  @transaction
  Future<void> saveKitchenOrder(
    KitchenOrderEntity order,
    List<KitchenOrderItemEntity> items,
  ) async {
    await insertOrder(order);
    await deleteItemsForOrder(order.id);
    if (items.isNotEmpty) {
      await insertOrderItems(items);
    }
  }

  /// Positional arguments only for Floor @transaction
  @transaction
  Future<void> deleteKitchenOrderWithItems(String orderId) async {
    await deleteItemsForOrder(orderId);
    await deleteOrder(orderId);
  }
}
