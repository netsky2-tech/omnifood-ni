// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'recipe_item.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_$RecipeItemImpl _$$RecipeItemImplFromJson(Map<String, dynamic> json) =>
    _$RecipeItemImpl(
      productId: json['productId'] as String,
      ingredientId: json['ingredientId'] as String,
      quantity: (json['quantity'] as num).toDouble(),
    );

Map<String, dynamic> _$$RecipeItemImplToJson(_$RecipeItemImpl instance) =>
    <String, dynamic>{
      'productId': instance.productId,
      'ingredientId': instance.ingredientId,
      'quantity': instance.quantity,
    };
