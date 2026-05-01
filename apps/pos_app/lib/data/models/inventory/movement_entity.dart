import 'package:floor/floor.dart';

@Entity(tableName: 'inventory_movements')
class MovementEntity {
  @primaryKey
  final String id;
  @ColumnInfo(name: 'insumo_id')
  final String insumoId;
  final String type;
  final double quantity;
  @ColumnInfo(name: 'previous_stock')
  final double previousStock;
  @ColumnInfo(name: 'new_stock')
  final double newStock;
  final String timestamp; // Store as ISO8601 string
  final String? reason;
  @ColumnInfo(name: 'user_id')
  final String? userId;
  @ColumnInfo(name: 'is_synced')
  final bool isSynced;

  MovementEntity({
    required this.id,
    required this.insumoId,
    required this.type,
    required this.quantity,
    required this.previousStock,
    required this.newStock,
    required this.timestamp,
    this.reason,
    this.userId,
    this.isSynced = false,
  });
}
