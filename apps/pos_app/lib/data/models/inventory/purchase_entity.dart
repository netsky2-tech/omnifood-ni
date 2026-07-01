import 'package:floor/floor.dart';

@Entity(tableName: 'purchases')
class PurchaseEntity {
  @primaryKey
  final String id;
  @ColumnInfo(name: 'insumo_id')
  final String insumoId;
  @ColumnInfo(name: 'supplier_id')
  final String supplierId;
  @ColumnInfo(name: 'invoice_number')
  final String invoiceNumber;
  final double quantity;
  @ColumnInfo(name: 'unit_cost')
  final double unitCost;
  final String timestamp;
  @ColumnInfo(name: 'invoice_date')
  final String invoiceDate;
  final String currency;
  @ColumnInfo(name: 'bcn_rate')
  final double bcnRate;
  @ColumnInfo(name: 'unit_cost_nio')
  final double? unitCostNio;
  @ColumnInfo(name: 'cpp_before_nio')
  final double? cppBeforeNio;
  @ColumnInfo(name: 'projected_cpp_nio')
  final double? projectedCppNio;
  @ColumnInfo(name: 'lot_code')
  final String? lotCode;
  @ColumnInfo(name: 'received_date')
  final String? receivedDate;
  @ColumnInfo(name: 'expiration_date')
  final String? expirationDate;
  @ColumnInfo(name: 'requires_batch_tracking')
  final bool requiresBatchTracking;
  @ColumnInfo(name: 'is_synced')
  final bool isSynced;

  PurchaseEntity({
    required this.id,
    required this.insumoId,
    required this.supplierId,
    required this.invoiceNumber,
    required this.quantity,
    required this.unitCost,
    required this.timestamp,
    required this.invoiceDate,
    required this.currency,
    required this.bcnRate,
    this.unitCostNio,
    this.cppBeforeNio,
    this.projectedCppNio,
    this.lotCode,
    this.receivedDate,
    this.expirationDate,
    this.requiresBatchTracking = false,
    this.isSynced = false,
  });
}
