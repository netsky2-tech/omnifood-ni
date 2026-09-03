import 'package:floor/floor.dart';

@Entity(
  tableName: 'loyalty_rewards',
  indices: [
    Index(value: ['tenant_id']),
    Index(value: ['loyalty_program_id']),
    Index(value: ['status']),
  ],
)
class LoyaltyRewardEntity {
  @primaryKey
  final String id;

  @ColumnInfo(name: 'tenant_id')
  final String tenantId;

  @ColumnInfo(name: 'loyalty_program_id')
  final String loyaltyProgramId;

  final String name;

  @ColumnInfo(name: 'reward_type')
  final String rewardType;

  @ColumnInfo(name: 'cost_units')
  final int costUnits;

  @ColumnInfo(name: 'benefit_config_json')
  final String benefitConfigJson;

  final String status;

  @ColumnInfo(name: 'starts_at')
  final int? startsAt;

  @ColumnInfo(name: 'ends_at')
  final int? endsAt;

  @ColumnInfo(name: 'presentation_order')
  final int presentationOrder;

  @ColumnInfo(name: 'config_version')
  final int configVersion;

  @ColumnInfo(name: 'created_at')
  final int createdAt;

  @ColumnInfo(name: 'updated_at')
  final int updatedAt;

  LoyaltyRewardEntity({
    required this.id,
    required this.tenantId,
    required this.loyaltyProgramId,
    required this.name,
    required this.rewardType,
    required this.costUnits,
    required this.benefitConfigJson,
    required this.status,
    this.startsAt,
    this.endsAt,
    required this.presentationOrder,
    required this.configVersion,
    required this.createdAt,
    required this.updatedAt,
  });
}
