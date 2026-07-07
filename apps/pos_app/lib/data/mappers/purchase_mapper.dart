import '../../domain/models/inventory/purchase.dart';
import '../models/inventory/purchase_entity.dart';

bool _shouldSyncExplicitBcnRate(Purchase purchase) {
  return purchase.currency == 'USD' &&
      purchase.fxRateMode != purchaseFxRateModeOfficial;
}

class PurchaseMapper {
  /// Maps domain Purchase to entity for local persistence
  static PurchaseEntity toEntity(Purchase purchase) {
    return PurchaseEntity(
      id: purchase.id,
      insumoId: purchase.insumoId,
      supplierId: purchase.supplierId,
      invoiceNumber: purchase.invoiceNumber,
      quantity: purchase.quantity,
      unitCost: purchase.unitCost,
      timestamp: purchase.timestamp.toIso8601String(),
      invoiceDate: purchase.invoiceDate.toIso8601String(),
      currency: purchase.currency,
      bcnRate: purchase.bcnRate,
      fxRateMode: purchase.fxRateMode,
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
      invoiceNumber: entity.invoiceNumber,
      quantity: entity.quantity,
      unitCost: entity.unitCost,
      timestamp: DateTime.parse(entity.timestamp),
      invoiceDate: DateTime.parse(entity.invoiceDate),
      currency: entity.currency,
      bcnRate: entity.bcnRate,
      fxRateMode: entity.fxRateMode,
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
    final payload = <String, dynamic>{
      'id': purchase.id,
      'insumoId': purchase.insumoId,
      'supplierId': purchase.supplierId,
      'invoiceNumber': purchase.invoiceNumber,
      'quantity': purchase.quantity,
      'unitCost': purchase.unitCost,
      'invoiceDate': purchase.invoiceDate.toIso8601String().split('T').first,
      'currency': purchase.currency,
      'unitCostNio': purchase.unitCostNio,
      'projectedCppNio': purchase.projectedCppNio,
      'lotCode': purchase.lotCode,
      'receivedDate': purchase.receivedDate?.toIso8601String().split('T').first,
      'expirationDate': purchase.expirationDate
          ?.toIso8601String()
          .split('T')
          .first,
      'entryTimestamp': purchase.timestamp.toIso8601String(),
    };

    if (purchase.fxRateMode != null) {
      payload['fxRateMode'] = purchase.fxRateMode;
    }

    if (_shouldSyncExplicitBcnRate(purchase)) {
      payload['bcnRate'] = purchase.bcnRate;
    }

    return payload;
  }

  /// Maps backend response to domain Purchase
  static Purchase fromResponse(Map<String, dynamic> json) {
    final currency = json['currency'] as String? ?? 'NIO';
    final rawBcnRate = (json['bcnRate'] as num?)?.toDouble();

    if (currency == 'USD' && (rawBcnRate == null || rawBcnRate <= 0)) {
      throw StateError('USD purchase responses require an explicit bcnRate.');
    }

    return Purchase(
      id: json['id'] as String,
      insumoId: json['insumoId'] as String,
      supplierId: json['supplierId'] as String,
      invoiceNumber: json['invoiceNumber'] as String,
      quantity: (json['quantity'] as num).toDouble(),
      unitCost: (json['unitCost'] as num).toDouble(),
      timestamp: DateTime.parse(json['timestamp'] as String),
      invoiceDate: DateTime.parse(json['invoiceDate'] as String),
      currency: currency,
      bcnRate: rawBcnRate ?? 1,
      fxRateMode: json['fxRateMode'] as String?,
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
