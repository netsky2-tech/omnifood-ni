import 'package:floor/floor.dart';

@Entity(
  tableName: 'production_order_documents',
  indices: [
    Index(
      value: ['idempotency_key'],
      name: 'idx_production_order_documents_idempotency_key',
      unique: true,
    ),
    Index(
      value: ['terminal_id', 'source_sequence'],
      name: 'idx_production_order_documents_terminal_source_sequence',
      unique: true,
    ),
  ],
)
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
  final String outcome;
  @ColumnInfo(name: 'failure_reason')
  final String? failureReason;
  @ColumnInfo(name: 'terminal_id')
  final String terminalId;
  @ColumnInfo(name: 'source_sequence')
  final int sourceSequence;
  @ColumnInfo(name: 'idempotency_key')
  final String idempotencyKey;
  @ColumnInfo(name: 'payload_hash')
  final String payloadHash;
  @ColumnInfo(name: 'total_consumed_cost_nio')
  final double totalConsumedCostNio;
  @ColumnInfo(name: 'produced_unit_cost_nio')
  final double producedUnitCostNio;
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
    this.outcome = 'COMPLETED',
    this.failureReason,
    required this.terminalId,
    this.sourceSequence = 0,
    String? idempotencyKey,
    String? payloadHash,
    this.totalConsumedCostNio = 0,
    this.producedUnitCostNio = 0,
    required this.movementReferencesJson,
    this.varianceReason,
    this.closedAt,
    this.isSynced = false,
  }) : idempotencyKey = idempotencyKey ?? 'production:$terminalId:$id',
       payloadHash =
           payloadHash ?? '$id:$outcome:$plannedQuantity:$actualQuantity';
}
