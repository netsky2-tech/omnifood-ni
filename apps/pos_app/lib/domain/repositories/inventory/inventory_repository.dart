import 'package:pos_app/data/database/app_database.dart';
import '../../models/inventory/insumo.dart';
import '../../models/inventory/product.dart';
import '../../models/inventory/batch.dart';
import '../../models/inventory/uom_conversion.dart';
import '../../models/inventory/recipe.dart';
import '../../models/inventory/recipe_version_document.dart';
import '../../models/inventory/count_session_document.dart';
import '../../models/inventory/forensic_alert.dart';
import '../../models/inventory/inventory_movement.dart';
import '../../models/inventory/supplier.dart';
import '../../models/inventory/warehouse.dart';
import '../../models/inventory/purchase.dart';
import '../../models/inventory/production_order_document.dart';
import '../../models/catalog/catalog_value.dart';
import '../../models/catalog/catalog_type.dart';

class OfficialBcnRateLookupException implements Exception {
  const OfficialBcnRateLookupException(this.message);

  final String message;

  @override
  String toString() => message;
}

abstract class InventoryRepository {
  AppDatabase get database;

  Future<List<Insumo>> getActiveInsumos();
  Future<Insumo?> getInsumoById(String id);
  Future<List<Insumo>> getInsumosByIds(List<String> ids);
  Future<void> updateInsumoStock(String id, double newStock);
  Future<void> updateInsumoCost(String id, double newCost);
  Future<void> saveInsumo(Insumo insumo);

  // Products
  Future<List<Product>> getActiveProducts();
  Future<Product?> getProductById(String id);
  Future<void> saveProduct(Product product);
  Future<void> saveProductOptions({
    required String productId,
    required List<ProductVariant> variants,
    required List<Modifier> modifiers,
  });

  Future<List<Recipe>> getRecipeByProductId(String productId);
  Future<void> saveRecipe(Recipe recipe);
  Future<void> deleteRecipe(String id);
  Future<void> replaceRecipesForProduct(String productId, List<Recipe> recipes);
  Future<List<RecipeVersionDocument>> getRecipeVersionDocuments(String productId);
  Future<String?> getActiveRecipeVersionId(String productId);
  Future<RecipeVersionDocument?> getRecipeVersionDocumentById(String id);
  Future<void> saveRecipeVersionDocument(RecipeVersionDocument document);
  Future<List<RecipeVersionDocument>> getUnsyncedRecipeVersionDocuments();
  Future<void> markRecipeVersionDocumentAsSynced(String id);

  Future<List<CountSessionDocument>> getCountSessionDocuments();
  Future<void> saveCountSessionDocument(CountSessionDocument session);
  Future<List<CountSessionDocument>> getUnsyncedCountSessionDocuments();
  Future<void> markCountSessionDocumentAsSynced(String id);

  Future<void> saveMovement(InventoryMovement movement);
  Future<List<InventoryMovement>> getAllMovements();
  Future<List<InventoryMovement>> getUnsyncedMovements();
  Future<void> markMovementAsSynced(String id);
  Future<void> markMovementAsFailed(String id, {String? error});

  // Suppliers
  Future<List<Supplier>> getActiveSuppliers();
  Future<void> saveSupplier(Supplier supplier);

  // Warehouses
  Future<List<Warehouse>> getActiveWarehouses();
  Future<void> saveWarehouse(Warehouse warehouse);

  // Batch Tracking
  Future<List<Batch>> getBatchesByInsumoId(String insumoId);
  Future<void> saveBatch(Batch batch);

  // UOM Conversions
  Future<List<UomConversion>> getConversionsByInsumoId(String insumoId);
  Future<void> saveConversion(UomConversion conversion);
  Future<void> deleteConversion(String id);

  // Administrable master catalogs (offline mirror of the Admin backend).
  // Values are tenant-administrable; types are protocol invariants.
  Future<List<CatalogValue>> getActiveCatalog(CatalogType type);
  Future<List<CatalogValue>> getAllCatalog(CatalogType type);
  Future<CatalogValue?> findCatalogByCode(CatalogType type, String code);
  Future<void> upsertCatalogValues(List<CatalogValue> values);
  Future<void> setCatalogActive(String id, bool isActive);
  Future<int> countCatalogValues();

  // Purchases
  Future<void> savePurchase(Purchase purchase);
  Future<void> queuePurchaseSync(Purchase purchase);
  Future<List<Purchase>> getPurchaseHistory();
  Future<List<Purchase>> getUnsyncedPurchases();
  Future<void> markPurchaseAsSynced(String id);
  Future<double> fetchOfficialBcnRateByInvoiceDate(DateTime invoiceDate);

  Future<List<ForensicAlert>> getForensicAlerts();
  Future<void> saveForensicAlert(ForensicAlert alert);
  Future<List<ForensicAlert>> getUnsyncedForensicAlerts();
  Future<void> markForensicAlertAsSynced(String id);

  Future<List<ProductionOrderDocument>> getProductionOrderDocuments();
  Future<void> saveProductionOrderDocument(ProductionOrderDocument document);
  Future<List<ProductionOrderDocument>> getUnsyncedProductionOrders();
  Future<void> markProductionOrderDocumentAsSynced(String id);
}
