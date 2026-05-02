// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'invoice.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_$InvoiceImpl _$$InvoiceImplFromJson(Map<String, dynamic> json) =>
    _$InvoiceImpl(
      id: json['id'] as String,
      number: json['number'] as String,
      createdAt: DateTime.parse(json['createdAt'] as String),
      userId: json['userId'] as String,
      subtotal: (json['subtotal'] as num).toDouble(),
      totalTax: (json['totalTax'] as num).toDouble(),
      total: (json['total'] as num).toDouble(),
      isCanceled: json['isCanceled'] as bool? ?? false,
      voidReason: json['voidReason'] as String?,
      syncStatus:
          $enumDecodeNullable(_$SyncStatusEnumMap, json['syncStatus']) ??
              SyncStatus.pending,
      paymentStatus:
          $enumDecodeNullable(_$PaymentStatusEnumMap, json['paymentStatus']) ??
              PaymentStatus.pending,
      type: $enumDecodeNullable(_$InvoiceTypeEnumMap, json['type']) ??
          InvoiceType.regular,
      customerId: json['customerId'] as String?,
      globalTaxOverride: json['globalTaxOverride'] as bool? ?? false,
      relatedInvoiceId: json['relatedInvoiceId'] as String?,
    );

Map<String, dynamic> _$$InvoiceImplToJson(_$InvoiceImpl instance) =>
    <String, dynamic>{
      'id': instance.id,
      'number': instance.number,
      'createdAt': instance.createdAt.toIso8601String(),
      'userId': instance.userId,
      'subtotal': instance.subtotal,
      'totalTax': instance.totalTax,
      'total': instance.total,
      'isCanceled': instance.isCanceled,
      'voidReason': instance.voidReason,
      'syncStatus': _$SyncStatusEnumMap[instance.syncStatus]!,
      'paymentStatus': _$PaymentStatusEnumMap[instance.paymentStatus]!,
      'type': _$InvoiceTypeEnumMap[instance.type]!,
      'customerId': instance.customerId,
      'globalTaxOverride': instance.globalTaxOverride,
      'relatedInvoiceId': instance.relatedInvoiceId,
    };

const _$SyncStatusEnumMap = {
  SyncStatus.pending: 'pending',
  SyncStatus.synced: 'synced',
  SyncStatus.error: 'error',
};

const _$PaymentStatusEnumMap = {
  PaymentStatus.pending: 'pending',
  PaymentStatus.partial: 'partial',
  PaymentStatus.paid: 'paid',
};

const _$InvoiceTypeEnumMap = {
  InvoiceType.regular: 'regular',
  InvoiceType.creditNote: 'creditNote',
};
