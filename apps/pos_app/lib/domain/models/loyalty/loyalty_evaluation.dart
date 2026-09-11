import 'loyalty_program.dart';
import 'reward_definition.dart';

class EligibleReward {
  final String rewardId;
  final String name;
  final RewardType rewardType;
  final int costUnits;
  final String? description;

  const EligibleReward({
    required this.rewardId,
    required this.name,
    required this.rewardType,
    required this.costUnits,
    this.description,
  });

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is EligibleReward &&
          runtimeType == other.runtimeType &&
          rewardId == other.rewardId &&
          name == other.name &&
          rewardType == other.rewardType &&
          costUnits == other.costUnits &&
          description == other.description;

  @override
  int get hashCode => Object.hash(
        rewardId,
        name,
        rewardType,
        costUnits,
        description,
      );

  @override
  String toString() => 'EligibleReward(id: $rewardId, name: $name, '
      'type: $rewardType, costUnits: $costUnits)';
}

class ProgramEvaluation {
  final String programId;
  final String programName;
  final LoyaltyProgramType programType;
  final int balanceUnits;
  final int earningPreviewUnits;
  final List<EligibleReward> eligibleRewards;

  const ProgramEvaluation({
    required this.programId,
    required this.programName,
    required this.programType,
    required this.balanceUnits,
    this.earningPreviewUnits = 0,
    this.eligibleRewards = const [],
  });

  EligibleReward? get nextReward {
    if (eligibleRewards.isEmpty) return null;
    return eligibleRewards.reduce(
        (a, b) => a.costUnits <= b.costUnits ? a : b);
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is ProgramEvaluation &&
          runtimeType == other.runtimeType &&
          programId == other.programId &&
          programName == other.programName &&
          programType == other.programType &&
          balanceUnits == other.balanceUnits &&
          earningPreviewUnits == other.earningPreviewUnits &&
          const ListEquality<EligibleReward>()
              .equals(eligibleRewards, other.eligibleRewards);

  @override
  int get hashCode => Object.hash(
        programId,
        programName,
        programType,
        balanceUnits,
        earningPreviewUnits,
        Object.hashAll(eligibleRewards),
      );

  @override
  String toString() => 'ProgramEvaluation(programId: $programId, '
      'name: $programName, balance: $balanceUnits, earning: $earningPreviewUnits)';
}

class LoyaltyEvaluation {
  final String customerId;
  final String ticketId;
  final List<ProgramEvaluation> programs;
  final bool selectedRedemptionStillValid;
  final bool staleConfigIndicator;

  const LoyaltyEvaluation({
    required this.customerId,
    required this.ticketId,
    required this.programs,
    this.selectedRedemptionStillValid = false,
    this.staleConfigIndicator = false,
  });

  bool get hasAnyEarning => programs.any((p) => p.earningPreviewUnits > 0);

  bool get hasAnyEligibleReward =>
      programs.any((p) => p.eligibleRewards.isNotEmpty);

  int get totalEarningPreviewUnits =>
      programs.fold(0, (sum, p) => sum + p.earningPreviewUnits);

  EligibleReward? get nextReward {
    EligibleReward? best;
    for (final p in programs) {
      final r = p.nextReward;
      if (r != null && (best == null || r.costUnits < best.costUnits)) {
        best = r;
      }
    }
    return best;
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is LoyaltyEvaluation &&
          runtimeType == other.runtimeType &&
          customerId == other.customerId &&
          ticketId == other.ticketId &&
          selectedRedemptionStillValid == other.selectedRedemptionStillValid &&
          staleConfigIndicator == other.staleConfigIndicator &&
          const ListEquality<ProgramEvaluation>()
              .equals(programs, other.programs);

  @override
  int get hashCode => Object.hash(
        customerId,
        ticketId,
        Object.hashAll(programs),
        selectedRedemptionStillValid,
        staleConfigIndicator,
      );

  @override
  String toString() => 'LoyaltyEvaluation(customerId: $customerId, '
      'ticketId: $ticketId, programs: ${programs.length})';
}

/// Helper for list equality (avoids importing collection package).
class ListEquality<T> {
  const ListEquality();

  bool equals(List<T> a, List<T> b) {
    if (identical(a, b)) return true;
    if (a.length != b.length) return false;
    for (var i = 0; i < a.length; i++) {
      if (a[i] != b[i]) return false;
    }
    return true;
  }
}
