import 'package:floor/floor.dart';
import '../../models/activation/first_customer_sale_observation_entity.dart';

@dao
abstract class FirstCustomerSaleObservationDao {
  @Query('SELECT * FROM first_customer_sale_observations WHERE tenant_id = :tenantId')
  Future<FirstCustomerSaleObservationEntity?> getObservationByTenantId(String tenantId);

  @Insert(onConflict: OnConflictStrategy.ignore)
  Future<int> insertObservation(FirstCustomerSaleObservationEntity observation);

  @Query('SELECT * FROM first_customer_sale_observations')
  Future<List<FirstCustomerSaleObservationEntity>> getAll();

  @Query('DELETE FROM first_customer_sale_observations WHERE tenant_id = :tenantId')
  Future<void> deleteByTenantId(String tenantId);
}
