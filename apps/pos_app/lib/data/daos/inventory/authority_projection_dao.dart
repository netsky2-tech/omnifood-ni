import 'package:floor/floor.dart';
import 'package:pos_app/data/models/inventory/authority_projection_entities.dart';

@dao
abstract class AuthorityProjectionDao {
  @Query(
    'SELECT * FROM authority_recipe_versions '
    'WHERE tenant_id = :tenantId '
    'AND product_id = :productId '
    "AND publication_state = 'PUBLISHED' "
    'AND is_active = 1 '
    'AND effective_from <= :saleTime '
    'AND (effective_until IS NULL OR effective_until > :saleTime) '
    'ORDER BY effective_from DESC, version_number DESC',
  )
  Future<List<AuthorityRecipeVersionEntity>> findActivePublishedVersions(
    String tenantId,
    String productId,
    String saleTime,
  );

  @Query(
    'SELECT * FROM authority_recipe_version_components '
    'WHERE tenant_id = :tenantId AND version_id = :versionId '
    'ORDER BY ordinal ASC',
  )
  Future<List<AuthorityRecipeVersionComponentEntity>> findComponentsByVersion(
    String tenantId,
    String versionId,
  );

  @Query(
    'SELECT * FROM authority_insumos '
    'WHERE tenant_id = :tenantId AND id = :id',
  )
  Future<AuthorityInsumoEntity?> findInsumoById(
    String tenantId,
    String id,
  );

  @Insert(onConflict: OnConflictStrategy.abort)
  Future<void> insertInsumo(AuthorityInsumoEntity insumo);

  @Insert(onConflict: OnConflictStrategy.abort)
  Future<void> insertRecipeVersion(AuthorityRecipeVersionEntity version);

  @Insert(onConflict: OnConflictStrategy.abort)
  Future<void> insertComponent(AuthorityRecipeVersionComponentEntity component);

  @Insert(onConflict: OnConflictStrategy.abort)
  Future<void> insertComponents(
    List<AuthorityRecipeVersionComponentEntity> components,
  );
}
