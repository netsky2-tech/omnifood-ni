import 'package:floor/floor.dart';

@Entity(tableName: 'insumos')
class InsumoEntity {
  @primaryKey
  final String id;
  final String name;
  @ColumnInfo(name: 'consumption_uom')
  final String consumptionUom;
  @ColumnInfo(name: 'warehouse_id')
  final String? warehouseId;
  @ColumnInfo(name: 'is_perishable')
  final bool isPerishable;
  final double stock;
  @ColumnInfo(name: 'average_cost')
  final double averageCost;
  @ColumnInfo(name: 'par_level')
  final double? parLevel;
  @ColumnInfo(name: 'is_active')
  final bool isActive;

  InsumoEntity({
    required this.id,
    required this.name,
    required this.consumptionUom,
    this.warehouseId,
    this.isPerishable = false,
    required this.stock,
    required this.averageCost,
    this.parLevel,
    this.isActive = true,
  });
}
