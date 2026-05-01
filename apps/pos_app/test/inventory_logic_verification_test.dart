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
      await engine.recordSale(productId, 1);

      // THEN
      verify(mockRepo.updateInsumoStock('coffee-beans', 982.0)).called(1);
      verify(mockRepo.updateInsumoStock('milk', 1800.0)).called(1);
      // AND 2 Kardex entries created
      verify(mockRepo.saveMovement(any)).called(2);
    });
  });
}
