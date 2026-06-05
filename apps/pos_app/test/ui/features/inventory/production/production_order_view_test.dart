import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:provider/provider.dart';
import 'package:pos_app/domain/models/inventory/inventory_movement.dart';
import 'package:pos_app/domain/models/inventory/insumo.dart';
import 'package:pos_app/domain/models/inventory/product.dart';
import 'package:pos_app/domain/models/inventory/production_order_document.dart';
import 'package:pos_app/domain/models/inventory/recipe_version_document.dart';
import 'package:pos_app/domain/repositories/inventory/inventory_repository.dart';
import 'package:pos_app/domain/services/inventory/movement_engine.dart';
import 'package:pos_app/ui/features/inventory/production/production_order_view.dart';
import 'package:pos_app/ui/features/inventory/production/production_order_view_model.dart';

class _MockInventoryRepository extends Mock implements InventoryRepository {}
class _MockMovementEngine extends Mock implements MovementEngine {}

class _FakeProductionOrderDocument extends Fake implements ProductionOrderDocument {}

void main() {
  late _MockInventoryRepository repository;
  late _MockMovementEngine movementEngine;
  late ProductionOrderViewModel viewModel;

  final recipeVersion = RecipeVersionDocument(
    id: 'rv-1',
    productId: 'prod-syrup',
    productName: 'Jarabe',
    versionNumber: 1,
    yieldQuantity: 4,
    technicalShrinkPct: 3,
    createdAt: DateTime(2026, 6, 1),
    components: const [],
  );

  setUpAll(() {
    registerFallbackValue(_FakeProductionOrderDocument());
  });

  Widget buildApp() {
    return MaterialApp(
      home: ChangeNotifierProvider<ProductionOrderViewModel>.value(
        value: viewModel,
        child: const ProductionOrderView(),
      ),
    );
  }

  setUp(() {
    repository = _MockInventoryRepository();
    movementEngine = _MockMovementEngine();
    when(() => repository.getActiveInsumos()).thenAnswer(
      (_) async => const [
        Insumo(id: 'ins-1', name: 'Base de Café', consumptionUom: 'kg', stock: 12, averageCost: 90),
      ],
    );
    when(() => repository.getActiveProducts()).thenAnswer(
      (_) async => const [
        Product(id: 'prod-syrup', name: 'Jarabe', uom: 'lt', stock: 0, averageCost: 0, sellPrice: 0),
      ],
    );
    when(() => repository.getRecipeVersionDocuments(any())).thenAnswer((_) async => [recipeVersion]);
    when(() => repository.getProductionOrderDocuments()).thenAnswer((_) async => const <ProductionOrderDocument>[]);
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
          insumoId: 'ins-1',
          type: MovementType.production,
          quantity: 1,
          previousStock: 0,
          newStock: 1,
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

  testWidgets('renders close-order CTA and operational copy', (tester) async {
    await tester.pumpWidget(buildApp());
    await tester.pumpAndSettle();

    expect(find.text('CONFIRMAR Y CERRAR ORDEN'), findsOneWidget);
    expect(find.textContaining('Cerrá producción localmente'), findsOneWidget);
  });
}
