import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/models/ingredient.dart';
import 'package:pos_app/domain/models/product.dart';
import 'package:pos_app/domain/models/recipe_item.dart';
import 'package:pos_app/domain/models/inventory_adjustment.dart';

void main() {
  group('Inventory Domain Models', () {
    test('Ingredient can be instantiated', () {
      final ingredient = Ingredient(
        id: '1',
        name: 'Coffee Beans',
        unitOfMeasure: 'oz',
      );
      expect(ingredient.name, 'Coffee Beans');
    });

    test('Product can be instantiated', () {
      final product = Product(
        id: '1',
        name: 'Latte',
        basePrice: 3.5,
      );
      expect(product.name, 'Latte');
    });

    test('RecipeItem can be instantiated', () {
      final recipeItem = RecipeItem(
        productId: 'p1',
        ingredientId: 'i1',
        quantity: 2.0,
      );
      expect(recipeItem.quantity, 2.0);
    });

    test('InventoryAdjustment can be instantiated', () {
      final adjustment = InventoryAdjustment(
        id: 'a1',
        ingredientId: 'i1',
        delta: -2.0,
        reason: 'sale',
        timestamp: DateTime.now(),
      );
      expect(adjustment.delta, -2.0);
    });
  });
}
