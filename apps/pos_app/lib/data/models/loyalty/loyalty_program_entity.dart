import 'package:floor/floor.dart';

@Entity(
  tableName: 'loyalty_programs',
  indices: [
    Index(value: ['tenant_id']),
    Index(value: ['status']),
    Index(value: ['program_type']),
  ],
)
class LoyaltyProgramEntity {
  @primaryKey
  final String id;

  @ColumnInfo(name: 'tenant_id')
  final String tenantId;

  final String name;

  @ColumnInfo(name: 'program_type')
  final String programType;

  final String status;

  @ColumnInfo(name: 'starts_at')
  final int? startsAt;

  @ColumnInfo(name: 'ends_at')
  final int? endsAt;

  @ColumnInfo(name: 'earning_rule_json')
  final String earningRuleJson;

  @ColumnInfo(name: 'eligibility_rule_json')
  final String eligibilityRuleJson;

  @ColumnInfo(name: 'config_version')
  final int configVersion;

  @ColumnInfo(name: 'created_at')
  final int createdAt;

  @ColumnInfo(name: 'updated_at')
  final int updatedAt;

  LoyaltyProgramEntity({
    required this.id,
    required this.tenantId,
    required this.name,
    required this.programType,
    required this.status,
    this.startsAt,
    this.endsAt,
    required this.earningRuleJson,
    required this.eligibilityRuleJson,
    required this.configVersion,
    required this.createdAt,
    required this.updatedAt,
  });
}
