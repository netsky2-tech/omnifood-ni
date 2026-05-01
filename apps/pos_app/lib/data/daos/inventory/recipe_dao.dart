import 'package:floor/floor.dart';
import '../../models/inventory/recipe_entity.dart';

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

  @Insert(onConflict: OnConflictStrategy.replace)
  Future<void> insertProducts(List<ProductEntity> products);
}
