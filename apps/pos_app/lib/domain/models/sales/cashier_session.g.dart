// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'cashier_session.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_$CashierSessionImpl _$$CashierSessionImplFromJson(Map<String, dynamic> json) =>
    _$CashierSessionImpl(
      id: json['id'] as String,
      userId: json['userId'] as String,
      openedAt: DateTime.parse(json['openedAt'] as String),
      closedAt: json['closedAt'] == null
          ? null
          : DateTime.parse(json['closedAt'] as String),
      openingBalance: (json['openingBalance'] as num).toDouble(),
      closingBalance: (json['closingBalance'] as num?)?.toDouble(),
      totalSales: (json['totalSales'] as num?)?.toDouble(),
      totalExpected: (json['totalExpected'] as num?)?.toDouble(),
      isClosed: json['isClosed'] as bool? ?? false,
    );

Map<String, dynamic> _$$CashierSessionImplToJson(
        _$CashierSessionImpl instance) =>
    <String, dynamic>{
      'id': instance.id,
      'userId': instance.userId,
      'openedAt': instance.openedAt.toIso8601String(),
      'closedAt': instance.closedAt?.toIso8601String(),
      'openingBalance': instance.openingBalance,
      'closingBalance': instance.closingBalance,
      'totalSales': instance.totalSales,
      'totalExpected': instance.totalExpected,
      'isClosed': instance.isClosed,
    };
