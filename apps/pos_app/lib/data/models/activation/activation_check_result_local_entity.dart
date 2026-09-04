import 'package:floor/floor.dart';

@Entity(
  tableName: 'activation_checks_local',
  indices: [
    Index(value: ['tenant_id', 'activation_attempt_id', 'check_code'], unique: true),
  ],
)
class ActivationCheckResultLocalEntity {
  @primaryKey
  @ColumnInfo(name: 'id')
  final String id;

  @ColumnInfo(name: 'tenant_id')
  final String tenantId;

  @ColumnInfo(name: 'activation_attempt_id')
  final String activationAttemptId;

  @ColumnInfo(name: 'check_code')
  final String checkCode;

  @ColumnInfo(name: 'required')
  final int required; // 1 = true, 0 = false

  @ColumnInfo(name: 'status')
  final String status; // PASS, WARNING, FAIL, NOT_RUN

  @ColumnInfo(name: 'evidence_type')
  final String? evidenceType;

  @ColumnInfo(name: 'evidence_ref')
  final String? evidenceRef;

  @ColumnInfo(name: 'occurred_at')
  final String? occurredAt;

  @ColumnInfo(name: 'recorded_at')
  final String recordedAt;

  @ColumnInfo(name: 'details_sanitized_json')
  final String? detailsSanitizedJson;

  const ActivationCheckResultLocalEntity({
    required this.id,
    required this.tenantId,
    required this.activationAttemptId,
    required this.checkCode,
    this.required = 1,
    required this.status,
    this.evidenceType,
    this.evidenceRef,
    this.occurredAt,
    required this.recordedAt,
    this.detailsSanitizedJson,
  });

  bool get isPass => status == 'PASS';
  bool get isFail => status == 'FAIL';
  bool get isWarning => status == 'WARNING';
}
