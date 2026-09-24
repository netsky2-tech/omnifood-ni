import 'package:floor/floor.dart';

import 'cashier_session_entity.dart';

@Entity(
  tableName: 'invoices',
  foreignKeys: [
    // B1a-4 (D-11): shift (turno) membership. FK targets the cashier session
    // the sale was made in. NO_ACTION (the default) is deliberate:
    // SET_NULL/CASCADE would UPDATE or DELETE invoice rows, which violates
    // the fiscal append-only policy (#526 AC-11). Session rows are closed,
    // never deleted, so no-action is safe.
    ForeignKey(
      childColumns: ['shift_id'],
      parentColumns: ['id'],
      entity: CashierSessionEntity,
    ),
  ],
  indices: [
    Index(value: ['invoice_number'], unique: true),
    Index(value: ['origin_invoice_id'], name: 'idx_invoices_origin_invoice_id'),
    Index(
      value: ['terminal_id', 'source_sequence'],
      name: 'idx_invoices_terminal_source_sequence',
      unique: true,
    ),
    Index(
      value: ['idempotency_key'],
      name: 'idx_invoices_idempotency_key',
      unique: true,
    ),
    Index(value: ['shift_id'], name: 'idx_invoices_shift_id'),
  ],
)
class InvoiceEntity {
  @primaryKey
  final String id;
  @ColumnInfo(name: 'invoice_number')
  String number;
  @ColumnInfo(name: 'created_at')
  final int createdAt; // Store as timestamp
  @ColumnInfo(name: 'user_id')
  final String userId;
  final double subtotal;
  @ColumnInfo(name: 'total_tax')
  final double totalTax;
  final double total;
  @ColumnInfo(name: 'is_canceled')
  final bool isCanceled;
  @ColumnInfo(name: 'void_reason')
  final String? voidReason;
  @ColumnInfo(name: 'sync_status')
  final String syncStatus;
  @ColumnInfo(name: 'payment_status')
  final String paymentStatus;
  @ColumnInfo(name: 'customer_id')
  final String? customerId;
  @ColumnInfo(name: 'global_tax_override')
  final bool globalTaxOverride;
  final String type; // 'regular' | 'creditNote'
  @ColumnInfo(name: 'related_invoice_id')
  final String? relatedInvoiceId;
  @ColumnInfo(name: 'origin_invoice_id')
  final String? originInvoiceId;
  @ColumnInfo(name: 'refund_reason_policy')
  final String? refundReasonPolicy;
  @ColumnInfo(name: 'refund_reason_code')
  final String? refundReasonCode;
  @ColumnInfo(name: 'authorized_by_user_id')
  final String? authorizedByUserId;
  @ColumnInfo(name: 'authorized_by_role')
  final String? authorizedByRole;
  @ColumnInfo(name: 'terminal_id')
  final String? terminalId;
  @ColumnInfo(name: 'source_sequence')
  final int? sourceSequence;
  @ColumnInfo(name: 'idempotency_key')
  final String? idempotencyKey;
  @ColumnInfo(name: 'payload_hash')
  final String? payloadHash;
  @ColumnInfo(name: 'inventory_policy_version')
  final String? inventoryPolicyVersion;
  @ColumnInfo(name: 'inventory_outcome')
  final String? inventoryOutcome;
  @ColumnInfo(name: 'inventory_outcome_reason')
  final String? inventoryOutcomeReason;
  @ColumnInfo(name: 'bcn_official_rate')
  final double bcnOfficialRate;
  @ColumnInfo(name: 'commercial_rate')
  final double commercialRate;
  @ColumnInfo(name: 'total_usd')
  final double totalUsd;

  /// B1a-4 (D-11): id of the cashier session (shift/turno) this sale was
  /// made in, looked up at checkout from the sale's own user + terminal.
  /// Nullable and permanent: historical rows cannot be backfilled because
  /// the data was never recorded (D-9, owner-accepted). Null also means the
  /// sale was made with no matching open session; the void guard (B1a-2)
  /// must treat null as "unknown", never as "different shift".
  ///
  /// Mutable on purpose (same precedent as `number`): it is assigned at the
  /// checkout construction site after `SalesMapper.toInvoiceEntity`, because
  /// the domain `Invoice` model deliberately does not carry shift membership.
  @ColumnInfo(name: 'shift_id')
  String? shiftId;

  InvoiceEntity({
    required this.id,
    required this.number,
    required this.createdAt,
    required this.userId,
    required this.subtotal,
    required this.totalTax,
    required this.total,
    this.isCanceled = false,
    this.voidReason,
    this.syncStatus = 'pending',
    this.paymentStatus = 'pending',
    this.customerId,
    this.globalTaxOverride = false,
    this.type = 'regular',
    this.relatedInvoiceId,
    this.originInvoiceId,
    this.refundReasonPolicy,
    this.refundReasonCode,
    this.authorizedByUserId,
    this.authorizedByRole,
    this.terminalId,
    this.sourceSequence,
    this.idempotencyKey,
    this.payloadHash,
    this.inventoryPolicyVersion,
    this.inventoryOutcome,
    this.inventoryOutcomeReason,
    this.bcnOfficialRate = 36.6241,
    this.commercialRate = 36.50,
    this.totalUsd = 0.0,
    this.shiftId,
  });
}
