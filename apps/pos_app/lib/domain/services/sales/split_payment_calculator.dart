import 'package:uuid/uuid.dart';
import 'package:pos_app/domain/models/sales/payment.dart';

class SplitPaymentCalculator {
  final double totalNio;
  final double commercialRate;
  final List<Payment> payments;

  const SplitPaymentCalculator({
    required this.totalNio,
    required this.commercialRate,
    this.payments = const [],
  });

  double get totalPaidNio {
    double sum = 0.0;
    for (final p in payments) {
      if (p.method == PaymentMethod.cash) {
        sum += (p.amountNio - p.changeGiven);
      } else {
        sum += p.amountNio;
      }
    }
    return sum;
  }

  double get remainingNio {
    final diff = totalNio - totalPaidNio;
    return diff <= 0.02 ? 0.0 : diff;
  }

  double get remainingUsd {
    if (commercialRate <= 0) return 0.0;
    return remainingNio / commercialRate;
  }

  bool get isFullyPaid => remainingNio <= 0.02;

  SplitPaymentCalculator addPayment(Payment payment) {
    return SplitPaymentCalculator(
      totalNio: totalNio,
      commercialRate: commercialRate,
      payments: [...payments, payment],
    );
  }

  SplitPaymentCalculator removePayment(String paymentId) {
    return SplitPaymentCalculator(
      totalNio: totalNio,
      commercialRate: commercialRate,
      payments: payments.where((p) => p.id != paymentId).toList(),
    );
  }

  SplitPaymentCalculator clear() {
    return SplitPaymentCalculator(
      totalNio: totalNio,
      commercialRate: commercialRate,
      payments: const [],
    );
  }

  Payment createCashPayment({
    required double tenderAmount,
    required String tenderCurrency,
    String changeCurrencyPreference = 'NIO',
    String? id,
    String? invoiceId,
  }) {
    final rate = tenderCurrency == 'USD' ? commercialRate : 1.0;
    double tenderAmountNio;
    if (tenderCurrency == 'USD' && (tenderAmount - remainingUsd).abs() < 0.005) {
      tenderAmountNio = remainingNio;
    } else {
      tenderAmountNio = tenderAmount * rate;
    }

    // Remaining balance in NIO before this tender
    final neededNio = remainingNio;

    double changeNio = 0.0;
    double changeUsd = 0.0;
    double effectiveChange = 0.0;
    String effectiveChangeCurrency = changeCurrencyPreference;

    if (tenderAmountNio > neededNio) {
      final excessNio = tenderAmountNio - neededNio;
      changeNio = excessNio;
      changeUsd = commercialRate > 0 ? excessNio / commercialRate : 0.0;

      if (changeCurrencyPreference == 'USD' && commercialRate > 0) {
        effectiveChange = double.parse(changeUsd.toStringAsFixed(2));
        effectiveChangeCurrency = 'USD';
      } else {
        effectiveChange = double.parse(changeNio.toStringAsFixed(2));
        effectiveChangeCurrency = 'NIO';
      }
    }

    return Payment(
      id: id ?? const Uuid().v4(),
      invoiceId: invoiceId ?? '',
      method: PaymentMethod.cash,
      amount: tenderAmount,
      currency: tenderCurrency,
      exchangeRate: rate,
      amountNio: tenderAmountNio,
      changeGiven: effectiveChange,
      changeCurrency: effectiveChangeCurrency,
      createdAt: DateTime.now(),
    );
  }

  Payment createCardPayment({
    required double amount,
    required String currency,
    String? voucherCode,
    String? cardBrand,
    String? cardType,
    String? bankPos,
    String? last4,
    String? batchNumber,
    bool isFastCheckout = false,
    String? id,
    String? invoiceId,
  }) {
    final rate = currency == 'USD' ? commercialRate : 1.0;
    double amountNio;
    if (currency == 'USD' && (amount - remainingUsd).abs() < 0.005) {
      amountNio = remainingNio;
    } else {
      amountNio = amount * rate;
    }

    final finalVoucher = isFastCheckout
        ? 'PENDIENTE'
        : (voucherCode != null && voucherCode.trim().isNotEmpty
            ? voucherCode.trim()
            : 'PENDIENTE');

    final status = finalVoucher == 'PENDIENTE' ? 'PENDIENTE' : 'CONCILIADO';

    return Payment(
      id: id ?? const Uuid().v4(),
      invoiceId: invoiceId ?? '',
      method: PaymentMethod.card,
      amount: amount,
      currency: currency,
      exchangeRate: rate,
      amountNio: amountNio,
      changeGiven: 0.0,
      changeCurrency: currency,
      voucherCode: finalVoucher,
      cardBrand: cardBrand ?? 'VISA',
      cardType: cardType ?? 'DEBITO',
      bankPos: bankPos ?? 'BAC',
      reconciliationStatus: status,
      last4: last4,
      batchNumber: batchNumber,
      createdAt: DateTime.now(),
    );
  }

  Payment createQrPayment({
    required double amount,
    required String currency,
    String? reference,
    String? id,
    String? invoiceId,
  }) {
    final rate = currency == 'USD' ? commercialRate : 1.0;
    final amountNio = amount * rate;

    return Payment(
      id: id ?? const Uuid().v4(),
      invoiceId: invoiceId ?? '',
      method: PaymentMethod.qr,
      amount: amount,
      currency: currency,
      exchangeRate: rate,
      amountNio: amountNio,
      changeGiven: 0.0,
      changeCurrency: currency,
      voucherCode: reference,
      reconciliationStatus: 'CONCILIADO',
      createdAt: DateTime.now(),
    );
  }
}
