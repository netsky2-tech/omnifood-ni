import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:pos_app/domain/models/inventory/insumo.dart';
import 'package:pos_app/domain/models/inventory/product.dart';
import 'package:pos_app/domain/models/inventory/recipe.dart';
import 'package:pos_app/domain/models/inventory/recipe_version_document.dart';
import 'package:pos_app/domain/repositories/inventory/inventory_repository.dart';
import 'package:pos_app/ui/features/inventory/recipes/recipe_view.dart';
import 'package:pos_app/ui/features/inventory/recipes/recipe_view_model.dart';

class _FakeInventoryRepository implements InventoryRepository {
  @override
  Future<List<Product>> getActiveProducts() async => const [
        Product(id: 'prod-1', name: 'Vanilla Latte', uom: 'cup', stock: 0, averageCost: 0, sellPrice: 0),
      ];

  @override
  Future<List<Insumo>> getActiveInsumos() async => const [
        Insumo(id: 'ins-1', name: 'Leche', consumptionUom: 'lt', stock: 10, averageCost: 2),
      ];

  @override
  Future<List<Recipe>> getRecipeByProductId(String productId) async => const [];

  @override
  Future<List<RecipeVersionDocument>> getRecipeVersionDocuments(String productId) async => [
        RecipeVersionDocument(
          id: 'rv-7',
          productId: 'prod-1',
          productName: 'Vanilla Latte',
          versionNumber: 7,
          yieldQuantity: 10,
          technicalShrinkPct: 5,
          createdAt: DateTime(2026, 6, 1),
          components: const [
            RecipeVersionComponentDocument(
              ingredientId: 'ins-1',
              ingredientName: 'Leche',
              ingredientType: 'INSUMO',
              grossQuantity: 1,
              netQuantity: 0.95,
              technicalShrinkPct: 5,
            ),
          ],
        ),
        RecipeVersionDocument(
          id: 'rv-8',
          productId: 'prod-1',
          productName: 'Vanilla Latte',
          versionNumber: 8,
          yieldQuantity: 12,
          technicalShrinkPct: 6,
          createdAt: DateTime(2026, 6, 2),
          components: const [
            RecipeVersionComponentDocument(
              ingredientId: 'ins-1',
              ingredientName: 'Leche',
              ingredientType: 'INSUMO',
              grossQuantity: 1.1,
              netQuantity: 1.03,
              technicalShrinkPct: 6,
            ),
          ],
        ),
      ];

  @override
  Future<void> saveRecipeVersionDocument(RecipeVersionDocument document) async {}

  @override
  Future<void> replaceRecipesForProduct(String productId, List<Recipe> recipes) async {}

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);

  @override
  get database => throw UnimplementedError();
}

Future<RecipeViewModel> _pumpRecipeView(WidgetTester tester) async {
  final repository = _FakeInventoryRepository();
  final viewModel = RecipeViewModel(repository);

  await tester.pumpWidget(
    ChangeNotifierProvider<RecipeViewModel>.value(
      value: viewModel,
      child: const MaterialApp(home: RecipeView()),
    ),
  );
  await tester.pumpAndSettle();
  return viewModel;
}

void main() {
  testWidgets('recipe workspace is read-only: Dashboard banner, no authoring or publish affordances', (tester) async {
    await _pumpRecipeView(tester);

    await tester.tap(find.text('Vanilla Latte'));
    await tester.pumpAndSettle();

    // Read access stays: version timeline and comparison workspace.
    expect(find.text('Comparar versiones'), findsOneWidget);
    expect(find.textContaining('V7'), findsWidgets);
    expect(find.textContaining('Merma'), findsWidgets);

    // STRICT read-only (issue #899 S4): no catalog write affordance remains.
    expect(find.text('PUBLICAR VERSIÓN'), findsNothing);
    expect(find.text('AGREGAR COMPONENTE'), findsNothing);
    expect(find.text('PUBLICAR'), findsNothing);
    expect(find.text('Yield objetivo'), findsNothing);
    expect(find.text('Nota de versión'), findsNothing);

    // Honest message pointing to the Dashboard.
    expect(
      find.textContaining('El catálogo se administra desde el Dashboard'),
      findsOneWidget,
    );
  });

  testWidgets('renders adaptive master-detail navigation on Sunmi V2s handheld (360x720dp)', (tester) async {
    tester.view.physicalSize = const Size(360, 720);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(() => tester.view.resetPhysicalSize());

    await _pumpRecipeView(tester);

    // 1. Initial product list view: operator naming, no internal jargon (S6/S7).
    expect(find.text('Recetas'), findsOneWidget);
    expect(find.text('Recetas BOH'), findsNothing);
    expect(find.text('Vanilla Latte'), findsOneWidget);
    expect(find.text('Comparar versiones'), findsNothing);

    // 2. Tap product to navigate to the read-only version workspace.
    await tester.tap(find.text('Vanilla Latte'));
    await tester.pumpAndSettle();

    expect(find.text('Vanilla Latte'), findsOneWidget);
    expect(find.text('Comparar versiones'), findsOneWidget);
    expect(find.text('PUBLICAR VERSIÓN'), findsNothing);
    expect(find.text('AGREGAR COMPONENTE'), findsNothing);
    expect(
      find.textContaining('El catálogo se administra desde el Dashboard'),
      findsOneWidget,
    );

    // 3. Tap back button to return to product list.
    await tester.tap(find.byIcon(Icons.arrow_back));
    await tester.pumpAndSettle();

    expect(find.text('Recetas'), findsOneWidget);
    expect(find.text('Vanilla Latte'), findsOneWidget);
  });

  testWidgets('empty product list points to the Dashboard instead of telling the operator to create products', (tester) async {
    final repository = _EmptyProductsRepository();
    final viewModel = RecipeViewModel(repository);

    await tester.pumpWidget(
      ChangeNotifierProvider<RecipeViewModel>.value(
        value: viewModel,
        child: const MaterialApp(home: RecipeView()),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.textContaining('Creá un producto preparado'), findsNothing);
    expect(
      find.textContaining('El catálogo se administra desde el Dashboard'),
      findsOneWidget,
    );
  });
}

class _EmptyProductsRepository extends _FakeInventoryRepository {
  @override
  Future<List<Product>> getActiveProducts() async => const [];
}
