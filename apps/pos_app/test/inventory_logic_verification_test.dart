import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:pos_app/domain/models/inventory/insumo.dart';
import 'package:pos_app/domain/models/inventory/recipe.dart';
import 'package:mockito/annotations.dart';
import 'package:pos_app/domain/repositories/inventory/inventory_repository.dart';
import 'package:pos_app/domain/services/alerts/alert_service.dart';
import 'package:pos_app/domain/services/inventory/movement_engine_impl.dart';
import 'domain/services/inventory/movement_engine_test.mocks.dart';

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

  group('Scenario: Stock discount after sale', () {
    test('GIVEN a Capuccino with recipe (18g Coffee, 200ml Milk) and current stock '
         'WHEN a sale for 1 Capuccino is completed '
         'THEN the new stock MUST be updated correctly', () async {
      // GIVEN
      const productId = 'capuccino';
      final recipe = [
        const Recipe(
          id: 'r1',
          productId: productId,
          ingredientId: 'coffee-beans',
          ingredientType: IngredientType.insumo,
          quantity: 18.0,
        ),
        const Recipe(
          id: 'r2',
          productId: productId,
          ingredientId: 'milk',
          ingredientType: IngredientType.insumo,
          quantity: 200.0,
        ),
      ];

      final coffeeInsumo = const Insumo(
        id: 'coffee-beans',
        name: 'Granos de Café',
        consumptionUom: 'g',
        stock: 1000.0,
        averageCost: 0.05,
      );

      final milkInsumo = const Insumo(
        id: 'milk',
        name: 'Leche',
        consumptionUom: 'ml',
        stock: 2000.0,
        averageCost: 0.02,
      );

      when(mockRepo.getRecipeByProductId(productId)).thenAnswer((_) async => recipe);
      when(mockRepo.getInsumoById('coffee-beans')).thenAnswer((_) async => coffeeInsumo);
      when(mockRepo.getInsumoById('milk')).thenAnswer((_) async => milkInsumo);

      // WHEN
      await engine.recordSale(productId, 1.0);

      // THEN
      verify(mockRepo.updateInsumoStock('coffee-beans', 982.0)).called(1);
      verify(mockRepo.updateInsumoStock('milk', 1800.0)).called(1);
      // AND 2 Kardex entries created
      verify(mockRepo.saveMovement(any)).called(2);
    });

    test('GIVEN a recursive recipe (Product uses another Product) WHEN a sale is completed THEN all levels MUST be discounted', () async {
      // GIVEN
      // Product: "Combo Coffee + Cookie"
      // -> Product: "Capuccino" (Recursive)
      //    -> Insumo: "Coffee" (18g)
      // -> Insumo: "Cookie" (1 unit)

      const comboId = 'combo-1';
      const capuccinoId = 'capuccino';

      final comboRecipe = [
        const Recipe(
          id: 'cr1',
          productId: comboId,
          ingredientId: capuccinoId,
          ingredientType: IngredientType.product,
          quantity: 1.0,
        ),
        const Recipe(
          id: 'cr2',
          productId: comboId,
          ingredientId: 'cookie',
          ingredientType: IngredientType.insumo,
          quantity: 1.0,
        ),
      ];

      final capuccinoRecipe = [
        const Recipe(
          id: 'r1',
          productId: capuccinoId,
          ingredientId: 'coffee-beans',
          ingredientType: IngredientType.insumo,
          quantity: 18.0,
        ),
      ];

      final coffeeInsumo = const Insumo(
        id: 'coffee-beans',
        name: 'Granos de Café',
        consumptionUom: 'g',
        stock: 1000.0,
        averageCost: 0.05,
      );

      final cookieInsumo = const Insumo(
        id: 'cookie',
        name: 'Galleta',
        consumptionUom: 'unit',
        stock: 50.0,
        averageCost: 0.5,
      );

      when(mockRepo.getRecipeByProductId(comboId)).thenAnswer((_) async => comboRecipe);
      when(mockRepo.getRecipeByProductId(capuccinoId)).thenAnswer((_) async => capuccinoRecipe);
      when(mockRepo.getInsumoById('coffee-beans')).thenAnswer((_) async => coffeeInsumo);
      when(mockRepo.getInsumoById('cookie')).thenAnswer((_) async => cookieInsumo);

      // WHEN
      await engine.recordSale(comboId, 1.0);

      // THEN
      verify(mockRepo.updateInsumoStock('coffee-beans', 982.0)).called(1);
      verify(mockRepo.updateInsumoStock('cookie', 49.0)).called(1);
      verify(mockRepo.saveMovement(any)).called(2);
    });
  });
}
