import 'package:floor/floor.dart';
import '../../models/customer/customer_entity.dart';

@dao
abstract class CustomerDao {
  @Query('SELECT * FROM customers WHERE is_active = 1 ORDER BY name ASC')
  Future<List<CustomerEntity>> getAllCustomers();

  @Query('SELECT * FROM customers WHERE id = :id')
  Future<CustomerEntity?> getCustomerById(String id);

  @Query('SELECT * FROM customers WHERE tax_id = :taxId LIMIT 1')
  Future<CustomerEntity?> getCustomerByTaxId(String taxId);

  @Query('SELECT * FROM customers WHERE phone = :phone LIMIT 1')
  Future<CustomerEntity?> getCustomerByPhone(String phone);

  @Query('''
    SELECT * FROM customers 
    WHERE is_active = 1 
      AND (
        name LIKE '%' || :query || '%' 
        OR tax_id LIKE '%' || :query || '%' 
        OR phone LIKE '%' || :query || '%'
      )
    ORDER BY name ASC 
    LIMIT :limit
  ''')
  Future<List<CustomerEntity>> searchCustomers(String query, int limit);

  @Insert(onConflict: OnConflictStrategy.replace)
  Future<void> saveCustomer(CustomerEntity customer);

  @Insert(onConflict: OnConflictStrategy.replace)
  Future<void> saveCustomers(List<CustomerEntity> customers);

  @Update(onConflict: OnConflictStrategy.replace)
  Future<void> updateCustomer(CustomerEntity customer);

  @Query('SELECT COUNT(*) FROM customers')
  Future<int?> countCustomers();
}
