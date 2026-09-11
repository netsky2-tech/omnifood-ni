import 'package:floor/floor.dart';

@Entity(
  tableName: 'customer_point_transactions',
  indices: [
    Index(value: ['customer_id']),
    Index(value: ['invoice_id']),
    Index(value: ['created_at']),
    Index(value: ['loyalty_program_id']),
    Index(value: ['idempotency_key']),
  ],
)
class CustomerPointTransactionEntity {
  @primaryKey
  final String id;

  @ColumnInfo(name: 'customer_id')
  final String customerId;

  @ColumnInfo(name: 'invoice_id')
  final String? invoiceId;

  final String type; // 'earn', 'redeem', 'adjust'

  final double points;

  @ColumnInfo(name: 'balance_after')
  final double balanceAfter;

  @ColumnInfo(name: 'conversion_rate')
  final double conversionRate;

  final String? reason;

  @ColumnInfo(name: 'created_at')
  final int createdAt; // timestamp millis

  @ColumnInfo(name: 'sync_status')
  final String syncStatus; // 'pending', 'synced', 'error'

  // --- V1 Loyalty fields ---

  @ColumnInfo(name: 'loyalty_program_id')
  final String? loyaltyProgramId;

  @ColumnInfo(name: 'ticket_id')
  final String? ticketId;

  @ColumnInfo(name: 'reward_id')
  final String? rewardId;

  @ColumnInfo(name: 'transaction_type')
  final String? transactionType;

  final int? units;

  @ColumnInfo(name: 'reversal_of_transaction_id')
  final String? reversalOfTransactionId;

  @ColumnInfo(name: 'idempotency_key')
  final String? idempotencyKey;

  @ColumnInfo(name: 'source_event_id')
  final String? sourceEventId;

  @ColumnInfo(name: 'actor_user_id')
  final String? actorUserId;

  @ColumnInfo(name: 'branch_id')
  final String? branchId;

  @ColumnInfo(name: 'terminal_id')
  final String? terminalId;

  @ColumnInfo(name: 'program_version')
  final int? programVersion;

  @ColumnInfo(name: 'reward_version')
  final int? rewardVersion;

  @ColumnInfo(name: 'commercial_snapshot')
  final String? commercialSnapshot;

  final String? origin;

  @ColumnInfo(name: 'occurred_at')
  final int? occurredAt;

  @ColumnInfo(name: 'recorded_at')
  final int? recordedAt;

  @ColumnInfo(name: 'legacy_imported')
  final int legacyImported;

  CustomerPointTransactionEntity({
    required this.id,
    required this.customerId,
    this.invoiceId,
    required this.type,
    required this.points,
    required this.balanceAfter,
    required this.conversionRate,
    this.reason,
    required this.createdAt,
    this.syncStatus = 'pending',
    this.loyaltyProgramId,
    this.ticketId,
    this.rewardId,
    this.transactionType,
    this.units,
    this.reversalOfTransactionId,
    this.idempotencyKey,
    this.sourceEventId,
    this.actorUserId,
    this.branchId,
    this.terminalId,
    this.programVersion,
    this.rewardVersion,
    this.commercialSnapshot,
    this.origin,
    this.occurredAt,
    this.recordedAt,
    this.legacyImported = 0,
  });
}
