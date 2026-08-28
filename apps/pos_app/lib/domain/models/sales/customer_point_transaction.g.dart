// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'customer_point_transaction.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_$CustomerPointTransactionImpl _$$CustomerPointTransactionImplFromJson(
        Map<String, dynamic> json) =>
    _$CustomerPointTransactionImpl(
      id: json['id'] as String,
      customerId: json['customerId'] as String,
      invoiceId: json['invoiceId'] as String?,
      type: $enumDecode(_$PointTransactionTypeEnumMap, json['type']),
      points: (json['points'] as num).toDouble(),
      balanceAfter: (json['balanceAfter'] as num).toDouble(),
      conversionRate: (json['conversionRate'] as num?)?.toDouble() ?? 0.1,
      reason: json['reason'] as String?,
      createdAt: DateTime.parse(json['createdAt'] as String),
      syncStatus:
          $enumDecodeNullable(_$SyncStatusEnumMap, json['syncStatus']) ??
              SyncStatus.pending,
    );

Map<String, dynamic> _$$CustomerPointTransactionImplToJson(
        _$CustomerPointTransactionImpl instance) =>
    <String, dynamic>{
      'id': instance.id,
      'customerId': instance.customerId,
      'invoiceId': instance.invoiceId,
      'type': _$PointTransactionTypeEnumMap[instance.type]!,
      'points': instance.points,
      'balanceAfter': instance.balanceAfter,
      'conversionRate': instance.conversionRate,
      'reason': instance.reason,
      'createdAt': instance.createdAt.toIso8601String(),
      'syncStatus': _$SyncStatusEnumMap[instance.syncStatus]!,
    };

const _$PointTransactionTypeEnumMap = {
  PointTransactionType.earn: 'earn',
  PointTransactionType.redeem: 'redeem',
  PointTransactionType.adjust: 'adjust',
};

const _$SyncStatusEnumMap = {
  SyncStatus.pending: 'pending',
  SyncStatus.synced: 'synced',
  SyncStatus.error: 'error',
};
