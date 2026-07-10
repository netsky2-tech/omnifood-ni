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
      id: json['id'] as String,
      recipeVersionId: json['recipeVersionId'] as String,
      recipeProductId: json['recipeProductId'] as String,
      recipeProductName: json['recipeProductName'] as String,
      producedInsumoId: json['producedInsumoId'] as String,
      producedInsumoName: json['producedInsumoName'] as String,
      plannedQuantity: (json['plannedQuantity'] as num).toDouble(),
      actualQuantity: (json['actualQuantity'] as num).toDouble(),
      producedBatchNumber: json['producedBatchNumber'] as String,
      producedExpirationDate: DateTime.parse(
        json['producedExpirationDate'] as String,
      ),
      operationDate: DateTime.parse(json['operationDate'] as String),
      status: json['status'] as String,
      outcome: (json['outcome'] as String?) ?? 'COMPLETED',
      failureReason: json['failureReason'] as String?,
      terminalId: _readTerminalId(json),
      sourceSequence: (json['sourceSequence'] as num?)?.toInt() ?? 0,
      idempotencyKey: json['idempotencyKey'] as String?,
      payloadHash: json['payloadHash'] as String?,
      totalConsumedCostNio:
          (json['totalConsumedCostNio'] as num?)?.toDouble() ?? 0,
      producedUnitCostNio:
          (json['producedUnitCostNio'] as num?)?.toDouble() ?? 0,
      varianceReason: json['varianceReason'] as String?,
      closedAt: json['closedAt'] == null
          ? null
          : DateTime.parse(json['closedAt'] as String),
      movementReferences:
          (json['movementReferences'] as List<dynamic>? ?? const <dynamic>[])
              .map((entry) => entry as String)
              .toList(growable: false),
      isSynced: (json['isSynced'] as bool?) ?? false,
    );
  }

  static List<String> decodeMovementReferences(String encoded) {
    final decoded = jsonDecode(encoded) as List<dynamic>;
    return decoded.map((entry) => entry as String).toList(growable: false);
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
