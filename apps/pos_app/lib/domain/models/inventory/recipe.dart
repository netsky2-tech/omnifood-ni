import 'package:freezed_annotation/freezed_annotation.dart';

part 'recipe.freezed.dart';
part 'recipe.g.dart';

enum IngredientType {
  insumo,
  product,
}

@freezed
class Recipe with _$Recipe {
  const factory Recipe({
    required String id,
    required String productId,
    required String ingredientId,
    required IngredientType ingredientType,
    required double quantity,
  }) = _Recipe;

  factory Recipe.fromJson(Map<String, dynamic> json) => _$RecipeFromJson(json);
}
