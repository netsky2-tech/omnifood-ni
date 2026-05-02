import 'package:floor/floor.dart';
import '../../models/sales/payment_entity.dart';

@dao
abstract class PaymentDao {
  @Query('SELECT * FROM payments WHERE invoice_id = :invoiceId')
  Future<List<PaymentEntity>> getPaymentsByInvoiceId(String invoiceId);

  @Insert(onConflict: OnConflictStrategy.replace)
  Future<void> insertPayments(List<PaymentEntity> payments);
}
