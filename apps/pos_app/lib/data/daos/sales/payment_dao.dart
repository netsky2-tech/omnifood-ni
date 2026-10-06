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

  /// S2 (backlog #68): voucher reconciliation state of a cash shift,
  /// counted at shift-close push time. Each query counts the card payments
  /// attached to the shift's invoices by reconciliation status, so the
  /// cloud shift-session payload carries the shift's voucher state
  /// (pending / reconciled / manually overridden) and the owner dashboard
  /// can see a shift that closed with overrides instead of only the
  /// pre-close Corte-Z guard.
  @Query('''
    SELECT COUNT(*) FROM payments p
    INNER JOIN invoices i ON p.invoice_id = i.id
    WHERE i.shift_id = :shiftId
      AND p.method = 'card'
      AND p.reconciliation_status = 'PENDIENTE'
  ''')
  Future<int?> countPendingCardPaymentsForShift(String shiftId);

  @Query('''
    SELECT COUNT(*) FROM payments p
    INNER JOIN invoices i ON p.invoice_id = i.id
    WHERE i.shift_id = :shiftId
      AND p.method = 'card'
      AND p.reconciliation_status = 'CONCILIADO'
  ''')
  Future<int?> countReconciledCardPaymentsForShift(String shiftId);

  @Query('''
    SELECT COUNT(*) FROM payments p
    INNER JOIN invoices i ON p.invoice_id = i.id
    WHERE i.shift_id = :shiftId
      AND p.method = 'card'
      AND p.reconciliation_status = 'MANUAL_OVERRIDE'
  ''')
  Future<int?> countOverriddenCardPaymentsForShift(String shiftId);

  /// S1a (backlog #68): pending rows of the card/voucher reconciliation
  /// outbox — reconciliations whose push to
  /// `POST /sales/payment-reconciliations/sync` has not been ACKed yet.
  /// DAO-level filter (not a Dart filter): the payments table grows with
  /// every sale.
  @Query("SELECT * FROM payments WHERE reconciliation_sync_status = 'pending'")
  Future<List<PaymentEntity>> getPendingReconciliations();

  /// S1a: flips the reconciliation outbox state without rewriting the
  /// payment's reconciliation columns — 'synced' after a backend ACK,
  /// 'pending' (re)queued, failures stay pending.
  @Query("UPDATE payments SET reconciliation_sync_status = :syncStatus WHERE id = :paymentId")
  Future<void> updateReconciliationSyncStatus(String paymentId, String syncStatus);

  @Update(onConflict: OnConflictStrategy.replace)
  Future<void> updatePayment(PaymentEntity payment);

  @Insert(onConflict: OnConflictStrategy.replace)
  Future<void> insertPayments(List<PaymentEntity> payments);
}
