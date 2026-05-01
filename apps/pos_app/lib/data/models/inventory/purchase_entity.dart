import 'package:floor/floor.dart';

@Entity(tableName: 'purchases')
class PurchaseEntity {
  @primaryKey
  final String id;
  @ColumnInfo(name: 'insumo_id')
  final String insumoId;
  @ColumnInfo(name: 'supplier_id')
  final String supplierId;
  final double quantity;
  @ColumnInfo(name: 'unit_cost')
  final double unitCost;
  final String timestamp;
  @ColumnInfo(name: 'is_synced')
  final bool isSynced;

  PurchaseEntity({
    required this.id,
    required this.insumoId,
    required this.supplierId,
    required this.quantity,
    required this.unitCost,
    required this.timestamp,
    this.isSynced = false,
  });
}
