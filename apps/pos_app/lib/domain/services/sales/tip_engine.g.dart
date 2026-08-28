// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'tip_engine.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_$TipCalculationImpl _$$TipCalculationImplFromJson(Map<String, dynamic> json) =>
    _$TipCalculationImpl(
      tipType: $enumDecode(_$TipTypeEnumMap, json['tipType']),
      tipAmountNio: (json['tipAmountNio'] as num).toDouble(),
      tipAmountUsd: (json['tipAmountUsd'] as num).toDouble(),
      effectivePercentage: (json['effectivePercentage'] as num).toDouble(),
      subtotalNio: (json['subtotalNio'] as num).toDouble(),
      taxNio: (json['taxNio'] as num).toDouble(),
      discountNio: (json['discountNio'] as num).toDouble(),
      totalWithTipNio: (json['totalWithTipNio'] as num).toDouble(),
      totalWithTipUsd: (json['totalWithTipUsd'] as num).toDouble(),
      commercialRate: (json['commercialRate'] as num).toDouble(),
    );

Map<String, dynamic> _$$TipCalculationImplToJson(
        _$TipCalculationImpl instance) =>
    <String, dynamic>{
      'tipType': _$TipTypeEnumMap[instance.tipType]!,
      'tipAmountNio': instance.tipAmountNio,
      'tipAmountUsd': instance.tipAmountUsd,
      'effectivePercentage': instance.effectivePercentage,
      'subtotalNio': instance.subtotalNio,
      'taxNio': instance.taxNio,
      'discountNio': instance.discountNio,
      'totalWithTipNio': instance.totalWithTipNio,
      'totalWithTipUsd': instance.totalWithTipUsd,
      'commercialRate': instance.commercialRate,
    };

const _$TipTypeEnumMap = {
  TipType.suggestedTenPercent: 'SUGGESTED_10_PERCENT',
  TipType.customPercentage: 'CUSTOM_PERCENTAGE',
  TipType.fixedAmountNio: 'FIXED_AMOUNT_NIO',
  TipType.fixedAmountUsd: 'FIXED_AMOUNT_USD',
  TipType.none: 'NONE',
};
