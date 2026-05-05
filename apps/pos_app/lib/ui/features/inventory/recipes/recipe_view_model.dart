import 'package:flutter/foundation.dart';
import '../../../../../domain/models/inventory/insumo.dart';
import '../../../../../domain/models/inventory/product.dart';
import '../../../../../domain/models/inventory/recipe.dart';
import '../../../../../domain/repositories/inventory/inventory_repository.dart';
import 'package:uuid/uuid.dart';

class RecipeViewModel extends ChangeNotifier {
  final InventoryRepository _inventoryRepository;
  final _uuid = const Uuid();

  RecipeViewModel(this._inventoryRepository);

  List<Product> _products = [];
  List<Product> get products => _products;

  List<Insumo> _insumos = [];
  List<Insumo> get insumos => _insumos;

  Product? _selectedProduct;
  Product? get selectedProduct => _selectedProduct;

  List<Recipe> _currentRecipes = [];
  List<Recipe> get currentRecipes => _currentRecipes;

  bool _isLoading = false;
  bool get isLoading => _isLoading;

  String? _errorMessage;
  String? get errorMessage => _errorMessage;

  Future<void> loadInitialData() async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      _products = await _inventoryRepository.getActiveProducts();
      _insumos = await _inventoryRepository.getActiveInsumos();
    } catch (e) {
      _errorMessage = 'Error al cargar datos: $e';
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<void> selectProduct(Product product) async {
    _selectedProduct = product;
    _isLoading = true;
    notifyListeners();

    try {
      _currentRecipes = await _inventoryRepository.getRecipeByProductId(product.id);
    } catch (e) {
      _errorMessage = 'Error al cargar receta: $e';
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<void> addIngredient({
    required String ingredientId,
    required IngredientType type,
    required double quantity,
  }) async {
    if (_selectedProduct == null) return;

    final recipe = Recipe(
      id: _uuid.v4(),
      productId: _selectedProduct!.id,
      ingredientId: ingredientId,
      ingredientType: type,
      quantity: quantity,
    );

    try {
      await _inventoryRepository.saveRecipe(recipe);
      await selectProduct(_selectedProduct!); // Refresh
    } catch (e) {
      _errorMessage = 'Error al agregar ingrediente: $e';
      notifyListeners();
    }
  }

  Future<void> removeIngredient(String recipeId) async {
    try {
      await _inventoryRepository.deleteRecipe(recipeId);
      if (_selectedProduct != null) {
        await selectProduct(_selectedProduct!); // Refresh
      }
    } catch (e) {
      _errorMessage = 'Error al eliminar ingrediente: $e';
      notifyListeners();
    }
  }

  void clearError() {
    _errorMessage = null;
    notifyListeners();
  }
}
