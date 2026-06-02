import '../../domain/models/inventory/purchase.dart';
import '../models/inventory/purchase_entity.dart';

class PurchaseMapper {
  /// Maps domain Purchase to entity for local persistence
  static PurchaseEntity toEntity(Purchase purchase) {
    return PurchaseEntity(
      id: purchase.id,
      insumoId: purchase.insumoId,
      supplierId: purchase.supplierId,
      quantity: purchase.quantity,
      unitCost: purchase.unitCost,
      timestamp: purchase.timestamp.toIso8601String(),
      invoiceDate: purchase.invoiceDate.toIso8601String(),
      currency: purchase.currency,
      bcnRate: purchase.bcnRate,
      unitCostNio: purchase.unitCostNio,
      cppBeforeNio: purchase.cppBeforeNio,
      projectedCppNio: purchase.projectedCppNio,
      lotCode: purchase.lotCode,
      receivedDate: purchase.receivedDate?.toIso8601String(),
      expirationDate: purchase.expirationDate?.toIso8601String(),
      requiresBatchTracking: purchase.requiresBatchTracking,
      isSynced: false,
    );
  }

  /// Maps entity to domain model
  static Purchase toDomain(PurchaseEntity entity) {
    return Purchase(
      id: entity.id,
      insumoId: entity.insumoId,
      supplierId: entity.supplierId,
      quantity: entity.quantity,
      unitCost: entity.unitCost,
      timestamp: DateTime.parse(entity.timestamp),
      invoiceDate: DateTime.parse(entity.invoiceDate),
      currency: entity.currency,
      bcnRate: entity.bcnRate,
      unitCostNio: entity.unitCostNio,
      cppBeforeNio: entity.cppBeforeNio,
      projectedCppNio: entity.projectedCppNio,
      lotCode: entity.lotCode,
      receivedDate: entity.receivedDate == null
          ? null
          : DateTime.parse(entity.receivedDate!),
      expirationDate: entity.expirationDate == null
          ? null
          : DateTime.parse(entity.expirationDate!),
      requiresBatchTracking: entity.requiresBatchTracking,
    );
  }

  /// Maps Purchase to JSON for backend sync
  static Map<String, dynamic> toSyncJson(Purchase purchase) {
    return {
      'id': purchase.id,
      'insumoId': purchase.insumoId,
      'supplierId': purchase.supplierId,
      'quantity': purchase.quantity,
      'unitCost': purchase.unitCost,
      'invoiceDate': purchase.invoiceDate.toIso8601String().split('T').first,
      'currency': purchase.currency,
      'bcnRate': purchase.bcnRate,
      'unitCostNio': purchase.unitCostNio,
      'projectedCppNio': purchase.projectedCppNio,
      'lotCode': purchase.lotCode,
      'receivedDate': purchase.receivedDate?.toIso8601String().split('T').first,
      'expirationDate': purchase.expirationDate
          ?.toIso8601String()
          .split('T')
          .first,
      'timestamp': purchase.timestamp.toIso8601String(),
    };
  }

  /// Maps backend response to domain Purchase
  static Purchase fromResponse(Map<String, dynamic> json) {
    return Purchase(
      id: json['id'] as String,
      insumoId: json['insumoId'] as String,
      supplierId: json['supplierId'] as String,
      quantity: (json['quantity'] as num).toDouble(),
      unitCost: (json['unitCost'] as num).toDouble(),
      timestamp: DateTime.parse(json['timestamp'] as String),
      invoiceDate: DateTime.parse(json['invoiceDate'] as String),
      currency: json['currency'] as String? ?? 'NIO',
      bcnRate: (json['bcnRate'] as num?)?.toDouble() ?? 1,
      unitCostNio: (json['unitCostNio'] as num?)?.toDouble(),
      projectedCppNio: (json['projectedCppNio'] as num?)?.toDouble(),
      lotCode: json['lotCode'] as String?,
      receivedDate: json['receivedDate'] == null
          ? null
          : DateTime.parse(json['receivedDate'] as String),
      expirationDate: json['expirationDate'] == null
          ? null
          : DateTime.parse(json['expirationDate'] as String),
    );
  }
}
