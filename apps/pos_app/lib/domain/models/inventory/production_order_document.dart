import 'dart:convert';

class ProductionOrderDocument {
  const ProductionOrderDocument({
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
    this.varianceReason,
    this.closedAt,
    this.movementReferences = const <String>[],
    this.isSynced = false,
  });

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
      producedExpirationDate: DateTime.parse(json['producedExpirationDate'] as String),
      operationDate: DateTime.parse(json['operationDate'] as String),
      status: json['status'] as String,
      varianceReason: json['varianceReason'] as String?,
      closedAt: json['closedAt'] == null
          ? null
          : DateTime.parse(json['closedAt'] as String),
      movementReferences: (json['movementReferences'] as List<dynamic>? ?? const <dynamic>[])
          .map((entry) => entry as String)
          .toList(growable: false),
      isSynced: (json['isSynced'] as bool?) ?? false,
    );
  }

  static List<String> decodeMovementReferences(String encoded) {
    final decoded = jsonDecode(encoded) as List<dynamic>;
    return decoded.map((entry) => entry as String).toList(growable: false);
  }
}
