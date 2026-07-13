import 'package:freezed_annotation/freezed_annotation.dart';
// To reuse SyncStatus if needed, or define locally

part 'invoice.freezed.dart';
part 'invoice.g.dart';

enum PaymentStatus { pending, partial, paid }
enum SyncStatus { pending, synced, error }
enum InvoiceType { regular, creditNote }

@freezed
class Invoice with _$Invoice {
  const factory Invoice({
    required String id, // UUID
    required String number, // Formatted: 001-001-01-00000001
    required DateTime createdAt,
    required String userId,
    required double subtotal,
    required double totalTax,
    required double total,
    @Default(false) bool isCanceled,
    String? voidReason,
    @Default(SyncStatus.pending) SyncStatus syncStatus,
    @Default(PaymentStatus.pending) PaymentStatus paymentStatus,
    @Default(InvoiceType.regular) InvoiceType type,
    String? customerId,
    @Default(false) bool globalTaxOverride,
    String? relatedInvoiceId, // For Credit Notes
    String? originInvoiceId,
    String? refundReasonPolicy,
    String? refundReasonCode,
    String? authorizedByUserId,
    String? authorizedByRole,
    String? terminalId,
    int? sourceSequence,
    String? idempotencyKey,
    String? payloadHash,
  }) = _Invoice;


  factory Invoice.fromJson(Map<String, dynamic> json) => _$InvoiceFromJson(json);
}
