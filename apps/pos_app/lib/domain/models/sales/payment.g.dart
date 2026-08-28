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
      amountNio: (json['amountNio'] as num?)?.toDouble() ?? 0.0,
      changeGiven: (json['changeGiven'] as num?)?.toDouble() ?? 0.0,
      changeCurrency: json['changeCurrency'] as String? ?? 'NIO',
      voucherCode: json['voucherCode'] as String?,
      cardBrand: json['cardBrand'] as String?,
      cardType: json['cardType'] as String?,
      bankPos: json['bankPos'] as String?,
      reconciliationStatus: json['reconciliationStatus'] as String?,
      last4: json['last4'] as String?,
      batchNumber: json['batchNumber'] as String?,
      reconciledAt: json['reconciledAt'] == null
          ? null
          : DateTime.parse(json['reconciledAt'] as String),
      reconciledByUserId: json['reconciledByUserId'] as String?,
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
      'amountNio': instance.amountNio,
      'changeGiven': instance.changeGiven,
      'changeCurrency': instance.changeCurrency,
      'voucherCode': instance.voucherCode,
      'cardBrand': instance.cardBrand,
      'cardType': instance.cardType,
      'bankPos': instance.bankPos,
      'reconciliationStatus': instance.reconciliationStatus,
      'last4': instance.last4,
      'batchNumber': instance.batchNumber,
      'reconciledAt': instance.reconciledAt?.toIso8601String(),
      'reconciledByUserId': instance.reconciledByUserId,
      'createdAt': instance.createdAt?.toIso8601String(),
    };

const _$PaymentMethodEnumMap = {
  PaymentMethod.cash: 'cash',
  PaymentMethod.card: 'card',
  PaymentMethod.qr: 'qr',
  PaymentMethod.points: 'points',
};
