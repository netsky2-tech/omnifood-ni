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

void main() {
  testWidgets('renders version compare workspace with publish CTA', (tester) async {
    final repository = _FakeInventoryRepository();
    final viewModel = RecipeViewModel(repository);

    await tester.pumpWidget(
      ChangeNotifierProvider<RecipeViewModel>.value(
        value: viewModel,
        child: const MaterialApp(home: RecipeView()),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Vanilla Latte'));
    await tester.pumpAndSettle();

    expect(find.text('Comparar versiones'), findsOneWidget);
    expect(find.text('PUBLICAR VERSIÓN'), findsOneWidget);
    expect(find.textContaining('Merma'), findsWidgets);
  });
}
