// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'promotion.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_$PromotionImpl _$$PromotionImplFromJson(Map<String, dynamic> json) =>
    _$PromotionImpl(
      id: json['id'] as String,
      name: json['name'] as String,
      type: $enumDecode(_$PromotionTypeEnumMap, json['type']),
      targetProductId: json['targetProductId'] as String,
      buyQuantity: json['buyQuantity'] as int? ?? 0,
      getQuantity: json['getQuantity'] as int? ?? 0,
      discountValue: (json['discountValue'] as num?)?.toDouble() ?? 0.0,
      isActive: json['isActive'] as bool? ?? true,
    );

Map<String, dynamic> _$$PromotionImplToJson(_$PromotionImpl instance) =>
    <String, dynamic>{
      'id': instance.id,
      'name': instance.name,
      'type': _$PromotionTypeEnumMap[instance.type]!,
      'targetProductId': instance.targetProductId,
      'buyQuantity': instance.buyQuantity,
      'getQuantity': instance.getQuantity,
      'discountValue': instance.discountValue,
      'isActive': instance.isActive,
    };

const _$PromotionTypeEnumMap = {
  PromotionType.buyXGetYFree: 'buyXGetYFree',
  PromotionType.percentageDiscount: 'percentageDiscount',
  PromotionType.fixedDiscount: 'fixedDiscount',
};
