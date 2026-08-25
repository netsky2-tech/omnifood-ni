import 'package:freezed_annotation/freezed_annotation.dart';

part 'payment.freezed.dart';
part 'payment.g.dart';

enum PaymentMethod { cash, card, qr, points }

@freezed
class Payment with _$Payment {
  const factory Payment({
    required String id,
    required String invoiceId,
    required PaymentMethod method,
    required double amount,
    @Default('NIO') String currency,
    @Default(1.0) double exchangeRate,
    @Default(0.0) double amountNio,
    @Default(0.0) double changeGiven,
    @Default('NIO') String changeCurrency,
    // Voucher & Card Metadata (PRD Dos Capas)
    String? voucherCode,
    String? cardBrand,
    String? cardType,
    String? bankPos,
    String? reconciliationStatus,
    String? last4,
    String? batchNumber,
    DateTime? reconciledAt,
    String? reconciledByUserId,
    DateTime? createdAt,
  }) = _Payment;

  factory Payment.fromJson(Map<String, dynamic> json) => _$PaymentFromJson(json);
}
