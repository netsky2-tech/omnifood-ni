import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/models/inventory/insumo.dart';
import 'package:pos_app/domain/models/inventory/product.dart';
import 'package:pos_app/domain/models/inventory/recipe.dart';
import 'package:pos_app/domain/models/inventory/recipe_version_document.dart';
import 'package:pos_app/domain/repositories/inventory/inventory_repository.dart';
import 'package:pos_app/ui/features/inventory/recipes/recipe_view_model.dart';

class _FakeInventoryRepository implements InventoryRepository {
  final List<Product> _products = const [
    Product(
      id: 'prod-1',
      name: 'Vanilla Latte',
      uom: 'cup',
      stock: 0,
      averageCost: 0,
      sellPrice: 0,
    ),
    Product(
      id: 'prod-syrup',
      name: 'Jarabe de la Casa',
      uom: 'lt',
      stock: 0,
      averageCost: 0,
      sellPrice: 0,
    ),
  ];

  final List<Insumo> _insumos = const [
    Insumo(id: 'ins-1', name: 'Leche', consumptionUom: 'lt', stock: 10, averageCost: 2),
  ];

  List<Recipe> storedRecipes = const <Recipe>[];
  List<RecipeVersionDocument> storedDocuments = const <RecipeVersionDocument>[];

  @override
  Future<List<Product>> getActiveProducts() async => _products;

  @override
  Future<List<Insumo>> getActiveInsumos() async => _insumos;

  @override
  Future<List<Recipe>> getRecipeByProductId(String productId) async => storedRecipes;

  @override
  Future<List<RecipeVersionDocument>> getRecipeVersionDocuments(String productId) async =>
      storedDocuments.where((document) => document.productId == productId).toList(growable: false);

  @override
  Future<void> saveRecipeVersionDocument(RecipeVersionDocument document) async {
    storedDocuments = [document, ...storedDocuments];
  }

  @override
  Future<void> replaceRecipesForProduct(String productId, List<Recipe> recipes) async {
    storedRecipes = recipes;
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);

  @override
  get database => throw UnimplementedError();
}

void main() {
  late _FakeInventoryRepository repository;
  late RecipeViewModel viewModel;

  setUp(() {
    repository = _FakeInventoryRepository();
    viewModel = RecipeViewModel(repository);
  });

  test('publishes a new version with sub-recipe compare metadata and replaces active recipe', () async {
    await viewModel.loadInitialData();
    await viewModel.selectProduct(repository._products.first);

    viewModel.addDraftComponent(
      ingredientId: 'ins-1',
      ingredientName: 'Leche',
      ingredientType: IngredientType.insumo,
      grossQuantity: 1,
      technicalShrinkPct: 10,
    );
    viewModel.addDraftComponent(
      ingredientId: 'prod-syrup',
      ingredientName: 'Jarabe de la Casa',
      ingredientType: IngredientType.product,
      grossQuantity: 0.2,
      technicalShrinkPct: 0,
      referenceVersionId: 'rv-sub-3',
    );

    await viewModel.publishDraftVersion(
      yieldQuantity: 10,
      technicalShrinkPct: 6,
      versionNote: 'Nueva merma técnica',
    );

    expect(repository.storedDocuments.single.components, hasLength(2));
    expect(repository.storedDocuments.single.components.last.ingredientType, 'SUB_RECIPE');
    expect(repository.storedRecipes.last.quantity, 0.2);
    expect(viewModel.statusMessage, contains('V1'));
  });
}
