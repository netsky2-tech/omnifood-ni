import 'package:floor/floor.dart';
import '../../models/sales/payment_entity.dart';

@dao
abstract class PaymentDao {
  @Query('SELECT * FROM payments WHERE invoice_id = :invoiceId')
  Future<List<PaymentEntity>> getPaymentsByInvoiceId(String invoiceId);

  @Query('SELECT p.* FROM payments p INNER JOIN invoices i ON p.invoice_id = i.id WHERE i.created_at >= :startTime AND i.created_at <= :endTime')
  Future<List<PaymentEntity>> getPaymentsByTimeRange(int startTime, int endTime);

  @Query("SELECT * FROM payments WHERE method = 'card' AND reconciliation_status = 'PENDIENTE' ORDER BY created_at ASC")
  Future<List<PaymentEntity>> getPendingCardPayments();

  /// Issue #529: every cash payment attached to a NON-canceled invoice of
  /// the given shift. The net cash that entered the drawer per payment is
  /// `amount` (in `currency`) minus `change_given` (in `change_currency`);
  /// the currency-bucketed summation happens in the view model because
  /// change currency may differ from the tendered currency.
  @Query('''
    SELECT p.* FROM payments p
    INNER JOIN invoices i ON p.invoice_id = i.id
    WHERE i.shift_id = :shiftId
      AND i.is_canceled = 0
      AND p.method = 'cash'
  ''')
  Future<List<PaymentEntity>> getCashPaymentsForShift(String shiftId);

  @Query("SELECT COUNT(*) FROM payments WHERE method = 'card' AND reconciliation_status = 'PENDIENTE'")
  Future<int?> countPendingCardPayments();

  @Update(onConflict: OnConflictStrategy.replace)
  Future<void> updatePayment(PaymentEntity payment);

  @Insert(onConflict: OnConflictStrategy.replace)
  Future<void> insertPayments(List<PaymentEntity> payments);
}
