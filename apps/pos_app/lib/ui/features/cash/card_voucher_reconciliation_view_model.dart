import 'package:flutter/foundation.dart';
import '../../../../data/daos/sales/payment_dao.dart';
import '../../../../data/models/sales/payment_entity.dart';

class CardVoucherReconciliationViewModel extends ChangeNotifier {
  final PaymentDao paymentDao;
  final String currentUserId;

  /// Issue #74: optional parent-refresh hook, invoked after EACH successful
  /// voucher resolution (reconcile or manual override) so the parent
  /// CashShiftViewModel re-reads the pending count WHILE the dialog is still
  /// open — the badge, the 'Vouchers (n)' button and the Corte Z fiscal gate
  /// must not wait for the dialog to be dismissed to see the fresh count.
  /// It is never called on a failed/rejected resolution (both methods return
  /// false there), so a failed write can never pretend the count dropped.
  final Future<void> Function()? onVoucherResolved;

  List<PaymentEntity> _pendingVouchers = [];
  bool _isLoading = false;
  String? _errorMessage;

  CardVoucherReconciliationViewModel({
    required this.paymentDao,
    required this.currentUserId,
    this.onVoucherResolved,
  });

  List<PaymentEntity> get pendingVouchers =>
      List.unmodifiable(_pendingVouchers);
  int get pendingCount => _pendingVouchers.length;
  bool get hasPendingVouchers => _pendingVouchers.isNotEmpty;
  bool get isLoading => _isLoading;
  String? get errorMessage => _errorMessage;

  Future<void> loadPendingVouchers() async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      _pendingVouchers = await paymentDao.getPendingCardPayments();
    } catch (e) {
      _errorMessage = 'Error al cargar vouchers pendientes: $e';
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<bool> reconcileVoucher({
    required String paymentId,
    required String voucherCode,
    String? batchNumber,
    String? last4,
  }) async {
    // Identity guard (reconcile-time identity fix): the backend sync
    // contract (@IsNotEmpty reconciledByUserId) rejects an empty operator
    // id, and a reconciliation without a known operator is an audit hole.
    // Refuse BEFORE any write — a row is never persisted with an empty
    // reconciledByUserId, and (Issue #74) a refused write never calls the
    // parent-refresh callback.
    if (currentUserId.trim().isEmpty) {
      _errorMessage =
          'No se pudo identificar al usuario que concilia. Inicie sesión e intente de nuevo.';
      notifyListeners();
      return false;
    }

    final cleanCode = voucherCode.trim();
    if (cleanCode.isEmpty || cleanCode.toUpperCase() == 'PENDIENTE') {
      _errorMessage = 'Debe ingresar un código de autorización válido.';
      notifyListeners();
      return false;
    }

    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      final payment = _pendingVouchers.firstWhere(
        (p) => p.id == paymentId,
        orElse: () => throw Exception('Pago no encontrado en la lista.'),
      );

      final reconciled = PaymentEntity(
        id: payment.id,
        invoiceId: payment.invoiceId,
        method: payment.method,
        amount: payment.amount,
        currency: payment.currency,
        exchangeRate: payment.exchangeRate,
        amountNio: payment.amountNio,
        changeGiven: payment.changeGiven,
        changeCurrency: payment.changeCurrency,
        voucherCode: cleanCode,
        cardBrand: payment.cardBrand,
        cardType: payment.cardType,
        bankPos: payment.bankPos,
        reconciliationStatus: 'CONCILIADO',
        last4: last4?.trim().isNotEmpty == true ? last4!.trim() : payment.last4,
        batchNumber: batchNumber?.trim().isNotEmpty == true
            ? batchNumber!.trim()
            : payment.batchNumber,
        reconciledAt: DateTime.now().millisecondsSinceEpoch,
        reconciledByUserId: currentUserId,
        // S1a (backlog #68): the reconciliation write itself creates the
        // outbox work — a reconciliation is never recorded locally without
        // creating the push to the cloud.
        reconciliationSyncStatus: 'pending',
        createdAt: payment.createdAt,
      );

      await paymentDao.updatePayment(reconciled);
      _pendingVouchers = await paymentDao.getPendingCardPayments();
      // Issue #74: only on SUCCESS — push the fresh count to the parent
      // while the dialog stays open. The close-time `.then(...)` refresh in
      // openVoucherReconciliationDialog remains as an idempotent safety net.
      final notifyParent = onVoucherResolved;
      if (notifyParent != null) {
        await notifyParent();
      }
      return true;
    } catch (e) {
      _errorMessage = 'Error al conciliar voucher: $e';
      return false;
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<bool> overrideMissingVoucher({
    required String paymentId,
    required String reason,
    required String supervisorId,
  }) async {
    // Same identity guard as [reconcileVoucher]: the override also stamps
    // an operator-context row that reaches the backend, so it must refuse
    // when no acting operator can be resolved. NOTE: the supervisor
    // authorization below is a SEPARATE concern (left untouched here).
    if (currentUserId.trim().isEmpty) {
      _errorMessage =
          'No se pudo identificar al usuario que registra el override. Inicie sesión e intente de nuevo.';
      notifyListeners();
      return false;
    }

    final cleanReason = reason.trim();
    if (cleanReason.isEmpty) {
      _errorMessage = 'Debe indicar el motivo del override manual.';
      notifyListeners();
      return false;
    }
    if (supervisorId.trim().isEmpty) {
      _errorMessage = 'Requiere autorización de un supervisor.';
      notifyListeners();
      return false;
    }

    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      final payment = _pendingVouchers.firstWhere(
        (p) => p.id == paymentId,
        orElse: () => throw Exception('Pago no encontrado en la lista.'),
      );

      final overrode = PaymentEntity(
        id: payment.id,
        invoiceId: payment.invoiceId,
        method: payment.method,
        amount: payment.amount,
        currency: payment.currency,
        exchangeRate: payment.exchangeRate,
        amountNio: payment.amountNio,
        changeGiven: payment.changeGiven,
        changeCurrency: payment.changeCurrency,
        voucherCode: 'OVERRIDE: $cleanReason',
        cardBrand: payment.cardBrand,
        cardType: payment.cardType,
        bankPos: payment.bankPos,
        reconciliationStatus: 'MANUAL_OVERRIDE',
        last4: payment.last4,
        batchNumber: payment.batchNumber,
        reconciledAt: DateTime.now().millisecondsSinceEpoch,
        // Semantics fix: the override is PERFORMED by the operator, so the
        // reconciler identity stays the real acting user (same as
        // [reconcileVoucher]). The typed supervisor credential — declared
        // evidence, never validated — moves to its own column so the cloud
        // can tell WHO did it from WHO allegedly authorized it.
        reconciledByUserId: currentUserId,
        overrideSupervisorRef: supervisorId,
        // S1a (backlog #68): the override write also creates the outbox
        // work — MANUAL_OVERRIDE state must reach the cloud as well.
        reconciliationSyncStatus: 'pending',
        createdAt: payment.createdAt,
      );

      await paymentDao.updatePayment(overrode);
      _pendingVouchers = await paymentDao.getPendingCardPayments();
      // Issue #74: same per-success parent refresh as [reconcileVoucher] —
      // the override path must refresh the live count too.
      final notifyParent = onVoucherResolved;
      if (notifyParent != null) {
        await notifyParent();
      }
      return true;
    } catch (e) {
      _errorMessage = 'Error al registrar override: $e';
      return false;
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }
}
