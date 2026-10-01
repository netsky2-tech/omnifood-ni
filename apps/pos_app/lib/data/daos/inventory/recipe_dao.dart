import 'package:floor/floor.dart';
import '../../models/inventory/recipe_entity.dart';
import '../../models/inventory/product_entity.dart';

@dao
abstract class RecipeDao {
  @Query('SELECT * FROM recipes WHERE product_id = :productId')
  Future<List<RecipeEntity>> findRecipeByProductId(String productId);

  @Insert(onConflict: OnConflictStrategy.replace)
  Future<void> insertRecipes(List<RecipeEntity> recipes);

  @Query('DELETE FROM recipes WHERE product_id = :productId')
  Future<void> deleteRecipesByProductId(String productId);

  @Query('DELETE FROM recipes WHERE id = :id')
  Future<void> deleteRecipeById(String id);
}

@dao
abstract class ProductDao {
  @Query('SELECT * FROM products WHERE is_active = 1')
  Future<List<ProductEntity>> findAllActiveProducts();

  @Query('SELECT * FROM products WHERE id = :id')
  Future<ProductEntity?> findProductById(String id);

  @Query('SELECT * FROM products WHERE id = :id AND (tenant_id = :tenantId OR tenant_id IS NULL)')
  Future<ProductEntity?> findProductByIdAndTenant(String id, String tenantId);

  @Query('SELECT * FROM products WHERE tenant_id = :tenantId AND is_active = 1')
  Future<List<ProductEntity>> findActiveProductsByTenant(String tenantId);

  @Query('SELECT * FROM product_variants WHERE product_id = :productId')
  Future<List<ProductVariantEntity>> findVariantsByProductId(String productId);

  @Query('SELECT * FROM product_modifiers WHERE product_id = :productId')
  Future<List<ProductModifierEntity>> findModifiersByProductId(String productId);

  @Query('SELECT * FROM products WHERE sku = :sku OR barcode = :barcode LIMIT 1')
  Future<ProductEntity?> findBySkuOrBarcode(String sku, String barcode);

  @Insert(onConflict: OnConflictStrategy.replace)
  Future<void> insertProducts(List<ProductEntity> products);

  @Insert(onConflict: OnConflictStrategy.replace)
  Future<void> insertVariants(List<ProductVariantEntity> variants);

  @Insert(onConflict: OnConflictStrategy.replace)
  Future<void> insertModifiers(List<ProductModifierEntity> modifiers);

  @Query('DELETE FROM product_variants WHERE product_id = :productId')
  Future<void> deleteVariantsByProductId(String productId);

  @Query('DELETE FROM product_modifiers WHERE product_id = :productId')
  Future<void> deleteModifiersByProductId(String productId);

  /// Atomically replaces variants and modifiers for a product.
  ///
  /// All four statements (two deletes and two inserts) run inside a single
  /// transaction; if any insert throws (constraint, disk full, invalid
  /// data) the whole operation rolls back and the product's previous
  /// options survive instead of being silently emptied (B4a, go-live plan G4).
  ///
  /// Positional arguments are MANDATORY for Floor `@transaction` methods in
  /// this project (AGENTS.md, design §13); named arguments break code
  /// generation in `.g.dart` files.
  @transaction
  Future<void> replaceProductOptions(
    String productId,
    List<ProductVariantEntity> variants,
    List<ProductModifierEntity> modifiers,
  ) async {
    await deleteVariantsByProductId(productId);
    await deleteModifiersByProductId(productId);
    if (variants.isNotEmpty) {
      await insertVariants(variants);
    }
    if (modifiers.isNotEmpty) {
      await insertModifiers(modifiers);
    }
  }
}
