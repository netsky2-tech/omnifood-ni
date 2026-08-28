import 'dart:convert';

class ProductionOrderDocument {
  ProductionOrderDocument({
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
    String? terminalId,
    this.sourceSequence = 0,
    String? idempotencyKey,
    String? payloadHash,
    this.totalConsumedCostNio = 0,
    this.producedUnitCostNio = 0,
    this.varianceReason,
    this.closedAt,
    this.movementReferences = const <String>[],
    this.isSynced = false,
  }) : terminalId = _requireTerminalId(terminalId),
       idempotencyKey =
           idempotencyKey ?? 'production:${_requireTerminalId(terminalId)}:$id',
       payloadHash =
           payloadHash ?? '$id:$outcome:$plannedQuantity:$actualQuantity';

  final String id;
  final String recipeVersionId;
  final String recipeProductId;
  final String recipeProductName;
  final String producedInsumoId;
  final String producedInsumoName;
  final double plannedQuantity;
  final double actualQuantity;
  final String producedBatchNumber;
  final DateTime producedExpirationDate;
  final DateTime operationDate;
  final String status;
  final String outcome;
  final String? failureReason;
  final String terminalId;
  final int sourceSequence;
  final String idempotencyKey;
  final String payloadHash;
  final double totalConsumedCostNio;
  final double producedUnitCostNio;
  final String? varianceReason;
  final DateTime? closedAt;
  final List<String> movementReferences;
  final bool isSynced;

  double get varianceQuantity => actualQuantity - plannedQuantity;

  ProductionOrderDocument copyWith({
    String? status,
    DateTime? closedAt,
    List<String>? movementReferences,
    bool? isSynced,
  }) {
    return ProductionOrderDocument(
      id: id,
      recipeVersionId: recipeVersionId,
      recipeProductId: recipeProductId,
      recipeProductName: recipeProductName,
      producedInsumoId: producedInsumoId,
      producedInsumoName: producedInsumoName,
      plannedQuantity: plannedQuantity,
      actualQuantity: actualQuantity,
      producedBatchNumber: producedBatchNumber,
      producedExpirationDate: producedExpirationDate,
      operationDate: operationDate,
      status: status ?? this.status,
      outcome: outcome,
      failureReason: failureReason,
      terminalId: terminalId,
      sourceSequence: sourceSequence,
      idempotencyKey: idempotencyKey,
      payloadHash: payloadHash,
      totalConsumedCostNio: totalConsumedCostNio,
      producedUnitCostNio: producedUnitCostNio,
      varianceReason: varianceReason,
      closedAt: closedAt ?? this.closedAt,
      movementReferences: movementReferences ?? this.movementReferences,
      isSynced: isSynced ?? this.isSynced,
    );
  }

  Map<String, Object?> toJson() => {
    'id': id,
    'recipeVersionId': recipeVersionId,
    'recipeProductId': recipeProductId,
    'recipeProductName': recipeProductName,
    'producedInsumoId': producedInsumoId,
    'producedInsumoName': producedInsumoName,
    'plannedQuantity': plannedQuantity,
    'actualQuantity': actualQuantity,
    'producedBatchNumber': producedBatchNumber,
    'producedExpirationDate': producedExpirationDate.toIso8601String(),
    'operationDate': operationDate.toIso8601String(),
    'status': status,
    'outcome': outcome,
    'failureReason': failureReason,
    'terminalId': terminalId,
    'sourceSequence': sourceSequence,
    'idempotencyKey': idempotencyKey,
    'payloadHash': payloadHash,
    'totalConsumedCostNio': totalConsumedCostNio,
    'producedUnitCostNio': producedUnitCostNio,
    'varianceReason': varianceReason,
    'closedAt': closedAt?.toIso8601String(),
    'movementReferences': movementReferences,
    'isSynced': isSynced,
  };

  String encodeMovementReferences() => jsonEncode(movementReferences);

  factory ProductionOrderDocument.fromJson(Map<String, dynamic> json) {
    return ProductionOrderDocument(
      id: (json['id'] ?? json['order_id'])?.toString() ?? '',
      recipeVersionId: (json['recipeVersionId'] ?? json['recipe_version_id'])?.toString() ?? '',
      recipeProductId: (json['recipeProductId'] ?? json['recipe_product_id'])?.toString() ?? '',
      recipeProductName: (json['recipeProductName'] ?? json['recipe_product_name'])?.toString() ?? 'Producto',
      producedInsumoId: (json['producedInsumoId'] ?? json['produced_insumo_id'])?.toString() ?? '',
      producedInsumoName: (json['producedInsumoName'] ?? json['produced_insumo_name'])?.toString() ?? 'Insumo',
      plannedQuantity: (json['plannedQuantity'] ?? json['planned_quantity'] as num?)?.toDouble() ?? 0.0,
      actualQuantity: (json['actualQuantity'] ?? json['actual_quantity'] as num?)?.toDouble() ?? 0.0,
      producedBatchNumber: (json['producedBatchNumber'] ?? json['produced_batch_number'])?.toString() ?? 'LOTE-1',
      producedExpirationDate: json['producedExpirationDate'] != null
          ? DateTime.tryParse(json['producedExpirationDate'].toString()) ?? DateTime.now()
          : (json['produced_expiration_date'] != null
              ? DateTime.tryParse(json['produced_expiration_date'].toString()) ?? DateTime.now()
              : DateTime.now()),
      operationDate: json['operationDate'] != null
          ? DateTime.tryParse(json['operationDate'].toString()) ?? DateTime.now()
          : (json['operation_date'] != null
              ? DateTime.tryParse(json['operation_date'].toString()) ?? DateTime.now()
              : DateTime.now()),
      status: (json['status'] ?? 'CLOSED').toString(),
      outcome: (json['outcome'] ?? 'COMPLETED').toString(),
      failureReason: (json['failureReason'] ?? json['failure_reason'])?.toString(),
      terminalId: _readTerminalId(json),
      sourceSequence: (json['sourceSequence'] ?? json['source_sequence'] as num?)?.toInt() ?? 0,
      idempotencyKey: (json['idempotencyKey'] ?? json['idempotency_key'])?.toString(),
      payloadHash: (json['payloadHash'] ?? json['payload_hash'])?.toString(),
      totalConsumedCostNio:
          (json['totalConsumedCostNio'] ?? json['total_consumed_cost_nio'] as num?)?.toDouble() ?? 0,
      producedUnitCostNio:
          (json['producedUnitCostNio'] ?? json['produced_unit_cost_nio'] as num?)?.toDouble() ?? 0,
      varianceReason: (json['varianceReason'] ?? json['variance_reason'])?.toString(),
      closedAt: json['closedAt'] != null
          ? DateTime.tryParse(json['closedAt'].toString())
          : (json['closed_at'] != null
              ? DateTime.tryParse(json['closed_at'].toString())
              : null),
      movementReferences:
          (json['movementReferences'] ?? json['movement_references'] as List<dynamic>? ?? const <dynamic>[])
              .map((entry) => entry?.toString() ?? '')
              .where((s) => s.isNotEmpty)
              .toList(growable: false),
      isSynced: (json['isSynced'] ?? json['is_synced'] as bool?) ?? false,
    );
  }

  static List<String> decodeMovementReferences(String? encoded) {
    if (encoded == null || encoded.trim().isEmpty) return const [];
    try {
      final decoded = jsonDecode(encoded);
      if (decoded is List) {
        return decoded
            .map((entry) => entry?.toString() ?? '')
            .where((s) => s.isNotEmpty)
            .toList(growable: false);
      }
    } catch (_) {}
    return const [];
  }

  static String _readTerminalId(Map<String, dynamic> json) {
    final terminalId = json['terminalId'] as String?;
    if (terminalId == null || terminalId.trim().isEmpty) {
      throw const FormatException(
        'terminalId is required for production order documents; migrate legacy rows through local terminal identity first',
      );
    }
    return terminalId.trim();
  }

  static String _requireTerminalId(String? terminalId) {
    final normalized = terminalId?.trim();
    if (normalized == null || normalized.isEmpty) {
      throw ArgumentError(
        'Production terminal identity is required; use TerminalIdentityService before creating a production document',
      );
    }
    return normalized;
  }
}
