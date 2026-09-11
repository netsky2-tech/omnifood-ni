import 'package:pos_app/domain/models/loyalty/loyalty_evaluation.dart';
import 'package:pos_app/domain/models/loyalty/loyalty_program.dart';

class ProgramFeedback {
  final String programId;
  final String programName;
  final LoyaltyProgramType programType;
  final int unitsEarned;
  final int unitsRedeemed;
  final int newBalance;
  final int unitsToNextReward;
  final bool rewardAvailable;
  final String? rewardName;
  final bool rewardRedeemed;
  final String? redeemedRewardName;

  const ProgramFeedback({
    required this.programId,
    required this.programName,
    required this.programType,
    required this.unitsEarned,
    this.unitsRedeemed = 0,
    required this.newBalance,
    this.unitsToNextReward = 0,
    this.rewardAvailable = false,
    this.rewardName,
    this.rewardRedeemed = false,
    this.redeemedRewardName,
  });

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is ProgramFeedback &&
          runtimeType == other.runtimeType &&
          programId == other.programId &&
          programName == other.programName &&
          programType == other.programType &&
          unitsEarned == other.unitsEarned &&
          unitsRedeemed == other.unitsRedeemed &&
          newBalance == other.newBalance &&
          unitsToNextReward == other.unitsToNextReward &&
          rewardAvailable == other.rewardAvailable &&
          rewardName == other.rewardName &&
          rewardRedeemed == other.rewardRedeemed &&
          redeemedRewardName == other.redeemedRewardName;

  @override
  int get hashCode => Object.hash(
        programId,
        programName,
        programType,
        unitsEarned,
        unitsRedeemed,
        newBalance,
        unitsToNextReward,
        rewardAvailable,
        rewardName,
        rewardRedeemed,
        redeemedRewardName,
      );
}

class PostPaidFeedback {
  final List<ProgramFeedback> programs;

  const PostPaidFeedback({required this.programs});

  bool get hasContent => programs.any(
        (p) => p.unitsEarned > 0 || p.unitsRedeemed > 0 || p.rewardAvailable,
      );

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is PostPaidFeedback &&
          runtimeType == other.runtimeType &&
          _listEquals(programs, other.programs);

  @override
  int get hashCode => Object.hashAll(programs);

  static bool _listEquals(List<ProgramFeedback> a, List<ProgramFeedback> b) {
    if (a.length != b.length) return false;
    for (var i = 0; i < a.length; i++) {
      if (a[i] != b[i]) return false;
    }
    return true;
  }
}

class PostPaidFeedbackService {
  const PostPaidFeedbackService();

  PostPaidFeedback compute({
    required LoyaltyEvaluation evaluation,
    required Map<String, int> postCommitBalances,
    required Map<String, int> earnedUnits,
    required Map<String, int> redeemedUnits,
    String? redeemedRewardName,
  }) {
    final programFeedbacks = <ProgramFeedback>[];

    for (final program in evaluation.programs) {
      final earned = earnedUnits[program.programId] ?? 0;
      final redeemed = redeemedUnits[program.programId] ?? 0;
      final newBalance = postCommitBalances[program.programId] ?? 0;

      int unitsToNext = 0;
      bool rewardAvailable = false;
      String? rewardName;

      if (program.nextReward != null) {
        final nextReward = program.nextReward!;
        if (newBalance >= nextReward.costUnits) {
          rewardAvailable = true;
          rewardName = nextReward.name;
          unitsToNext = 0;
        } else {
          unitsToNext = nextReward.costUnits - newBalance;
        }
      }

      programFeedbacks.add(ProgramFeedback(
        programId: program.programId,
        programName: program.programName,
        programType: program.programType,
        unitsEarned: earned,
        unitsRedeemed: redeemed,
        newBalance: newBalance,
        unitsToNextReward: unitsToNext,
        rewardAvailable: rewardAvailable,
        rewardName: rewardName,
        rewardRedeemed: redeemed > 0 && redeemedRewardName != null,
        redeemedRewardName: redeemed > 0 ? redeemedRewardName : null,
      ));
    }

    return PostPaidFeedback(programs: programFeedbacks);
  }

  String computeSummary(PostPaidFeedback feedback) {
    final buffer = StringBuffer();

    for (final program in feedback.programs) {
      if (buffer.isNotEmpty) buffer.writeln();

      final unitLabel = _unitLabel(program.programType);

      if (program.unitsRedeemed > 0) {
        buffer.write('-${program.unitsRedeemed} $unitLabel');
        if (program.redeemedRewardName != null) {
          buffer.write(' (${program.redeemedRewardName})');
        }
        buffer.write('  ');
      }

      if (program.unitsEarned > 0) {
        buffer.write('+${program.unitsEarned} $unitLabel');
      }

      if (program.rewardAvailable && program.rewardName != null) {
        if (program.unitsEarned > 0) buffer.write('  ');
        buffer.write('Recompensa disponible: ${program.rewardName}');
      } else if (program.unitsToNextReward > 0) {
        if (program.unitsEarned > 0) buffer.write('  ');
        buffer.write('Te faltan ${program.unitsToNextReward} para tu recompensa');
      }
    }

    return buffer.toString();
  }

  String _unitLabel(LoyaltyProgramType type) {
    switch (type) {
      case LoyaltyProgramType.spendPoints:
        return 'puntos';
      case LoyaltyProgramType.productStamps:
        return 'sellos';
      case LoyaltyProgramType.visitStamps:
        return 'visitas';
    }
  }
}
