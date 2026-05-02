import 'package:floor/floor.dart';
import '../../models/inventory/recipe_entity.dart';
import '../../models/inventory/product_entity.dart';

@dao
abstract class RecipeDao {
  @Query('SELECT * FROM recipes WHERE product_id = :productId')
  Future<List<RecipeEntity>> findRecipeByProductId(String productId);

  @Insert(onConflict: OnConflictStrategy.replace)
  Future<void> insertRecipes(List<RecipeEntity> recipes);
}

@dao
abstract class ProductDao {
  @Query('SELECT * FROM products WHERE is_active = 1')
  Future<List<ProductEntity>> findAllActiveProducts();

  @Query('SELECT * FROM products WHERE id = :id')
  Future<ProductEntity?> findProductById(String id);

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
}
