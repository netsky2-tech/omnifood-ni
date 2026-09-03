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
      loyaltyProgramId: json['loyaltyProgramId'] as String?,
      ticketId: json['ticketId'] as String?,
      rewardId: json['rewardId'] as String?,
      transactionType: json['transactionType'] as String?,
      units: json['units'] as int?,
      reversalOfTransactionId: json['reversalOfTransactionId'] as String?,
      idempotencyKey: json['idempotencyKey'] as String?,
      sourceEventId: json['sourceEventId'] as String?,
      actorUserId: json['actorUserId'] as String?,
      branchId: json['branchId'] as String?,
      terminalId: json['terminalId'] as String?,
      programVersion: json['programVersion'] as int?,
      rewardVersion: json['rewardVersion'] as int?,
      commercialSnapshot: json['commercialSnapshot'] as String?,
      origin: json['origin'] as String?,
      occurredAt: json['occurredAt'] == null
          ? null
          : DateTime.parse(json['occurredAt'] as String),
      recordedAt: json['recordedAt'] == null
          ? null
          : DateTime.parse(json['recordedAt'] as String),
      legacyImported: json['legacyImported'] as bool? ?? false,
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
      'loyaltyProgramId': instance.loyaltyProgramId,
      'ticketId': instance.ticketId,
      'rewardId': instance.rewardId,
      'transactionType': instance.transactionType,
      'units': instance.units,
      'reversalOfTransactionId': instance.reversalOfTransactionId,
      'idempotencyKey': instance.idempotencyKey,
      'sourceEventId': instance.sourceEventId,
      'actorUserId': instance.actorUserId,
      'branchId': instance.branchId,
      'terminalId': instance.terminalId,
      'programVersion': instance.programVersion,
      'rewardVersion': instance.rewardVersion,
      'commercialSnapshot': instance.commercialSnapshot,
      'origin': instance.origin,
      'occurredAt': instance.occurredAt?.toIso8601String(),
      'recordedAt': instance.recordedAt?.toIso8601String(),
      'legacyImported': instance.legacyImported,
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
