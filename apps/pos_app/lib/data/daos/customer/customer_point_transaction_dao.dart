import 'package:floor/floor.dart';
import '../../models/customer/customer_point_transaction_entity.dart';

@dao
abstract class CustomerPointTransactionDao {
  @Query('SELECT * FROM customer_point_transactions WHERE customer_id = :customerId ORDER BY created_at DESC')
  Future<List<CustomerPointTransactionEntity>> getTransactionsByCustomer(String customerId);

  @Query('SELECT * FROM customer_point_transactions WHERE invoice_id = :invoiceId')
  Future<List<CustomerPointTransactionEntity>> getTransactionsByInvoice(String invoiceId);

  @Query('SELECT * FROM customer_point_transactions WHERE sync_status = :status')
  Future<List<CustomerPointTransactionEntity>> getTransactionsBySyncStatus(String status);

  @Insert(onConflict: OnConflictStrategy.replace)
  Future<void> insertTransaction(CustomerPointTransactionEntity entity);

  @Insert(onConflict: OnConflictStrategy.replace)
  Future<void> insertTransactions(List<CustomerPointTransactionEntity> entities);

  @Query('UPDATE customers SET points_balance = :newBalance, updated_at = :updatedAt WHERE id = :customerId')
  Future<void> updateCustomerBalance(String customerId, double newBalance, int updatedAt);

  @transaction
  Future<void> recordPointTransactionAndUpdateBalance(
    CustomerPointTransactionEntity entity,
    String customerId,
    double newBalance,
    int updatedAt,
  ) async {
    await insertTransaction(entity);
    await updateCustomerBalance(customerId, newBalance, updatedAt);
  }
}
