import 'package:floor/floor.dart';

@Entity(
  tableName: 'first_successful_sale_claims',
  indices: [
    Index(value: ['ticket_id'], unique: true),
    Index(value: ['outbox_event_id'], unique: true),
  ],
)
class FirstSuccessfulSaleClaimEntity {
  @primaryKey
  @ColumnInfo(name: 'tenant_id')
  final String tenantId; // Write-once per tenant in founder scope

  @ColumnInfo(name: 'terminal_id')
  final String terminalId;

  @ColumnInfo(name: 'ticket_id')
  final String ticketId;

  @ColumnInfo(name: 'activation_attempt_id')
  final String? activationAttemptId;

  @ColumnInfo(name: 'device_occurred_at')
  final String deviceOccurredAt;

  @ColumnInfo(name: 'anchored_occurred_at')
  final String? anchoredOccurredAt;

  @ColumnInfo(name: 'clock_confidence')
  final String clockConfidence; // ANCHORED, DEVICE_VALIDATED, DEGRADED

  @ColumnInfo(name: 'server_time_anchor_id')
  final String? serverTimeAnchorId;

  @ColumnInfo(name: 'pos_build')
  final String? posBuild;

  @ColumnInfo(name: 'outbox_event_id')
  final String outboxEventId;

  @ColumnInfo(name: 'created_at_local')
  final String createdAtLocal;

  const FirstSuccessfulSaleClaimEntity({
    required this.tenantId,
    required this.terminalId,
    required this.ticketId,
    this.activationAttemptId,
    required this.deviceOccurredAt,
    this.anchoredOccurredAt,
    required this.clockConfidence,
    this.serverTimeAnchorId,
    this.posBuild,
    required this.outboxEventId,
    required this.createdAtLocal,
  });
}
