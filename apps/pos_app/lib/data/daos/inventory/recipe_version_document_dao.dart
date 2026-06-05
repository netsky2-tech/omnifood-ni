import 'package:floor/floor.dart';
import '../../models/inventory/recipe_version_document_entity.dart';

@dao
abstract class RecipeVersionDocumentDao {
  @Query('SELECT * FROM recipe_version_documents WHERE product_id = :productId ORDER BY version_number DESC')
  Future<List<RecipeVersionDocumentEntity>> findByProductId(String productId);

  @Query('SELECT * FROM recipe_version_documents WHERE is_synced = 0 ORDER BY created_at ASC')
  Future<List<RecipeVersionDocumentEntity>> findUnsynced();

  @Insert(onConflict: OnConflictStrategy.replace)
  Future<void> upsertDocument(RecipeVersionDocumentEntity entity);

  @Query('UPDATE recipe_version_documents SET is_synced = 1 WHERE id = :id')
  Future<void> markAsSynced(String id);
}
