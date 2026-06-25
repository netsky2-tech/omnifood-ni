import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/annotations.dart';
import 'package:mockito/mockito.dart';
import 'package:pos_app/domain/models/inventory/insumo.dart';
import 'package:pos_app/domain/models/inventory/recipe.dart';
import 'package:pos_app/domain/models/inventory/recipe_version_document.dart';
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

      when(
        mockRepo.getRecipeByProductId(productId),
      ).thenAnswer((_) async => recipe);
      when(
        mockRepo.getInsumosByIds(['ins-1']),
      ).thenAnswer((_) async => [initialInsumo]);

      // WHEN
      await engine.recordSale(productId, 1);

      // THEN
      verify(
        mockRepo.saveMovement(
          argThat(
            predicate<InventoryMovement>((m) {
              return m.newStock == 982.0 && m.insumoId == 'ins-1';
            }),
          ),
        ),
      ).called(1);
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

      when(
        mockRepo.getRecipeByProductId(productId),
      ).thenAnswer((_) async => recipe);
      when(
        mockRepo.getInsumosByIds(['ins-1']),
      ).thenAnswer((_) async => [initialInsumo]);

      // WHEN
      await engine.recordReversal(productId, 1, 'Canceled invoice');

      // THEN
      verify(
        mockRepo.saveMovement(
          argThat(
            predicate<InventoryMovement>((m) {
              return m.newStock == 1000.0 && m.type == MovementType.reversal;
            }),
          ),
        ),
      ).called(1);
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

      when(
        mockRepo.getRecipeByProductId(productId),
      ).thenAnswer((_) async => topRecipe);
      when(
        mockRepo.getRecipeByProductId('vanilla-syrup'),
      ).thenAnswer((_) async => subRecipe);
      when(
        mockRepo.getInsumosByIds(['sugar']),
      ).thenAnswer((_) async => [initialSugar]);

      // WHEN
      await engine.recordSale(productId, 1);

      // THEN
      // 2.0 units of syrup * 10.0g of sugar = 20.0g sugar discounted
      verify(
        mockRepo.saveMovement(
          argThat(
            predicate<InventoryMovement>((m) {
              return m.insumoId == 'sugar' && m.newStock == 80.0;
            }),
          ),
        ),
      ).called(1);
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

      when(
        mockRepo.getRecipeByProductId(productId),
      ).thenAnswer((_) async => recipe);
      when(
        mockRepo.getInsumosByIds(['ins-1']),
      ).thenAnswer((_) async => [initialInsumo]);

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

      when(
        mockRepo.getRecipeByProductId(productId),
      ).thenAnswer((_) async => recipe);
      when(
        mockRepo.getInsumosByIds(['ins-1']),
      ).thenAnswer((_) async => [initialInsumo]);

      // WHEN
      await engine.recordSale(productId, 1); // Stock 90 (Trigger alert)

      // Update stock for second call simulation
      when(
        mockRepo.getInsumosByIds(['ins-1']),
      ).thenAnswer((_) async => [initialInsumo.copyWith(stock: 90.0)]);
      await engine.recordSale(
        productId,
        1,
      ); // Stock 80 (Should NOT trigger alert again)

      // THEN
      verify(mockAlerts.notifyLowStock('Milk', any, any)).called(1);
    });
  });

  group('MovementEngine - PAR Alert Crossing Check', () {
    // Task 3.5: Tests for non-volatile crossing check

    test(
      'should fire alert when stock crosses from above to below PAR via shrinkage',
      () async {
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
      },
    );

    test(
      'should fire one alert when stock is already below PAR via shrinkage',
      () async {
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

        // THEN: Current engine behavior emits one alert the first time below PAR is processed
        verify(mockAlerts.notifyLowStock('Leche', 1800.0, 2000.0)).called(1);
      },
    );

    test(
      'should NOT fire alert when stock stays above PAR via shrinkage',
      () async {
        // GIVEN: Azúcar with PAR level 1000g and stock 1500g (well above PAR)
        final insumo = createInsumo(
          id: 'azucar-1',
          name: 'Azúcar',
          stock: 1500.0,
          parLevel: 1000.0,
        );

        when(
          mockRepo.getInsumoById('azucar-1'),
        ).thenAnswer((_) async => insumo);

        // WHEN: Shrinkage of 100g reduces stock to 1400g (still above PAR)
        await engine.recordShrinkage('azucar-1', 100.0, 'Sample');

        // THEN: Alert should NOT fire because stock is still above PAR
        verifyNever(mockAlerts.notifyLowStock(any, any, any));
      },
    );

    test(
      'should fire alert when stock crosses from above to below PAR via sale',
      () async {
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

        when(
          mockRepo.getRecipeByProductId(productId),
        ).thenAnswer((_) async => recipe);
        when(
          mockRepo.getInsumosByIds(['leche-1']),
        ).thenAnswer((_) async => [insumo]);

        // WHEN: Sale reduces stock from 2100 to 1900 (crossing from 2100 >= 2000 to 1900 < 2000)
        await engine.recordSale(productId, 1);

        // THEN: Alert should fire because crossing occurred
        verify(mockAlerts.notifyLowStock('Leche', 1900.0, 2000.0)).called(1);
      },
    );

    test(
      'should fire alert again after replenishment crosses back above PAR then below again',
      () async {
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
      },
    );

    test(
      'should NOT fire duplicate alert in same session when stock stays below PAR',
      () async {
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
        when(
          mockRepo.getInsumoById('milk-1'),
        ).thenAnswer((_) async => insumo.copyWith(stock: 80.0));

        // Second shrinkage (80 -> 70, stays below PAR)
        await engine.recordShrinkage('milk-1', 10.0, 'Sample');

        // THEN: First event fires alert; second below-PAR event in same session is deduplicated
        verify(mockAlerts.notifyLowStock('Milk', 80.0, 100.0)).called(1);
      },
    );
  });

  group('MovementEngine - recordAdjustment', () {
    test(
      'should apply a positive compensating adjustment as a new movement',
      () async {
        final insumo = createInsumo(
          id: 'beans-1',
          name: 'Beans',
          stock: 5.0,
          parLevel: 3.0,
        );

        when(mockRepo.getInsumoById('beans-1')).thenAnswer((_) async => insumo);

        await engine.recordAdjustment(
          'beans-1',
          2.0,
          'Conteo físico | Motivo: Sobrante',
        );

        verify(mockRepo.updateInsumoStock('beans-1', 7.0)).called(1);
        verify(
          mockRepo.saveMovement(
            argThat(
              predicate<InventoryMovement>((m) {
                return m.type == MovementType.adjustment &&
                    m.quantity == 2.0 &&
                    m.previousStock == 5.0 &&
                    m.newStock == 7.0;
              }),
            ),
          ),
        ).called(1);
      },
    );

    test(
      'should apply a negative compensating adjustment and trigger PAR alert when crossing below',
      () async {
        final insumo = createInsumo(
          id: 'milk-1',
          name: 'Milk',
          stock: 10.0,
          parLevel: 9.0,
        );

        when(mockRepo.getInsumoById('milk-1')).thenAnswer((_) async => insumo);

        await engine.recordAdjustment(
          'milk-1',
          -2.0,
          'Conteo físico | Motivo: Faltante',
        );

        verify(mockRepo.updateInsumoStock('milk-1', 8.0)).called(1);
        verify(mockAlerts.notifyLowStock('Milk', 8.0, 9.0)).called(1);
        verify(
          mockRepo.saveMovement(
            argThat(
              predicate<InventoryMovement>((m) {
                return m.type == MovementType.adjustment &&
                    m.quantity == -2.0 &&
                    m.previousStock == 10.0 &&
                    m.newStock == 8.0;
              }),
            ),
          ),
        ).called(1);
      },
    );
  });

  group('MovementEngine - versioned BOM explosion (UC-05)', () {
    test(
      'uses versioned recipe document when recipeVersionId is provided',
      () async {
        const productId = 'burger-1';
        const versionId = 'rv-historical-1';

        final versionDocument = RecipeVersionDocument(
          id: versionId,
          productId: productId,
          productName: 'Burger',
          versionNumber: 2,
          yieldQuantity: 1,
          technicalShrinkPct: 0,
          createdAt: DateTime(2026, 6, 1),
          components: [
            const RecipeVersionComponentDocument(
              ingredientId: 'beef-1',
              ingredientName: 'Beef',
              ingredientType: 'INSUMO',
              grossQuantity: 0.15,
              netQuantity: 0.15,
              technicalShrinkPct: 0,
            ),
          ],
        );

        const insumo = Insumo(
          id: 'beef-1',
          name: 'Beef',
          consumptionUom: 'kg',
          stock: 10.0,
          averageCost: 5.0,
        );

        when(
          mockRepo.getRecipeVersionDocumentById(versionId),
        ).thenAnswer((_) async => versionDocument);
        when(
          mockRepo.getInsumosByIds(['beef-1']),
        ).thenAnswer((_) async => [insumo]);

        final movements = await engine.getSaleMovements(
          productId,
          2.0,
          recipeVersionId: versionId,
        );

        // The simple recipe table must NOT be consulted when a version is bound
        verifyNever(mockRepo.getRecipeByProductId(productId));
        expect(movements, hasLength(1));
        expect(movements.first.insumoId, 'beef-1');
        expect(movements.first.newStock, 10.0 - (0.15 * 2));
      },
    );

    test(
      'maps SUB_RECIPE document components to existing sub-recipe path',
      () async {
        const productId = 'combo-1';
        const versionId = 'rv-combo-1';

        final versionDocument = RecipeVersionDocument(
          id: versionId,
          productId: productId,
          productName: 'Combo',
          versionNumber: 1,
          yieldQuantity: 1,
          technicalShrinkPct: 0,
          createdAt: DateTime(2026, 6, 1),
          components: [
            const RecipeVersionComponentDocument(
              ingredientId: 'burger-1',
              ingredientName: 'Burger',
              ingredientType: 'SUB_RECIPE',
              grossQuantity: 1,
              netQuantity: 1,
              technicalShrinkPct: 0,
            ),
          ],
        );
        final subRecipe = [
          const Recipe(
            id: 'sub-r1',
            productId: 'burger-1',
            ingredientId: 'beef-1',
            ingredientType: IngredientType.insumo,
            quantity: 0.2,
          ),
        ];
        const insumo = Insumo(
          id: 'beef-1',
          name: 'Beef',
          consumptionUom: 'kg',
          stock: 10.0,
          averageCost: 5.0,
        );

        when(
          mockRepo.getRecipeVersionDocumentById(versionId),
        ).thenAnswer((_) async => versionDocument);
        when(
          mockRepo.getRecipeByProductId('burger-1'),
        ).thenAnswer((_) async => subRecipe);
        when(
          mockRepo.getInsumosByIds(['beef-1']),
        ).thenAnswer((_) async => [insumo]);

        final movements = await engine.getSaleMovements(
          productId,
          2.0,
          recipeVersionId: versionId,
        );

        expect(movements, hasLength(1));
        expect(movements.first.insumoId, 'beef-1');
        expect(movements.first.newStock, 10.0 - (0.2 * 2));
      },
    );

    test('generates unique movement ids for multi-component versioned BOM', () async {
      const productId = 'burger-1';
      const versionId = 'rv-multi-1';

      final versionDocument = RecipeVersionDocument(
        id: versionId,
        productId: productId,
        productName: 'Burger',
        versionNumber: 1,
        yieldQuantity: 1,
        technicalShrinkPct: 0,
        createdAt: DateTime(2026, 6, 1),
        components: [
          const RecipeVersionComponentDocument(
            ingredientId: 'beef-1',
            ingredientName: 'Beef',
            ingredientType: 'INSUMO',
            grossQuantity: 0.15,
            netQuantity: 0.15,
            technicalShrinkPct: 0,
          ),
          const RecipeVersionComponentDocument(
            ingredientId: 'bun-1',
            ingredientName: 'Bun',
            ingredientType: 'INSUMO',
            grossQuantity: 1,
            netQuantity: 1,
            technicalShrinkPct: 0,
          ),
        ],
      );

      when(
        mockRepo.getRecipeVersionDocumentById(versionId),
      ).thenAnswer((_) async => versionDocument);
      when(mockRepo.getInsumosByIds(['beef-1', 'bun-1'])).thenAnswer(
        (_) async => const [
          Insumo(
            id: 'beef-1',
            name: 'Beef',
            consumptionUom: 'kg',
            stock: 10.0,
            averageCost: 5.0,
          ),
          Insumo(
            id: 'bun-1',
            name: 'Bun',
            consumptionUom: 'unit',
            stock: 20.0,
            averageCost: 1.0,
          ),
        ],
      );

      final movements = await engine.getSaleMovements(
        productId,
        1,
        recipeVersionId: versionId,
      );

      expect(movements, hasLength(2));
      expect(movements.map((m) => m.id).toSet(), hasLength(2));
      expect(movements.every((m) => !m.id.contains(r'${')), isTrue);
    });

    test(
      'falls back to simple recipe table when recipeVersionId is absent',
      () async {
        const productId = 'burger-1';
        final recipe = [
          const Recipe(
            id: 'r1',
            productId: productId,
            ingredientId: 'beef-1',
            ingredientType: IngredientType.insumo,
            quantity: 0.2,
          ),
        ];
        const insumo = Insumo(
          id: 'beef-1',
          name: 'Beef',
          consumptionUom: 'kg',
          stock: 10.0,
          averageCost: 5.0,
        );

        when(
          mockRepo.getRecipeByProductId(productId),
        ).thenAnswer((_) async => recipe);
        when(
          mockRepo.getInsumosByIds(['beef-1']),
        ).thenAnswer((_) async => [insumo]);

        final movements = await engine.getSaleMovements(productId, 1.0);

        verifyNever(mockRepo.getRecipeVersionDocumentById(any));
        verify(mockRepo.getRecipeByProductId(productId)).called(1);
        expect(movements, hasLength(1));
      },
    );

    test(
      'throws StateError when bound recipeVersionId document is missing',
      () async {
        const productId = 'burger-1';
        const versionId = 'rv-missing';

        when(
          mockRepo.getRecipeVersionDocumentById(versionId),
        ).thenAnswer((_) async => null);

        await expectLater(
          engine.getSaleMovements(productId, 1.0, recipeVersionId: versionId),
          throwsA(isA<StateError>()),
        );
      },
    );

    test(
      'throws StateError when recipeVersionId belongs to another product '
      'before any movement is generated',
      () async {
        // The sale is for burger-1 but the bound recipeVersionId document
        // belongs to salad-1. The engine must refuse to apply salad-1's
        // BOM (wrong insumo deductions) to the burger-1 sale line.
        const productId = 'burger-1';
        const versionId = 'rv-salad-1';

        final versionDocument = RecipeVersionDocument(
          id: versionId,
          productId: 'salad-1',
          productName: 'Salad',
          versionNumber: 1,
          yieldQuantity: 1,
          technicalShrinkPct: 0,
          createdAt: DateTime(2026, 6, 1),
          components: [
            const RecipeVersionComponentDocument(
              ingredientId: 'lettuce-1',
              ingredientName: 'Lettuce',
              ingredientType: 'INSUMO',
              grossQuantity: 0.1,
              netQuantity: 0.1,
              technicalShrinkPct: 0,
            ),
          ],
        );

        when(
          mockRepo.getRecipeVersionDocumentById(versionId),
        ).thenAnswer((_) async => versionDocument);

        await expectLater(
          engine.getSaleMovements(productId, 1.0, recipeVersionId: versionId),
          throwsA(isA<StateError>()),
        );

        // No insumo must have been touched — the guard fails before the
        // explosion produces any movement.
        verifyNever(mockRepo.getInsumosByIds(any));
        verifyNever(mockRepo.saveMovement(any));
      },
    );

    test(
      'records reversal movements using the historically bound recipeVersionId',
      () async {
        const productId = 'burger-1';
        const versionId = 'rv-rev-1';

        final versionDocument = RecipeVersionDocument(
          id: versionId,
          productId: productId,
          productName: 'Burger',
          versionNumber: 2,
          yieldQuantity: 1,
          technicalShrinkPct: 0,
          createdAt: DateTime(2026, 6, 1),
          components: [
            const RecipeVersionComponentDocument(
              ingredientId: 'beef-1',
              ingredientName: 'Beef',
              ingredientType: 'INSUMO',
              grossQuantity: 0.15,
              netQuantity: 0.15,
              technicalShrinkPct: 0,
            ),
          ],
        );

        const insumo = Insumo(
          id: 'beef-1',
          name: 'Beef',
          consumptionUom: 'kg',
          stock: 9.7, // after a sale of 2 burgers (10 - 0.3)
          averageCost: 5.0,
        );

        when(
          mockRepo.getRecipeVersionDocumentById(versionId),
        ).thenAnswer((_) async => versionDocument);
        when(
          mockRepo.getInsumosByIds(['beef-1']),
        ).thenAnswer((_) async => [insumo]);

        final movements = await engine.getReversalMovements(
          productId,
          2.0,
          'Anulación Factura: 002',
          recipeVersionId: versionId,
        );

        expect(movements, hasLength(1));
        expect(movements.first.insumoId, 'beef-1');
        expect(movements.first.type, MovementType.reversal);
        // Reversal adds back 0.15 * 2 = 0.3 to the insumo stock.
        expect(movements.first.newStock, 9.7 + (0.15 * 2));
      },
    );
  });

  group('MovementEngine - cycle and depth protection', () {
    test('throws StateError on circular recipe (A contains A)', () async {
      const productId = 'recursive-1';
      final recipe = [
        const Recipe(
          id: 'r1',
          productId: productId,
          ingredientId: productId, // Self-reference
          ingredientType: IngredientType.product,
          quantity: 1.0,
        ),
      ];

      when(
        mockRepo.getRecipeByProductId(productId),
      ).thenAnswer((_) async => recipe);

      await expectLater(
        engine.recordSale(productId, 1),
        throwsA(isA<StateError>()),
      );
    });

    test(
      'throws StateError on transitive circular recipe (A -> B -> A)',
      () async {
        const productA = 'cycle-a';
        const productB = 'cycle-b';
        final recipeA = [
          const Recipe(
            id: 'r-a',
            productId: productA,
            ingredientId: productB,
            ingredientType: IngredientType.product,
            quantity: 1.0,
          ),
        ];
        final recipeB = [
          const Recipe(
            id: 'r-b',
            productId: productB,
            ingredientId: productA,
            ingredientType: IngredientType.product,
            quantity: 1.0,
          ),
        ];

        when(
          mockRepo.getRecipeByProductId(productA),
        ).thenAnswer((_) async => recipeA);
        when(
          mockRepo.getRecipeByProductId(productB),
        ).thenAnswer((_) async => recipeB);

        await expectLater(
          engine.recordSale(productA, 1),
          throwsA(isA<StateError>()),
        );
      },
    );

    test(
      'throws StateError on BOM depth overflow (chain deeper than max)',
      () async {
        // Build a chain: prod-0 -> prod-1 -> prod-2 -> ... -> prod-6 (>5 depth)
        const root = 'prod-0';
        for (var i = 0; i <= 6; i++) {
          final recipe = [
            Recipe(
              id: 'r-$i',
              productId: 'prod-$i',
              ingredientId: i < 6 ? 'prod-${i + 1}' : 'leaf-ins',
              ingredientType: i < 6
                  ? IngredientType.product
                  : IngredientType.insumo,
              quantity: 1.0,
            ),
          ];
          when(
            mockRepo.getRecipeByProductId('prod-$i'),
          ).thenAnswer((_) async => recipe);
        }

        await expectLater(
          engine.recordSale(root, 1),
          throwsA(isA<StateError>()),
        );
      },
    );
  });
}
