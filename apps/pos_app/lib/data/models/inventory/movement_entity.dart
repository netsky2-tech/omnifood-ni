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
  @ColumnInfo(name: 'origin_movement_id')
  String? originMovementId;
  @ColumnInfo(name: 'origin_invoice_item_id')
  final String? originInvoiceItemId;
  @ColumnInfo(name: 'batch_deductions')
  // ignore: non_constant_identifier_names
  final String? batch_deductions;
  @ColumnInfo(name: 'estado_costeo')
  final int estadoCosteo;
  @ColumnInfo(name: 'intentos_count')
  final int intentosCount;
  @ColumnInfo(name: 'bloqueo_motivo')
  final String? bloqueoMotivo;
  @ColumnInfo(name: 'autorizado_por_usuario_id')
  final String? autorizadoPorUsuarioId;
  @ColumnInfo(name: 'fecha_autorizacion')
  final String? fechaAutorizacion;

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
    this.originMovementId,
    this.originInvoiceItemId,
    // ignore: non_constant_identifier_names
    this.batch_deductions,
    this.estadoCosteo = 30,
    this.intentosCount = 0,
    this.bloqueoMotivo,
    this.autorizadoPorUsuarioId,
    this.fechaAutorizacion,
  });
}
