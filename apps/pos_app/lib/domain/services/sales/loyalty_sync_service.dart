import 'dart:convert' as convert;
import 'package:pos_app/data/models/loyalty/loyalty_program_entity.dart';
import 'package:pos_app/data/models/loyalty/loyalty_reward_entity.dart';

class LoyaltySyncService {
  const LoyaltySyncService();

  static LoyaltyProgramEntity programFromJson(Map<String, dynamic> json) {
    final earningRule = json['earning_rule'] ?? {};
    final eligibilityRule = json['eligibility_rule'] ?? {};

    return LoyaltyProgramEntity(
      id: json['id'] as String,
      tenantId: json['tenant_id'] as String,
      name: json['name'] as String,
      programType: json['program_type'] as String,
      status: json['status'] as String,
      startsAt: _parseDateTime(json['starts_at'] as String?),
      endsAt: _parseDateTime(json['ends_at'] as String?),
      earningRuleJson: convert.json.encode(earningRule),
      eligibilityRuleJson: convert.json.encode(eligibilityRule),
      configVersion: json['config_version'] as int? ?? 1,
      createdAt: _parseDateTime(json['created_at'] as String?) ??
          DateTime.now().millisecondsSinceEpoch,
      updatedAt: _parseDateTime(json['updated_at'] as String?) ??
          DateTime.now().millisecondsSinceEpoch,
    );
  }

  static LoyaltyRewardEntity rewardFromJson(Map<String, dynamic> json) {
    final benefitConfig = json['benefit_config'] ?? {};

    return LoyaltyRewardEntity(
      id: json['id'] as String,
      tenantId: json['tenant_id'] as String,
      loyaltyProgramId: json['loyalty_program_id'] as String,
      name: json['name'] as String,
      rewardType: json['reward_type'] as String,
      costUnits: json['cost_units'] as int,
      benefitConfigJson: convert.json.encode(benefitConfig),
      status: json['status'] as String,
      startsAt: _parseDateTime(json['starts_at'] as String?),
      endsAt: _parseDateTime(json['ends_at'] as String?),
      presentationOrder: json['presentation_order'] as int? ?? 0,
      configVersion: json['config_version'] as int? ?? 1,
      createdAt: _parseDateTime(json['created_at'] as String?) ??
          DateTime.now().millisecondsSinceEpoch,
      updatedAt: _parseDateTime(json['updated_at'] as String?) ??
          DateTime.now().millisecondsSinceEpoch,
    );
  }

  static int? _parseDateTime(String? isoString) {
    if (isoString == null || isoString.isEmpty) return null;
    try {
      return DateTime.parse(isoString).millisecondsSinceEpoch;
    } catch (_) {
      return null;
    }
  }
}
