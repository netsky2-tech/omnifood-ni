// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'batch_settlement.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_$BatchSettlementImpl _$$BatchSettlementImplFromJson(
        Map<String, dynamic> json) =>
    _$BatchSettlementImpl(
      id: json['id'] as String,
      batchNumber: json['batchNumber'] as String,
      terminalId: json['terminalId'] as String,
      bankPos: json['bankPos'] as String? ?? 'BAC',
      totalTransactions: json['totalTransactions'] as int? ?? 0,
      totalAmountNio: (json['totalAmountNio'] as num?)?.toDouble() ?? 0.0,
      totalAmountUsd: (json['totalAmountUsd'] as num?)?.toDouble() ?? 0.0,
      status: json['status'] as String? ?? 'OPEN',
      openedAt: DateTime.parse(json['openedAt'] as String),
      settledAt: json['settledAt'] == null
          ? null
          : DateTime.parse(json['settledAt'] as String),
      sessionId: json['sessionId'] as String?,
      settledByUserId: json['settledByUserId'] as String?,
      notes: json['notes'] as String?,
    );

Map<String, dynamic> _$$BatchSettlementImplToJson(
        _$BatchSettlementImpl instance) =>
    <String, dynamic>{
      'id': instance.id,
      'batchNumber': instance.batchNumber,
      'terminalId': instance.terminalId,
      'bankPos': instance.bankPos,
      'totalTransactions': instance.totalTransactions,
      'totalAmountNio': instance.totalAmountNio,
      'totalAmountUsd': instance.totalAmountUsd,
      'status': instance.status,
      'openedAt': instance.openedAt.toIso8601String(),
      'settledAt': instance.settledAt?.toIso8601String(),
      'sessionId': instance.sessionId,
      'settledByUserId': instance.settledByUserId,
      'notes': instance.notes,
    };
