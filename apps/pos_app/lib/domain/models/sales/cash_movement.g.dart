// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'cash_movement.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_$CashMovementImpl _$$CashMovementImplFromJson(Map<String, dynamic> json) =>
    _$CashMovementImpl(
      id: json['id'] as String,
      shiftId: json['shiftId'] as String,
      terminalId: json['terminalId'] as String? ?? 'default-terminal',
      type: $enumDecode(_$CashMovementTypeEnumMap, json['type']),
      amountNio: (json['amountNio'] as num).toDouble(),
      amountUsd: (json['amountUsd'] as num?)?.toDouble() ?? 0.0,
      reason: json['reason'] as String,
      authorizedByUserId: json['authorizedByUserId'] as String?,
      timestamp: DateTime.parse(json['timestamp'] as String),
      syncStatus: json['syncStatus'] as String? ?? 'pending',
    );

Map<String, dynamic> _$$CashMovementImplToJson(_$CashMovementImpl instance) =>
    <String, dynamic>{
      'id': instance.id,
      'shiftId': instance.shiftId,
      'terminalId': instance.terminalId,
      'type': _$CashMovementTypeEnumMap[instance.type]!,
      'amountNio': instance.amountNio,
      'amountUsd': instance.amountUsd,
      'reason': instance.reason,
      'authorizedByUserId': instance.authorizedByUserId,
      'timestamp': instance.timestamp.toIso8601String(),
      'syncStatus': instance.syncStatus,
    };

const _$CashMovementTypeEnumMap = {
  CashMovementType.cashIn: 'CASH_IN',
  CashMovementType.cashOut: 'CASH_OUT',
  CashMovementType.pettyCash: 'PETTY_CASH',
  CashMovementType.safeDrop: 'SAFE_DROP',
};
