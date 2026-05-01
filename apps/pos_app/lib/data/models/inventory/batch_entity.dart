import 'package:floor/floor.dart';

@Entity(tableName: 'batches')
class BatchEntity {
  @primaryKey
  final String id;
  @ColumnInfo(name: 'insumo_id')
  final String insumoId;
  @ColumnInfo(name: 'batch_number')
  final String batchNumber;
  @ColumnInfo(name: 'expiration_date')
  final String expirationDate;
  @ColumnInfo(name: 'remaining_stock')
  final double remainingStock;
  final double cost;
  @ColumnInfo(name: 'is_synced')
  final bool isSynced;

  BatchEntity({
    required this.id,
    required this.insumoId,
    required this.batchNumber,
    required this.expirationDate,
    required this.remainingStock,
    required this.cost,
    this.isSynced = false,
  });
}
