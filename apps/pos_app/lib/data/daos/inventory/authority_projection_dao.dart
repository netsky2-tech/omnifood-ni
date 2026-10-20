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

  /// Narrow read for the #519 U5 three-state guard: how many authority
  /// insumos exist for a tenant. Read-only; never used to decide writes.
  @Query('SELECT COUNT(*) FROM authority_insumos WHERE tenant_id = :tenantId')
  Future<int?> countInsumosByTenant(String tenantId);

  @Insert(onConflict: OnConflictStrategy.abort)
  Future<void> insertInsumo(AuthorityInsumoEntity insumo);

  /// Refresh the LIVE state of an authority insumo.
  ///
  /// The identity facts (name, uom) are append-only: a cloud replay must
  /// never overwrite a hydrated row. The state is the opposite — an insumo
  /// can be deactivated at any moment, and a terminal that keeps believing
  /// it is active would offer stock that is not for sale (the SOHO
  /// guarantee, D6). Insert-if-absent would freeze the state at the
  /// moment of the first delivery, so the state is updated in place.
  @Query(
    'UPDATE authority_insumos '
    'SET isActive = :isActive, negative_stock_policy = :negativeStockPolicy '
    'WHERE tenant_id = :tenantId AND id = :id',
  )
  Future<int?> updateInsumoState(
    String tenantId,
    String id,
    int isActive,
    String negativeStockPolicy,
  );

  @Insert(onConflict: OnConflictStrategy.abort)
  Future<void> insertRecipeVersion(AuthorityRecipeVersionEntity version);

  @Insert(onConflict: OnConflictStrategy.abort)
  Future<void> insertComponent(AuthorityRecipeVersionComponentEntity component);

  @Insert(onConflict: OnConflictStrategy.abort)
  Future<void> insertComponents(
    List<AuthorityRecipeVersionComponentEntity> components,
  );
}
