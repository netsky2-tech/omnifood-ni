// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'cashier_session.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_$CashierSessionImpl _$$CashierSessionImplFromJson(Map<String, dynamic> json) =>
    _$CashierSessionImpl(
      id: json['id'] as String,
      userId: json['userId'] as String,
      terminalId: json['terminalId'] as String? ?? 'default-terminal',
      openedAt: DateTime.parse(json['openedAt'] as String),
      tipoModelo:
          $enumDecodeNullable(_$CashSessionModelEnumMap, json['tipo_modelo']) ??
              CashSessionModel.cajaCentral,
      closedAt: json['closedAt'] == null
          ? null
          : DateTime.parse(json['closedAt'] as String),
      openingBalance: (json['openingBalance'] as num?)?.toDouble() ?? 0.0,
      openingBalanceNio: (json['openingBalanceNio'] as num?)?.toDouble() ?? 0.0,
      openingBalanceUsd: (json['openingBalanceUsd'] as num?)?.toDouble() ?? 0.0,
      closingBalance: (json['closingBalance'] as num?)?.toDouble(),
      closingCountedNio: (json['closingCountedNio'] as num?)?.toDouble(),
      closingCountedUsd: (json['closingCountedUsd'] as num?)?.toDouble(),
      totalSales: (json['totalSales'] as num?)?.toDouble(),
      totalExpected: (json['totalExpected'] as num?)?.toDouble() ?? 0.0,
      expectedNio: (json['expectedNio'] as num?)?.toDouble() ?? 0.0,
      expectedUsd: (json['expectedUsd'] as num?)?.toDouble() ?? 0.0,
      differenceNio: (json['differenceNio'] as num?)?.toDouble(),
      differenceUsd: (json['differenceUsd'] as num?)?.toDouble(),
      zReportSequence: json['zReportSequence'] as int?,
      isClosed: json['isClosed'] as bool? ?? false,
      supervisorId: json['supervisorId'] as String?,
      notes: json['notes'] as String?,
      syncStatus: json['syncStatus'] as String? ?? 'pending',
    );

Map<String, dynamic> _$$CashierSessionImplToJson(
        _$CashierSessionImpl instance) =>
    <String, dynamic>{
      'id': instance.id,
      'userId': instance.userId,
      'terminalId': instance.terminalId,
      'openedAt': instance.openedAt.toIso8601String(),
      'tipo_modelo': _$CashSessionModelEnumMap[instance.tipoModelo]!,
      'closedAt': instance.closedAt?.toIso8601String(),
      'openingBalance': instance.openingBalance,
      'openingBalanceNio': instance.openingBalanceNio,
      'openingBalanceUsd': instance.openingBalanceUsd,
      'closingBalance': instance.closingBalance,
      'closingCountedNio': instance.closingCountedNio,
      'closingCountedUsd': instance.closingCountedUsd,
      'totalSales': instance.totalSales,
      'totalExpected': instance.totalExpected,
      'expectedNio': instance.expectedNio,
      'expectedUsd': instance.expectedUsd,
      'differenceNio': instance.differenceNio,
      'differenceUsd': instance.differenceUsd,
      'zReportSequence': instance.zReportSequence,
      'isClosed': instance.isClosed,
      'supervisorId': instance.supervisorId,
      'notes': instance.notes,
      'syncStatus': instance.syncStatus,
    };

const _$CashSessionModelEnumMap = {
  CashSessionModel.cajaCentral: 'CAJA_CENTRAL',
  CashSessionModel.carteraMesero: 'CARTERA_MESERO',
};
