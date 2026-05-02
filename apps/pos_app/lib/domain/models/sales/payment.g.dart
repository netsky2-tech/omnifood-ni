// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'payment.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_$PaymentImpl _$$PaymentImplFromJson(Map<String, dynamic> json) =>
    _$PaymentImpl(
      id: json['id'] as String,
      invoiceId: json['invoiceId'] as String,
      method: $enumDecode(_$PaymentMethodEnumMap, json['method']),
      amount: (json['amount'] as num).toDouble(),
      currency: json['currency'] as String? ?? 'NIO',
      exchangeRate: (json['exchangeRate'] as num?)?.toDouble() ?? 1.0,
      createdAt: json['createdAt'] == null
          ? null
          : DateTime.parse(json['createdAt'] as String),
    );

Map<String, dynamic> _$$PaymentImplToJson(_$PaymentImpl instance) =>
    <String, dynamic>{
      'id': instance.id,
      'invoiceId': instance.invoiceId,
      'method': _$PaymentMethodEnumMap[instance.method]!,
      'amount': instance.amount,
      'currency': instance.currency,
      'exchangeRate': instance.exchangeRate,
      'createdAt': instance.createdAt?.toIso8601String(),
    };

const _$PaymentMethodEnumMap = {
  PaymentMethod.cash: 'cash',
  PaymentMethod.card: 'card',
  PaymentMethod.qr: 'qr',
  PaymentMethod.points: 'points',
};
