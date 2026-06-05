import 'package:floor/floor.dart';

@Entity(tableName: 'production_order_documents')
class ProductionOrderDocumentEntity {
  @primaryKey
  final String id;
  @ColumnInfo(name: 'recipe_version_id')
  final String recipeVersionId;
  @ColumnInfo(name: 'recipe_product_id')
  final String recipeProductId;
  @ColumnInfo(name: 'recipe_product_name')
  final String recipeProductName;
  @ColumnInfo(name: 'produced_insumo_id')
  final String producedInsumoId;
  @ColumnInfo(name: 'produced_insumo_name')
  final String producedInsumoName;
  @ColumnInfo(name: 'planned_quantity')
  final double plannedQuantity;
  @ColumnInfo(name: 'actual_quantity')
  final double actualQuantity;
  @ColumnInfo(name: 'produced_batch_number')
  final String producedBatchNumber;
  @ColumnInfo(name: 'produced_expiration_date')
  final String producedExpirationDate;
  @ColumnInfo(name: 'operation_date')
  final String operationDate;
  final String status;
  @ColumnInfo(name: 'variance_reason')
  final String? varianceReason;
  @ColumnInfo(name: 'closed_at')
  final String? closedAt;
  @ColumnInfo(name: 'movement_references_json')
  final String movementReferencesJson;
  @ColumnInfo(name: 'is_synced')
  final bool isSynced;

  const ProductionOrderDocumentEntity({
    required this.id,
    required this.recipeVersionId,
    required this.recipeProductId,
    required this.recipeProductName,
    required this.producedInsumoId,
    required this.producedInsumoName,
    required this.plannedQuantity,
    required this.actualQuantity,
    required this.producedBatchNumber,
    required this.producedExpirationDate,
    required this.operationDate,
    required this.status,
    required this.movementReferencesJson,
    this.varianceReason,
    this.closedAt,
    this.isSynced = false,
  });
}
