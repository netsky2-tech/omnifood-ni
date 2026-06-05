import 'package:flutter/foundation.dart';
import 'package:uuid/uuid.dart';

import '../../../../../domain/models/inventory/insumo.dart';
import '../../../../../domain/models/inventory/product.dart';
import '../../../../../domain/models/inventory/recipe.dart';
import '../../../../../domain/models/inventory/recipe_version_document.dart';
import '../../../../../domain/repositories/inventory/inventory_repository.dart';

class RecipeDraftComponent {
  const RecipeDraftComponent({
    required this.ingredientId,
    required this.ingredientName,
    required this.ingredientType,
    required this.grossQuantity,
    required this.technicalShrinkPct,
    this.referenceVersionId,
  });

  final String ingredientId;
  final String ingredientName;
  final IngredientType ingredientType;
  final double grossQuantity;
  final double technicalShrinkPct;
  final String? referenceVersionId;

  double get netQuantity =>
      double.parse((grossQuantity * (1 - technicalShrinkPct / 100)).toStringAsFixed(4));
}

class RecipeComparisonRow {
  const RecipeComparisonRow({
    required this.label,
    required this.componentType,
    required this.baseNet,
    required this.targetNet,
    required this.baseGross,
    required this.targetGross,
    required this.baseShrink,
    required this.targetShrink,
  });

  final String label;
  final String componentType;
  final double baseNet;
  final double targetNet;
  final double baseGross;
  final double targetGross;
  final double baseShrink;
  final double targetShrink;
}

class RecipeViewModel extends ChangeNotifier {
  RecipeViewModel(this._inventoryRepository, {Uuid? uuid})
      : _uuid = uuid ?? const Uuid();

  final InventoryRepository _inventoryRepository;
  final Uuid _uuid;

  List<Product> _products = <Product>[];
  List<Insumo> _insumos = <Insumo>[];
  Product? _selectedProduct;
  List<Recipe> _currentRecipes = <Recipe>[];
  List<RecipeVersionDocument> _recipeVersions = <RecipeVersionDocument>[];
  List<RecipeDraftComponent> _draftComponents = <RecipeDraftComponent>[];
  String? _compareBaseId;
  String? _compareTargetId;
  bool _isLoading = false;
  String? _errorMessage;
  String? _statusMessage;

  List<Product> get products => _products;
  List<Insumo> get insumos => _insumos;
  Product? get selectedProduct => _selectedProduct;
  List<Recipe> get currentRecipes => _currentRecipes;
  List<RecipeVersionDocument> get recipeVersions => _recipeVersions;
  List<RecipeDraftComponent> get draftComponents => _draftComponents;
  bool get isLoading => _isLoading;
  String? get errorMessage => _errorMessage;
  String? get statusMessage => _statusMessage;

  String? get compareBaseId => _compareBaseId;
  String? get compareTargetId => _compareTargetId;

  RecipeVersionDocument? get compareBaseVersion => _findVersion(_compareBaseId);

  RecipeVersionDocument? get compareTargetVersion => _findVersion(_compareTargetId);

  bool get hasComparison =>
      compareBaseVersion != null && compareTargetVersion != null && _recipeVersions.isNotEmpty;

  Future<void> loadInitialData() async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      _products = await _inventoryRepository.getActiveProducts();
      _insumos = await _inventoryRepository.getActiveInsumos();
      _statusMessage = 'Versioná recetas con timeline, sub-recetas y merma técnica local-first.';
    } catch (error) {
      _errorMessage = 'Error al cargar recetas: $error';
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<void> selectProduct(Product product) async {
    _selectedProduct = product;
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      _currentRecipes = await _inventoryRepository.getRecipeByProductId(product.id);
      _recipeVersions = await _inventoryRepository.getRecipeVersionDocuments(product.id);
      _draftComponents = _buildDraftComponents(product.id, _currentRecipes);
      if (_recipeVersions.isNotEmpty) {
        _compareTargetId = _recipeVersions.first.id;
        _compareBaseId = _recipeVersions.length > 1
            ? _recipeVersions[1].id
            : _recipeVersions.first.id;
      } else {
        _compareBaseId = null;
        _compareTargetId = null;
      }
    } catch (error) {
      _errorMessage = 'Error al cargar la receta: $error';
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  void setComparison({required String baseId, required String targetId}) {
    _compareBaseId = baseId;
    _compareTargetId = targetId;
    notifyListeners();
  }

  void addDraftComponent({
    required String ingredientId,
    required String ingredientName,
    required IngredientType ingredientType,
    required double grossQuantity,
    required double technicalShrinkPct,
    String? referenceVersionId,
  }) {
    _draftComponents = <RecipeDraftComponent>[
      ..._draftComponents,
      RecipeDraftComponent(
        ingredientId: ingredientId,
        ingredientName: ingredientName,
        ingredientType: ingredientType,
        grossQuantity: grossQuantity,
        technicalShrinkPct: technicalShrinkPct,
        referenceVersionId: referenceVersionId,
      ),
    ];
    notifyListeners();
  }

  void removeDraftComponentAt(int index) {
    _draftComponents = List<RecipeDraftComponent>.from(_draftComponents)..removeAt(index);
    notifyListeners();
  }

  Future<void> publishDraftVersion({
    required double yieldQuantity,
    required double technicalShrinkPct,
    String? versionNote,
  }) async {
    final product = _selectedProduct;
    if (product == null) {
      return;
    }
    if (_draftComponents.isEmpty) {
      _errorMessage = 'Agregá al menos un componente antes de publicar.';
      notifyListeners();
      return;
    }

    final nextVersion = _recipeVersions.isEmpty ? 1 : _recipeVersions.first.versionNumber + 1;
    final now = DateTime.now();
    final document = RecipeVersionDocument(
      id: _uuid.v4(),
      productId: product.id,
      productName: product.name,
      versionNumber: nextVersion,
      yieldQuantity: yieldQuantity,
      technicalShrinkPct: technicalShrinkPct,
      createdAt: now,
      publishedAt: now,
      versionNote: versionNote,
      components: _draftComponents
          .map(
            (component) => RecipeVersionComponentDocument(
              ingredientId: component.ingredientId,
              ingredientName: component.ingredientName,
              ingredientType: component.ingredientType == IngredientType.product
                  ? 'SUB_RECIPE'
                  : 'INSUMO',
              grossQuantity: component.grossQuantity,
              netQuantity: component.netQuantity,
              technicalShrinkPct: component.technicalShrinkPct,
              referenceVersionId: component.referenceVersionId,
            ),
          )
          .toList(growable: false),
    );

    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      await _inventoryRepository.saveRecipeVersionDocument(document);
      await _inventoryRepository.replaceRecipesForProduct(
        product.id,
        _draftComponents
            .map(
              (component) => Recipe(
                id: _uuid.v4(),
                productId: product.id,
                ingredientId: component.ingredientId,
                ingredientType: component.ingredientType,
                quantity: component.netQuantity,
              ),
            )
            .toList(growable: false),
      );
      _statusMessage = 'Versión V$nextVersion publicada localmente y pendiente de sync BOH.';
      await selectProduct(product);
    } catch (error) {
      _errorMessage = 'No se pudo publicar la versión: $error';
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  List<RecipeComparisonRow> buildComparisonRows() {
    final base = compareBaseVersion;
    final target = compareTargetVersion;
    if (base == null || target == null) {
      return const <RecipeComparisonRow>[];
    }

    final rowMap = <String, RecipeComparisonRow>{};
    for (final component in base.components) {
      final key = component.referenceVersionId ?? component.ingredientId;
      rowMap[key] = RecipeComparisonRow(
        label: component.ingredientName,
        componentType: component.ingredientType,
        baseNet: component.netQuantity,
        targetNet: 0,
        baseGross: component.grossQuantity,
        targetGross: 0,
        baseShrink: component.technicalShrinkPct,
        targetShrink: 0,
      );
    }

    for (final component in target.components) {
      final key = component.referenceVersionId ?? component.ingredientId;
      final existing = rowMap[key];
      if (existing == null) {
        rowMap[key] = RecipeComparisonRow(
          label: component.ingredientName,
          componentType: component.ingredientType,
          baseNet: 0,
          targetNet: component.netQuantity,
          baseGross: 0,
          targetGross: component.grossQuantity,
          baseShrink: 0,
          targetShrink: component.technicalShrinkPct,
        );
        continue;
      }

      rowMap[key] = RecipeComparisonRow(
        label: component.ingredientName,
        componentType: component.ingredientType,
        baseNet: existing.baseNet,
        targetNet: component.netQuantity,
        baseGross: existing.baseGross,
        targetGross: component.grossQuantity,
        baseShrink: existing.baseShrink,
        targetShrink: component.technicalShrinkPct,
      );
    }

    final rows = rowMap.values.toList(growable: false);
    rows.sort((left, right) => left.label.compareTo(right.label));
    return rows;
  }

  void clearError() {
    _errorMessage = null;
    notifyListeners();
  }

  List<RecipeDraftComponent> _buildDraftComponents(
    String productId,
    List<Recipe> recipes,
  ) {
    return recipes
        .map(
          (recipe) => RecipeDraftComponent(
            ingredientId: recipe.ingredientId,
            ingredientName: _resolveIngredientName(productId, recipe),
            ingredientType: recipe.ingredientType,
            grossQuantity: recipe.quantity,
            technicalShrinkPct: 0,
            referenceVersionId: null,
          ),
        )
        .toList(growable: false);
  }

  String _resolveIngredientName(String productId, Recipe recipe) {
    if (recipe.ingredientType == IngredientType.product) {
      final product = _products.cast<Product?>().firstWhere(
            (candidate) => candidate?.id == recipe.ingredientId,
            orElse: () => null,
          );
      return product?.name ?? recipe.ingredientId;
    }

    final insumo = _insumos.cast<Insumo?>().firstWhere(
          (candidate) => candidate?.id == recipe.ingredientId,
          orElse: () => null,
        );
    return insumo?.name ?? '$productId:${recipe.ingredientId}';
  }

  RecipeVersionDocument? _findVersion(String? id) {
    if (id == null || _recipeVersions.isEmpty) {
      return null;
    }
    for (final version in _recipeVersions) {
      if (version.id == id) {
        return version;
      }
    }
    return _recipeVersions.first;
  }
}
