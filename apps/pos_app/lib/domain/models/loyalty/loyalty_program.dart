enum LoyaltyProgramType {
  spendPoints,
  productStamps,
  visitStamps,
}

enum LoyaltyProgramStatus {
  draft,
  active,
  inactive,
}

class LoyaltyProgramLocal {
  final String id;
  final String tenantId;
  final String name;
  final LoyaltyProgramType programType;
  final LoyaltyProgramStatus status;
  final DateTime? startsAt;
  final DateTime? endsAt;
  final String earningRuleJson;
  final String eligibilityRuleJson;
  final int configVersion;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  const LoyaltyProgramLocal({
    required this.id,
    required this.tenantId,
    required this.name,
    required this.programType,
    required this.status,
    this.startsAt,
    this.endsAt,
    required this.earningRuleJson,
    required this.eligibilityRuleJson,
    this.configVersion = 1,
    this.createdAt,
    this.updatedAt,
  });

  bool get isActive => status == LoyaltyProgramStatus.active;
  bool get isDraft => status == LoyaltyProgramStatus.draft;
  bool get isInactive => status == LoyaltyProgramStatus.inactive;

  /// Semi-open interval [startsAt, endsAt).
  bool withinEarningWindow(DateTime at) {
    if (startsAt != null && at.isBefore(startsAt!)) return false;
    if (endsAt != null && !at.isBefore(endsAt!)) return false;
    return true;
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is LoyaltyProgramLocal &&
          runtimeType == other.runtimeType &&
          id == other.id &&
          tenantId == other.tenantId &&
          name == other.name &&
          programType == other.programType &&
          status == other.status &&
          startsAt == other.startsAt &&
          endsAt == other.endsAt &&
          earningRuleJson == other.earningRuleJson &&
          eligibilityRuleJson == other.eligibilityRuleJson &&
          configVersion == other.configVersion &&
          createdAt == other.createdAt &&
          updatedAt == other.updatedAt;

  @override
  int get hashCode => Object.hash(
        id,
        tenantId,
        name,
        programType,
        status,
        startsAt,
        endsAt,
        earningRuleJson,
        eligibilityRuleJson,
        configVersion,
        createdAt,
        updatedAt,
      );

  @override
  String toString() => 'LoyaltyProgramLocal(id: $id, name: $name, '
      'type: $programType, status: $status, configVersion: $configVersion)';
}
