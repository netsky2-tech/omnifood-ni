import 'package:floor/floor.dart';
import '../../models/catalog/catalog_value_entity.dart';

@dao
abstract class CatalogValueDao {
  @Query('SELECT * FROM catalog_values WHERE catalog_type = :type AND is_active = 1 ORDER BY sort_order ASC, name ASC')
  Future<List<CatalogValueEntity>> findActiveByType(String type);

  @Query('SELECT * FROM catalog_values WHERE catalog_type = :type ORDER BY sort_order ASC, name ASC')
  Future<List<CatalogValueEntity>> findAllByType(String type);

  @Query('SELECT * FROM catalog_values WHERE catalog_type = :type AND code = :code LIMIT 1')
  Future<CatalogValueEntity?> findByTypeAndCode(String type, String code);

  @Insert(onConflict: OnConflictStrategy.replace)
  Future<void> insertCatalogValues(List<CatalogValueEntity> values);

  @Query('UPDATE catalog_values SET is_active = :isActive WHERE id = :id')
  Future<void> setActive(String id, bool isActive);

  @Query('SELECT COUNT(*) FROM catalog_values')
  Future<int?> countAll();
}
