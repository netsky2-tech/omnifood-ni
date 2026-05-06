import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:pos_app/domain/models/inventory/insumo.dart';
import 'package:pos_app/domain/models/inventory/recipe.dart';
import 'package:pos_app/domain/models/inventory/inventory_movement.dart';
import 'package:pos_app/domain/models/inventory/batch.dart';
import 'package:pos_app/domain/models/inventory/batch_deduction.dart';
import 'package:pos_app/domain/services/inventory/movement_engine_impl.dart';
import 'movement_engine_test.mocks.dart';

void main() {
  late MockInventoryRepository mockRepo;
  late MockAlertService mockAlerts;
  late MovementEngineImpl engine;

  setUp(() {
    mockRepo = MockInventoryRepository();
    mockAlerts = MockAlertService();
    engine = MovementEngineImpl(mockRepo, mockAlerts);
  });

  group('MovementEngine - Performance & FIFO', () {
    test('should use getInsumosByIds for bulk loading (Performance)', () async {
      // GIVEN
      const productId = 'multi-ingredient-prod';
      final recipe = [
        const Recipe(
          id: 'r1',
          productId: productId,
          ingredientId: 'ins-1',
          ingredientType: IngredientType.insumo,
          quantity: 10.0,
        ),
        const Recipe(
          id: 'r2',
          productId: productId,
          ingredientId: 'ins-2',
          ingredientType: IngredientType.insumo,
          quantity: 20.0,
        ),
      ];

      final insumos = [
        const Insumo(id: 'ins-1', name: 'Insumo 1', stock: 100.0, consumptionUom: 'unit', averageCost: 1.0),
        const Insumo(id: 'ins-2', name: 'Insumo 2', stock: 200.0, consumptionUom: 'unit', averageCost: 2.0),
      ];

      when(mockRepo.getRecipeByProductId(productId)).thenAnswer((_) async => recipe);
      when(mockRepo.getInsumosByIds(['ins-1', 'ins-2'])).thenAnswer((_) async => insumos);
      // Ensure we don't use the old individual getter
      when(mockRepo.getInsumoById(any)).thenThrow(Exception('Should not use individual getter'));

      // WHEN
      await engine.recordSale(productId, 1);

      // THEN
      verify(mockRepo.getInsumosByIds(any)).called(1);
    });

    test('should attach FIFO batch deductions for perishable insumos', () async {
      // GIVEN
      const productId = 'perishable-prod';
      final recipe = [
        const Recipe(
          id: 'r1',
          productId: productId,
          ingredientId: 'per-1',
          ingredientType: IngredientType.insumo,
          quantity: 5.0,
        ),
      ];

      final insumo = const Insumo(
        id: 'per-1',
        name: 'Perishable',
        stock: 10.0,
        consumptionUom: 'unit',
        averageCost: 1.0,
        isPerishable: true,
      );

      final batches = [
        Batch(id: 'b1', insumoId: 'per-1', batchNumber: 'B1', remainingStock: 3.0, expirationDate: DateTime(2026, 5, 20), cost: 1.0),
        Batch(id: 'b2', insumoId: 'per-1', batchNumber: 'B2', remainingStock: 7.0, expirationDate: DateTime(2026, 6, 20), cost: 1.0),
      ];

      when(mockRepo.getRecipeByProductId(productId)).thenAnswer((_) async => recipe);
      when(mockRepo.getInsumosByIds(['per-1'])).thenAnswer((_) async => [insumo]);
      when(mockRepo.getBatchesByInsumoId('per-1')).thenAnswer((_) async => batches);

      // WHEN
      await engine.recordSale(productId, 1);

      // THEN
      final verification = verify(mockRepo.saveMovement(captureAny));
      final movement = verification.captured.single as InventoryMovement;

      expect(movement.batchDeductions, isNotNull);
      expect(movement.batchDeductions!.length, 2);
      expect(movement.batchDeductions![0], const BatchDeduction(batchId: 'b1', quantity: 3.0));
      expect(movement.batchDeductions![1], const BatchDeduction(batchId: 'b2', quantity: 2.0));
    });
  });
}
