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
  @ColumnInfo(name: 'stock_min')
  final double? stockMin;
  @ColumnInfo(name: 'stock_max')
  final double? stockMax;
  @ColumnInfo(name: 'is_active')
  final bool isActive;
  @ColumnInfo(name: 'negative_stock_policy')
  final String negativeStockPolicy;

  /// FD-02: the sum of the remaining stock of this insumo's LOTS — the
  /// number the cloud will actually draw from. Null when the insumo has no
  /// lots, and then the aggregate [stock] is the only truth.
  ///
  /// WHY two numbers: the terminal decides what it can sell and the cloud
  /// decides what it can record. They were reading different numbers (the
  /// aggregate here, the lots there), so the terminal sold what the cloud
  /// could not record. Now both read the SAME one.
  @ColumnInfo(name: 'lot_available_stock')
  final double? lotAvailableStock;

  /// FD-02: whether this insumo is managed by lots.
  @ColumnInfo(name: 'is_batch_managed')
  final bool isBatchManaged;

  InsumoEntity({
    required this.id,
    required this.name,
    required this.consumptionUom,
    this.warehouseId,
    this.isPerishable = false,
    required this.stock,
    required this.averageCost,
    this.parLevel,
    this.stockMin,
    this.stockMax,
    this.isActive = true,
    this.negativeStockPolicy = 'RESTRICT',
    this.lotAvailableStock,
    this.isBatchManaged = false,
  });
}
