import 'package:floor/floor.dart';
import '../models/fiscal_config_local_entity.dart';

@dao
abstract class FiscalConfigLocalDao {
  @Query('SELECT * FROM fiscal_config_local WHERE tenant_id = :tenantId')
  Future<FiscalConfigLocalEntity?> getByTenantId(String tenantId);

  @Insert(onConflict: OnConflictStrategy.replace)
  Future<void> insertOrReplace(FiscalConfigLocalEntity entity);

  @Query('DELETE FROM fiscal_config_local WHERE tenant_id = :tenantId')
  Future<void> deleteByTenantId(String tenantId);

  @Query('SELECT * FROM fiscal_config_local')
  Future<List<FiscalConfigLocalEntity>> getAll();

  /// Applies fiscal config transactionally.
  /// RULE: Methods annotated with @transaction MUST use positional arguments.
  @transaction
  Future<void> applyFiscalConfig(FiscalConfigLocalEntity entity) async {
    await insertOrReplace(entity);
  }
}
