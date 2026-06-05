import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:pos_app/domain/models/inventory/inventory_movement.dart';
import 'package:pos_app/domain/models/inventory/insumo.dart';
import 'package:pos_app/domain/models/inventory/product.dart';
import 'package:pos_app/domain/models/inventory/production_order_document.dart';
import 'package:pos_app/domain/models/inventory/recipe_version_document.dart';
import 'package:pos_app/domain/repositories/inventory/inventory_repository.dart';
import 'package:pos_app/domain/services/inventory/movement_engine.dart';
import 'package:pos_app/ui/features/inventory/production/production_order_view_model.dart';

class _MockInventoryRepository extends Mock implements InventoryRepository {}
class _MockMovementEngine extends Mock implements MovementEngine {}

class _FakeProductionOrderDocument extends Fake implements ProductionOrderDocument {}

void main() {
  late _MockInventoryRepository repository;
  late _MockMovementEngine movementEngine;
  late ProductionOrderViewModel viewModel;

  const insumos = <Insumo>[
    Insumo(id: 'coffee-base', name: 'Base de Café', consumptionUom: 'kg', stock: 12, averageCost: 90),
  ];

  final recipeVersion = RecipeVersionDocument(
    id: 'rv-2026-06',
    productId: 'prod-coffee',
    productName: 'Jarabe Casa',
    versionNumber: 3,
    yieldQuantity: 4,
    technicalShrinkPct: 5,
    createdAt: DateTime(2026, 6, 1),
    components: const [
      RecipeVersionComponentDocument(
        ingredientId: 'raw-1',
        ingredientName: 'Azúcar',
        ingredientType: 'INSUMO',
        grossQuantity: 2,
        netQuantity: 1.9,
        technicalShrinkPct: 5,
      ),
    ],
  );

  setUpAll(() {
    registerFallbackValue(_FakeProductionOrderDocument());
  });

  setUp(() {
    repository = _MockInventoryRepository();
    movementEngine = _MockMovementEngine();
    when(() => repository.getActiveInsumos()).thenAnswer((_) async => insumos);
    when(() => repository.getActiveProducts()).thenAnswer(
      (_) async => const [
        Product(id: 'prod-coffee', name: 'Jarabe Casa', uom: 'lt', stock: 0, averageCost: 0, sellPrice: 0),
      ],
    );
    when(() => repository.getRecipeVersionDocuments(any())).thenAnswer((_) async => <RecipeVersionDocument>[]);
    when(() => repository.getProductionOrderDocuments()).thenAnswer((_) async => <ProductionOrderDocument>[]);
    when(() => repository.saveProductionOrderDocument(any())).thenAnswer((_) async {});
    when(
      () => movementEngine.recordProduction(
        recipeProductId: any(named: 'recipeProductId'),
        producedInsumoId: any(named: 'producedInsumoId'),
        quantity: any(named: 'quantity'),
        reason: any(named: 'reason'),
      ),
    ).thenAnswer(
      (_) async => [
        InventoryMovement(
          id: 'mov-1',
          insumoId: 'coffee-base',
          type: MovementType.production,
          quantity: 1,
          previousStock: 1,
          newStock: 2,
          timestamp: DateTime(2026, 6, 1, 8, 30),
        ),
      ],
    );

    viewModel = ProductionOrderViewModel(
      repository,
      movementEngine,
      createId: () => 'order-1',
      clock: () => DateTime(2026, 6, 1, 8, 30),
    );
  });

  test('loadInitialData exposes insumos and persisted closures', () async {
    when(() => repository.getRecipeVersionDocuments(any())).thenAnswer((_) async => [recipeVersion]);
    await viewModel.loadInitialData();

    expect(viewModel.availableInsumos, hasLength(1));
    expect(viewModel.statusMessage, contains('Cerrá producción localmente'));
  });

  test('closeOrderLocally persists a closed production document and movement references', () async {
    when(() => repository.getRecipeVersionDocuments(any())).thenAnswer((_) async => [recipeVersion]);
    await viewModel.loadInitialData();

    when(() => repository.getProductionOrderDocuments()).thenAnswer(
      (_) async => [
        ProductionOrderDocument(
          id: 'order-1',
          recipeVersionId: recipeVersion.id,
          recipeProductId: recipeVersion.productId,
          recipeProductName: recipeVersion.productName,
          producedInsumoId: 'coffee-base',
          producedInsumoName: 'Base de Café',
          plannedQuantity: 4,
          actualQuantity: 3.5,
          producedBatchNumber: 'PB-1',
          producedExpirationDate: DateTime(2026, 7, 1),
          operationDate: DateTime(2026, 6, 1, 8, 30),
          status: 'CLOSED_PENDING_SYNC',
          movementReferences: const ['mov-1'],
        ),
      ],
    );

    await viewModel.closeOrderLocally(
      recipeVersion: recipeVersion,
      producedInsumoId: 'coffee-base',
      plannedQuantity: 4,
      actualQuantity: 3.5,
      producedBatchNumber: 'PB-1',
      producedExpirationDate: DateTime(2026, 7, 1),
      varianceReason: 'Merma',
    );

    verify(() => repository.saveProductionOrderDocument(any())).called(1);
    expect(viewModel.orders.single.movementReferences, contains('mov-1'));
    expect(viewModel.statusMessage, contains('pendientes de sync'));
  });
}
