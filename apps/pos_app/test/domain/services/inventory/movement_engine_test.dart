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

// Helper function to create Insumo with parLevel
Insumo createInsumo({
  required String id,
  required String name,
  required double stock,
  double? parLevel,
}) {
  return Insumo(
    id: id,
    name: name,
    consumptionUom: 'g',
    stock: stock,
    averageCost: 0.5,
    parLevel: parLevel,
  );
}

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
      verify(mockRepo.processMovements(argThat(predicate<List<InventoryMovement>>((list) {
        return list.length == 1 && list.first.newStock == 982.0 && list.first.insumoId == 'ins-1';
      })))).called(1);
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
      verify(mockRepo.processMovements(argThat(predicate<List<InventoryMovement>>((list) {
        return list.length == 1 && list.first.newStock == 1000.0 && list.first.type == MovementType.reversal;
      })))).called(1);
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
      verify(mockRepo.processMovements(argThat(predicate<List<InventoryMovement>>((list) {
        return list.any((m) => m.insumoId == 'sugar' && m.newStock == 80.0);
      })))).called(1);
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

  group('MovementEngine - PAR Alert Crossing Check', () {
    // Task 3.5: Tests for non-volatile crossing check
    
    test('should fire alert when stock crosses from above to below PAR via shrinkage', () async {
      // GIVEN: Café with PAR level 500g and stock 550g (above PAR)
      final insumo = createInsumo(
        id: 'cafe-1',
        name: 'Café',
        stock: 550.0,
        parLevel: 500.0,
      );
      
      when(mockRepo.getInsumoById('cafe-1')).thenAnswer((_) async => insumo);

      // WHEN: Shrinkage of 100g reduces stock to 450g (crossing from 550 >= 500 to 450 < 500)
      await engine.recordShrinkage('cafe-1', 100.0, 'Spillage');

      // THEN: Alert should fire because crossing occurred
      verify(mockAlerts.notifyLowStock('Café', 450.0, 500.0)).called(1);
    });

    test('should NOT fire alert when stock stays below PAR via shrinkage', () async {
      // GIVEN: Leche with PAR level 2000ml and stock 1900ml (already below PAR)
      final insumo = createInsumo(
        id: 'leche-1',
        name: 'Leche',
        stock: 1900.0,
        parLevel: 2000.0,
      );
      
      when(mockRepo.getInsumoById('leche-1')).thenAnswer((_) async => insumo);

      // WHEN: Shrinkage of 100ml reduces stock to 1800ml (still below PAR)
      await engine.recordShrinkage('leche-1', 100.0, 'Expired');

      // THEN: Alert should NOT fire because no crossing occurred (was already below)
      verifyNever(mockAlerts.notifyLowStock(any, any, any));
    });

    test('should NOT fire alert when stock stays above PAR via shrinkage', () async {
      // GIVEN: Azúcar with PAR level 1000g and stock 1500g (well above PAR)
      final insumo = createInsumo(
        id: 'azucar-1',
        name: 'Azúcar',
        stock: 1500.0,
        parLevel: 1000.0,
      );
      
      when(mockRepo.getInsumoById('azucar-1')).thenAnswer((_) async => insumo);

      // WHEN: Shrinkage of 100g reduces stock to 1400g (still above PAR)
      await engine.recordShrinkage('azucar-1', 100.0, 'Sample');

      // THEN: Alert should NOT fire because stock is still above PAR
      verifyNever(mockAlerts.notifyLowStock(any, any, any));
    });

    test('should fire alert when stock crosses from above to below PAR via sale', () async {
      // GIVEN: Leche with PAR level 2000ml and stock 2100ml (above PAR)
      const productId = 'latte-1';
      final recipe = [
        const Recipe(
          id: 'r1',
          productId: productId,
          ingredientId: 'leche-1',
          ingredientType: IngredientType.insumo,
          quantity: 200.0, // Each latte uses 200ml
        ),
      ];
      final insumo = createInsumo(
        id: 'leche-1',
        name: 'Leche',
        stock: 2100.0,
        parLevel: 2000.0,
      );
      
      when(mockRepo.getRecipeByProductId(productId)).thenAnswer((_) async => recipe);
      when(mockRepo.getInsumoById('leche-1')).thenAnswer((_) async => insumo);

      // WHEN: Sale reduces stock from 2100 to 1900 (crossing from 2100 >= 2000 to 1900 < 2000)
      await engine.recordSale(productId, 1);

      // THEN: Alert should fire because crossing occurred
      verify(mockAlerts.notifyLowStock('Leche', 1900.0, 2000.0)).called(1);
    });

    test('should fire alert again after replenishment crosses back above PAR then below again', () async {
      // GIVEN: Leche starts at 1900ml (below PAR), then restocked to 2500ml
      final insumo = createInsumo(
        id: 'leche-1',
        name: 'Leche',
        stock: 2500.0, // After restocking
        parLevel: 2000.0,
      );
      
      when(mockRepo.getInsumoById('leche-1')).thenAnswer((_) async => insumo);

      // WHEN: Shrinkage of 600ml reduces stock from 2500 to 1900 (crossing from above to below)
      await engine.recordShrinkage('leche-1', 600.0, 'Quality check');

      // THEN: Alert should fire because crossing occurred again after restocking
      verify(mockAlerts.notifyLowStock('Leche', 1900.0, 2000.0)).called(1);
    });

    test('should NOT fire duplicate alert in same session when stock stays below PAR', () async {
      // GIVEN: Milk with PAR level 100ml and stock 90ml (already below PAR)
      final insumo = createInsumo(
        id: 'milk-1',
        name: 'Milk',
        stock: 90.0,
        parLevel: 100.0,
      );
      
      when(mockRepo.getInsumoById('milk-1')).thenAnswer((_) async => insumo);

      // WHEN: First shrinkage (90 -> 80, stays below PAR)
      await engine.recordShrinkage('milk-1', 10.0, 'Spill');
      
      // Update mock to return updated stock for second call
      when(mockRepo.getInsumoById('milk-1')).thenAnswer((_) async => insumo.copyWith(stock: 80.0));
      
      // Second shrinkage (80 -> 70, stays below PAR)
      await engine.recordShrinkage('milk-1', 10.0, 'Sample');

      // THEN: No alerts should fire because stock never crossed above->below
      verifyNever(mockAlerts.notifyLowStock(any, any, any));
    });
  });
}
