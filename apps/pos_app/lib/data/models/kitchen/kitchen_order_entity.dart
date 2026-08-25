import 'package:floor/floor.dart';

@Entity(
  tableName: 'kitchen_orders',
  indices: [
    Index(value: ['station', 'status']),
    Index(value: ['ticket_id']),
  ],
)
class KitchenOrderEntity {
  @primaryKey
  final String id;

  @ColumnInfo(name: 'ticket_id')
  final String ticketId;

  @ColumnInfo(name: 'table_number')
  final String? tableNumber;

  @ColumnInfo(name: 'table_name')
  final String? tableName;

  @ColumnInfo(name: 'waiter_name')
  final String? waiterName;

  @ColumnInfo(name: 'station')
  final String station;

  @ColumnInfo(name: 'status')
  final String status;

  @ColumnInfo(name: 'created_at')
  final int createdAt;

  @ColumnInfo(name: 'started_at')
  final int? startedAt;

  @ColumnInfo(name: 'ready_at')
  final int? readyAt;

  @ColumnInfo(name: 'served_at')
  final int? servedAt;

  @ColumnInfo(name: 'notes')
  final String? notes;

  const KitchenOrderEntity({
    required this.id,
    required this.ticketId,
    this.tableNumber,
    this.tableName,
    this.waiterName,
    required this.station,
    required this.status,
    required this.createdAt,
    this.startedAt,
    this.readyAt,
    this.servedAt,
    this.notes,
  });
}
