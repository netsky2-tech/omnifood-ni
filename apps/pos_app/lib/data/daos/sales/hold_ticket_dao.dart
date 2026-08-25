import 'package:floor/floor.dart';
import '../../models/sales/hold_ticket_entity.dart';

@dao
abstract class HoldTicketDao {
  @Query('SELECT * FROM hold_tickets ORDER BY created_at DESC')
  Future<List<HoldTicketEntity>> getAllHoldTickets();

  @Query('SELECT * FROM hold_tickets WHERE id = :id')
  Future<HoldTicketEntity?> getHoldTicketById(String id);

  @Query('SELECT * FROM hold_tickets WHERE table_id = :tableId')
  Future<HoldTicketEntity?> getHoldTicketByTableId(String tableId);

  @Query('SELECT * FROM hold_ticket_items WHERE hold_ticket_id = :holdTicketId')
  Future<List<HoldTicketItemEntity>> getItemsByHoldTicketId(String holdTicketId);

  @Insert(onConflict: OnConflictStrategy.replace)
  Future<void> insertHoldTicket(HoldTicketEntity ticket);

  @Insert(onConflict: OnConflictStrategy.replace)
  Future<void> insertHoldTicketItems(List<HoldTicketItemEntity> items);

  @Update(onConflict: OnConflictStrategy.replace)
  Future<int> updateHoldTicket(HoldTicketEntity ticket);

  @Query('DELETE FROM hold_ticket_items WHERE hold_ticket_id = :holdTicketId')
  Future<void> deleteHoldTicketItems(String holdTicketId);

  @Query('DELETE FROM hold_tickets WHERE id = :id')
  Future<void> deleteHoldTicket(String id);

  @transaction
  Future<void> saveHoldTicket(HoldTicketEntity ticket, List<HoldTicketItemEntity> items) async {
    await insertHoldTicket(ticket);
    await deleteHoldTicketItems(ticket.id);
    await insertHoldTicketItems(items);
  }

  @transaction
  Future<void> deleteHoldTicketWithItems(String id) async {
    await deleteHoldTicketItems(id);
    await deleteHoldTicket(id);
  }
}
