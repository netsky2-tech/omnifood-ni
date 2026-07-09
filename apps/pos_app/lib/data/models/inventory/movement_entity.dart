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
  @ColumnInfo(name: 'unit_cost_nio')
  final double? unitCostNio;
  @ColumnInfo(name: 'source_document_type')
  final String? sourceDocumentType;
  @ColumnInfo(name: 'source_document_id')
  final String? sourceDocumentId;
  @ColumnInfo(name: 'batch_deductions')
  // ignore: non_constant_identifier_names
  final String? batch_deductions;

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
    this.unitCostNio,
    this.sourceDocumentType,
    this.sourceDocumentId,
    // ignore: non_constant_identifier_names
    this.batch_deductions,
  });
}
