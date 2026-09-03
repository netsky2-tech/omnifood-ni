enum RewardType {
  discountAmount,
  discountPercentage,
  freeProduct,
  freeShipping,
}

enum RewardStatus {
  draft,
  active,
  inactive,
}

class RewardDefinitionLocal {
  final String id;
  final String tenantId;
  final String loyaltyProgramId;
  final String name;
  final RewardType rewardType;
  final int costUnits;
  final String benefitConfigJson;
  final RewardStatus status;
  final int configVersion;
  final int presentationOrder;
  final DateTime? startsAt;
  final DateTime? endsAt;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  const RewardDefinitionLocal({
    required this.id,
    required this.tenantId,
    required this.loyaltyProgramId,
    required this.name,
    required this.rewardType,
    required this.costUnits,
    required this.benefitConfigJson,
    required this.status,
    required this.configVersion,
    required this.presentationOrder,
    this.startsAt,
    this.endsAt,
    this.createdAt,
    this.updatedAt,
  });

  bool get isActive => status == RewardStatus.active;

  /// Semi-open interval [startsAt, endsAt).
  bool withinAvailabilityWindow(DateTime at) {
    if (startsAt != null && at.isBefore(startsAt!)) return false;
    if (endsAt != null && !at.isBefore(endsAt!)) return false;
    return true;
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is RewardDefinitionLocal &&
          runtimeType == other.runtimeType &&
          id == other.id &&
          tenantId == other.tenantId &&
          loyaltyProgramId == other.loyaltyProgramId &&
          name == other.name &&
          rewardType == other.rewardType &&
          costUnits == other.costUnits &&
          benefitConfigJson == other.benefitConfigJson &&
          status == other.status &&
          configVersion == other.configVersion &&
          presentationOrder == other.presentationOrder &&
          startsAt == other.startsAt &&
          endsAt == other.endsAt &&
          createdAt == other.createdAt &&
          updatedAt == other.updatedAt;

  @override
  int get hashCode => Object.hash(
        id,
        tenantId,
        loyaltyProgramId,
        name,
        rewardType,
        costUnits,
        benefitConfigJson,
        status,
        configVersion,
        presentationOrder,
        startsAt,
        endsAt,
        createdAt,
        updatedAt,
      );

  @override
  String toString() => 'RewardDefinitionLocal(id: $id, name: $name, '
      'type: $rewardType, costUnits: $costUnits, status: $status)';
}
