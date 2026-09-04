import 'package:floor/floor.dart';
import '../../models/activation/first_successful_sale_claim_entity.dart';

@dao
abstract class FirstSuccessfulSaleClaimDao {
  @Query('SELECT * FROM first_successful_sale_claims WHERE tenant_id = :tenantId')
  Future<FirstSuccessfulSaleClaimEntity?> getClaimByTenantId(String tenantId);

  @Insert(onConflict: OnConflictStrategy.ignore)
  Future<int> insertClaim(FirstSuccessfulSaleClaimEntity claim);

  @Query('SELECT * FROM first_successful_sale_claims')
  Future<List<FirstSuccessfulSaleClaimEntity>> getAll();

  @Query('DELETE FROM first_successful_sale_claims WHERE tenant_id = :tenantId')
  Future<void> deleteByTenantId(String tenantId);
}
