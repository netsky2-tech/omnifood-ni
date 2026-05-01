// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'recipe.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_$RecipeImpl _$$RecipeImplFromJson(Map<String, dynamic> json) => _$RecipeImpl(
      id: json['id'] as String,
      productId: json['productId'] as String,
      ingredientId: json['ingredientId'] as String,
      ingredientType:
          $enumDecode(_$IngredientTypeEnumMap, json['ingredientType']),
      quantity: (json['quantity'] as num).toDouble(),
    );

Map<String, dynamic> _$$RecipeImplToJson(_$RecipeImpl instance) =>
    <String, dynamic>{
      'id': instance.id,
      'productId': instance.productId,
      'ingredientId': instance.ingredientId,
      'ingredientType': _$IngredientTypeEnumMap[instance.ingredientType]!,
      'quantity': instance.quantity,
    };

const _$IngredientTypeEnumMap = {
  IngredientType.insumo: 'insumo',
  IngredientType.product: 'product',
};
