// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'purchase.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_$PurchaseImpl _$$PurchaseImplFromJson(Map<String, dynamic> json) =>
    _$PurchaseImpl(
      id: json['id'] as String,
      insumoId: json['insumoId'] as String,
      supplierId: json['supplierId'] as String,
      quantity: (json['quantity'] as num).toDouble(),
      unitCost: (json['unitCost'] as num).toDouble(),
      timestamp: DateTime.parse(json['timestamp'] as String),
      invoiceDate: DateTime.parse(json['invoiceDate'] as String),
      currency: json['currency'] as String? ?? 'NIO',
      bcnRate: (json['bcnRate'] as num?)?.toDouble() ?? 1,
      unitCostNio: (json['unit_cost_nio'] as num?)?.toDouble(),
      cppBeforeNio: (json['cpp_before_nio'] as num?)?.toDouble(),
      projectedCppNio: (json['projected_cpp_nio'] as num?)?.toDouble(),
      lotCode: json['lot_code'] as String?,
      receivedDate: json['received_date'] == null
          ? null
          : DateTime.parse(json['received_date'] as String),
      expirationDate: json['expiration_date'] == null
          ? null
          : DateTime.parse(json['expiration_date'] as String),
      requiresBatchTracking: json['requires_batch_tracking'] as bool? ?? false,
    );

Map<String, dynamic> _$$PurchaseImplToJson(_$PurchaseImpl instance) =>
    <String, dynamic>{
      'id': instance.id,
      'insumoId': instance.insumoId,
      'supplierId': instance.supplierId,
      'quantity': instance.quantity,
      'unitCost': instance.unitCost,
      'timestamp': instance.timestamp.toIso8601String(),
      'invoiceDate': instance.invoiceDate.toIso8601String(),
      'currency': instance.currency,
      'bcnRate': instance.bcnRate,
      'unit_cost_nio': instance.unitCostNio,
      'cpp_before_nio': instance.cppBeforeNio,
      'projected_cpp_nio': instance.projectedCppNio,
      'lot_code': instance.lotCode,
      'received_date': instance.receivedDate?.toIso8601String(),
      'expiration_date': instance.expirationDate?.toIso8601String(),
      'requires_batch_tracking': instance.requiresBatchTracking,
    };
