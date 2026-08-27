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
      targetProductId: json['targetProductId'] as String?,
      targetCategoryId: json['targetCategoryId'] as String?,
      buyQuantity: json['buyQuantity'] as int? ?? 0,
      getQuantity: json['getQuantity'] as int? ?? 0,
      discountValue: (json['discountValue'] as num?)?.toDouble() ?? 0.0,
      minOrderAmount: (json['minOrderAmount'] as num?)?.toDouble() ?? 0.0,
      daysOfWeek: (json['daysOfWeek'] as List<dynamic>?)
              ?.map((e) => e as int)
              .toList() ??
          const [],
      startTime: json['startTime'] as String?,
      endTime: json['endTime'] as String?,
      startDate: json['startDate'] as int?,
      endDate: json['endDate'] as int?,
      priority: json['priority'] as int? ?? 0,
      isStackable: json['isStackable'] as bool? ?? true,
      isActive: json['isActive'] as bool? ?? true,
    );

Map<String, dynamic> _$$PromotionImplToJson(_$PromotionImpl instance) =>
    <String, dynamic>{
      'id': instance.id,
      'name': instance.name,
      'type': _$PromotionTypeEnumMap[instance.type]!,
      'targetProductId': instance.targetProductId,
      'targetCategoryId': instance.targetCategoryId,
      'buyQuantity': instance.buyQuantity,
      'getQuantity': instance.getQuantity,
      'discountValue': instance.discountValue,
      'minOrderAmount': instance.minOrderAmount,
      'daysOfWeek': instance.daysOfWeek,
      'startTime': instance.startTime,
      'endTime': instance.endTime,
      'startDate': instance.startDate,
      'endDate': instance.endDate,
      'priority': instance.priority,
      'isStackable': instance.isStackable,
      'isActive': instance.isActive,
    };

const _$PromotionTypeEnumMap = {
  PromotionType.buyXGetYFree: 'buyXGetYFree',
  PromotionType.percentageDiscount: 'percentageDiscount',
  PromotionType.fixedDiscount: 'fixedDiscount',
  PromotionType.comboPackage: 'comboPackage',
};
