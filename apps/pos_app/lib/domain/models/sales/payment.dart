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
    DateTime? createdAt,
  }) = _Payment;

  factory Payment.fromJson(Map<String, dynamic> json) => _$PaymentFromJson(json);
}
