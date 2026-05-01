import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/annotations.dart';
import 'package:mockito/mockito.dart';
import 'package:pos_app/domain/models/inventory/insumo.dart';
import 'package:pos_app/domain/models/inventory/recipe.dart';
import 'package:pos_app/domain/models/inventory/inventory_movement.dart';
import 'package:pos_app/domain/repositories/inventory/inventory_repository.dart';
import 'package:pos_app/domain/services/alerts/alert_service.dart';
import 'package:pos_app/domain/services/inventory/movement_engine_impl.dart';

import 'movement_engine_test.mocks.dart';

@GenerateMocks([InventoryRepository, AlertService])
void main() {
  late MockInventoryRepository mockRepo;
  late MockAlertService mockAlerts;
  late MovementEngineImpl engine;

  setUp(() {
    mockRepo = MockInventoryRepository();
    mockAlerts = MockAlertService();
    engine = MovementEngineImpl(mockRepo, mockAlerts);
  });

  group('MovementEngine - recordSale', () {
    test('should discount stock correctly for a product with recipe', () async {
      // GIVEN
      const productId = 'prod-1';
      final recipe = [
        const Recipe(
          id: 'r1',
          productId: productId,
          ingredientId: 'ins-1',
          ingredientType: IngredientType.insumo,
          quantity: 18.0,
        ),
      ];
      const initialInsumo = Insumo(
        id: 'ins-1',
        name: 'Café',
        consumptionUom: 'g',
        stock: 1000.0,
        averageCost: 0.5,
      );

      when(mockRepo.getRecipeByProductId(productId)).thenAnswer((_) async => recipe);
      when(mockRepo.getInsumoById('ins-1')).thenAnswer((_) async => initialInsumo);

      // WHEN
      await engine.recordSale(productId, 1);

      // THEN
      verify(mockRepo.updateInsumoStock('ins-1', 982.0)).called(1);
      verify(mockRepo.saveMovement(any)).called(1);
    });
  });

  group('MovementEngine - recordReversal', () {
    test('should increase stock correctly for a product reversal', () async {
      // GIVEN
      const productId = 'prod-1';
      final recipe = [
        const Recipe(
          id: 'r1',
          productId: productId,
          ingredientId: 'ins-1',
          ingredientType: IngredientType.insumo,
          quantity: 18.0,
        ),
      ];
      const initialInsumo = Insumo(
        id: 'ins-1',
        name: 'Café',
        consumptionUom: 'g',
        stock: 982.0, // After sale
        averageCost: 0.5,
      );

      when(mockRepo.getRecipeByProductId(productId)).thenAnswer((_) async => recipe);
      when(mockRepo.getInsumoById('ins-1')).thenAnswer((_) async => initialInsumo);

      // WHEN
      await engine.recordReversal(productId, 1, 'Canceled invoice');

      // THEN
      verify(mockRepo.updateInsumoStock('ins-1', 1000.0)).called(1);
      verify(mockRepo.saveMovement(argThat(predicate<InventoryMovement>((m) => m.type == MovementType.reversal)))).called(1);
    });
  });

  group('MovementEngine - Advanced Logic', () {
    test('should recursively descale sub-recipes', () async {
      // GIVEN
      const productId = 'vanilla-latte';
      final topRecipe = [
        const Recipe(
          id: 'r1',
          productId: productId,
          ingredientId: 'vanilla-syrup',
          ingredientType: IngredientType.product, // Sub-recipe
          quantity: 2.0,
        ),
      ];
      final subRecipe = [
        const Recipe(
          id: 'r2',
          productId: 'vanilla-syrup',
          ingredientId: 'sugar',
          ingredientType: IngredientType.insumo,
          quantity: 10.0,
        ),
      ];
      const initialSugar = Insumo(
        id: 'sugar',
        name: 'Sugar',
        consumptionUom: 'g',
        stock: 100.0,
        averageCost: 0.1,
      );

      when(mockRepo.getRecipeByProductId(productId)).thenAnswer((_) async => topRecipe);
      when(mockRepo.getRecipeByProductId('vanilla-syrup')).thenAnswer((_) async => subRecipe);
      when(mockRepo.getInsumoById('sugar')).thenAnswer((_) async => initialSugar);

      // WHEN
      await engine.recordSale(productId, 1);

      // THEN
      // 2.0 units of syrup * 10.0g of sugar = 20.0g sugar discounted
      verify(mockRepo.updateInsumoStock('sugar', 80.0)).called(1);
    });

    test('should trigger PAR alert when stock falls below threshold', () async {
      // GIVEN
      const productId = 'prod-1';
      final recipe = [
        const Recipe(
          id: 'r1',
          productId: productId,
          ingredientId: 'ins-1',
          ingredientType: IngredientType.insumo,
          quantity: 50.0,
        ),
      ];
      const initialInsumo = Insumo(
        id: 'ins-1',
        name: 'Milk',
        consumptionUom: 'ml',
        stock: 100.0,
        averageCost: 0.1,
        parLevel: 60.0,
      );

      when(mockRepo.getRecipeByProductId(productId)).thenAnswer((_) async => recipe);
      when(mockRepo.getInsumoById('ins-1')).thenAnswer((_) async => initialInsumo);

      // WHEN
      await engine.recordSale(productId, 1); // Stock becomes 50.0 (< 60.0)

      // THEN
      verify(mockAlerts.notifyLowStock('Milk', 50.0, 60.0)).called(1);
    });

    test('should deduplicate PAR alerts in same session', () async {
      // GIVEN
      const productId = 'prod-1';
      final recipe = [
        const Recipe(
          id: 'r1',
          productId: productId,
          ingredientId: 'ins-1',
          ingredientType: IngredientType.insumo,
          quantity: 10.0,
        ),
      ];
      const initialInsumo = Insumo(
        id: 'ins-1',
        name: 'Milk',
        consumptionUom: 'ml',
        stock: 100.0,
        averageCost: 0.1,
        parLevel: 95.0,
      );

      when(mockRepo.getRecipeByProductId(productId)).thenAnswer((_) async => recipe);
      when(mockRepo.getInsumoById('ins-1')).thenAnswer((_) async => initialInsumo);

      // WHEN
      await engine.recordSale(productId, 1); // Stock 90 (Trigger alert)
      
      // Update stock for second call simulation
      when(mockRepo.getInsumoById('ins-1')).thenAnswer((_) async => initialInsumo.copyWith(stock: 90.0));
      await engine.recordSale(productId, 1); // Stock 80 (Should NOT trigger alert again)

      // THEN
      verify(mockAlerts.notifyLowStock('Milk', any, any)).called(1);
    });
  });
}
