import 'package:floor/floor.dart';

@Entity(tableName: 'activation_attempts_local')
class ActivationAttemptLocalEntity {
  @primaryKey
  @ColumnInfo(name: 'attempt_id')
  final String attemptId;

  @ColumnInfo(name: 'tenant_id')
  final String tenantId;

  @ColumnInfo(name: 'candidate_terminal_id')
  final String candidateTerminalId;

  @ColumnInfo(name: 'local_status')
  final String localStatus;

  @ColumnInfo(name: 'required_fiscal_revision')
  final int requiredFiscalRevision;

  @ColumnInfo(name: 'required_fiscal_fingerprint')
  final String requiredFiscalFingerprint;

  @ColumnInfo(name: 'verification_product_id')
  final String verificationProductId;

  @ColumnInfo(name: 'verification_ticket_id')
  final String? verificationTicketId;

  @ColumnInfo(name: 'server_time_anchor_at')
  final String? serverTimeAnchorAt;

  @ColumnInfo(name: 'anchor_monotonic_ticks')
  final int? anchorMonotonicTicks;

  @ColumnInfo(name: 'boot_session_id')
  final String? bootSessionId;

  @ColumnInfo(name: 'assigned_at')
  final String assignedAt;

  @ColumnInfo(name: 'updated_at')
  final String updatedAt;

  const ActivationAttemptLocalEntity({
    required this.attemptId,
    required this.tenantId,
    required this.candidateTerminalId,
    required this.localStatus,
    required this.requiredFiscalRevision,
    required this.requiredFiscalFingerprint,
    required this.verificationProductId,
    this.verificationTicketId,
    this.serverTimeAnchorAt,
    this.anchorMonotonicTicks,
    this.bootSessionId,
    required this.assignedAt,
    required this.updatedAt,
  });

  ActivationAttemptLocalEntity copyWith({
    String? localStatus,
    int? requiredFiscalRevision,
    String? requiredFiscalFingerprint,
    String? verificationProductId,
    String? verificationTicketId,
    String? serverTimeAnchorAt,
    int? anchorMonotonicTicks,
    String? bootSessionId,
    String? updatedAt,
  }) {
    return ActivationAttemptLocalEntity(
      attemptId: attemptId,
      tenantId: tenantId,
      candidateTerminalId: candidateTerminalId,
      localStatus: localStatus ?? this.localStatus,
      requiredFiscalRevision:
          requiredFiscalRevision ?? this.requiredFiscalRevision,
      requiredFiscalFingerprint:
          requiredFiscalFingerprint ?? this.requiredFiscalFingerprint,
      verificationProductId:
          verificationProductId ?? this.verificationProductId,
      verificationTicketId: verificationTicketId ?? this.verificationTicketId,
      serverTimeAnchorAt: serverTimeAnchorAt ?? this.serverTimeAnchorAt,
      anchorMonotonicTicks: anchorMonotonicTicks ?? this.anchorMonotonicTicks,
      bootSessionId: bootSessionId ?? this.bootSessionId,
      assignedAt: assignedAt,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }
}
