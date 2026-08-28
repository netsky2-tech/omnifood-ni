import 'package:flutter/foundation.dart';
import '../../../../data/daos/sales/payment_dao.dart';
import '../../../../data/models/sales/payment_entity.dart';

class CardVoucherReconciliationViewModel extends ChangeNotifier {
  final PaymentDao paymentDao;
  final String currentUserId;

  List<PaymentEntity> _pendingVouchers = [];
  bool _isLoading = false;
  String? _errorMessage;

  CardVoucherReconciliationViewModel({
    required this.paymentDao,
    required this.currentUserId,
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
        createdAt: payment.createdAt,
      );

      await paymentDao.updatePayment(reconciled);
      _pendingVouchers = await paymentDao.getPendingCardPayments();
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
        reconciledByUserId: supervisorId,
        createdAt: payment.createdAt,
      );

      await paymentDao.updatePayment(overrode);
      _pendingVouchers = await paymentDao.getPendingCardPayments();
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
