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
    );
  }
}