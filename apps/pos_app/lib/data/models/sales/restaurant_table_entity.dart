import 'package:floor/floor.dart';
import './restaurant_area_entity.dart';

@Entity(
  tableName: 'restaurant_tables',
  foreignKeys: [
    ForeignKey(
      childColumns: ['area_id'],
      parentColumns: ['id'],
      entity: RestaurantAreaEntity,
      onDelete: ForeignKeyAction.cascade,
    ),
  ],
)
class RestaurantTableEntity {
  @primaryKey
  final String id;
  @ColumnInfo(name: 'area_id')
  final String areaId;
  @ColumnInfo(name: 'table_number')
  final String tableNumber;
  final int capacity;
  final String status; // 'DISPONIBLE', 'OCUPADA', 'POR_COBRAR', 'RESERVADA'
  @ColumnInfo(name: 'current_ticket_id')
  final String? currentTicketId;
  @ColumnInfo(name: 'active_guests')
  final int? activeGuests;
  @ColumnInfo(name: 'opened_at')
  final int? openedAt;

  RestaurantTableEntity({
    required this.id,
    required this.areaId,
    required this.tableNumber,
    this.capacity = 4,
    this.status = 'DISPONIBLE',
    this.currentTicketId,
    this.activeGuests,
    this.openedAt,
  });
}
