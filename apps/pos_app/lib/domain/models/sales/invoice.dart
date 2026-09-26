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

    /// #551: the open cashier shift bound at issuance (B1a-4/D-11). Lives
    /// on [InvoiceEntity.shiftId] (assigned after [SalesMapper
    /// .toInvoiceEntity] at checkout); carried on the domain model only so
    /// [SalesMapper.toSyncJson] can project it to the cloud. Null = issued
    /// with no open shift — never fabricated.
    String? shiftId,

    /// #551: the local calendar date fixed at issuance (D-12). Mirrors
    /// [InvoiceEntity.localIssueDate]; travels in the sync payload so the
    /// backend can evaluate voidability on its own calendar. Never
    /// recomputed from [createdAt].
    String? localIssueDate,

    /// Batch 7 Slice 2 (PRD §21 / Architecture Spec §33.4 / AD-10): the
    /// voluntary tip snapshot captured at checkout. The tip is NOT part of
    /// the taxable total (DGI INV-16.1); it is stored as issued and never
    /// recomputed. Null = no tip was selected. Travels to the cloud via
    /// [SalesMapper.toSyncJson] so the backend mirrors the fiscal document.
    double? tipAmountNio,
    double? tipAmountUsd,
    double? tipPercentage,
    double? tipEligibleBaseNio,
    int? sourceSequence,
    String? idempotencyKey,
    String? payloadHash,
    String? inventoryPolicyVersion,
    String? inventoryOutcome,
    String? inventoryOutcomeReason,
    @Default(36.6241) double bcnOfficialRate,
    @Default(36.50) double commercialRate,
    @Default(0.0) double totalUsd,
  }) = _Invoice;

  factory Invoice.fromJson(Map<String, dynamic> json) =>
      _$InvoiceFromJson(json);
}
