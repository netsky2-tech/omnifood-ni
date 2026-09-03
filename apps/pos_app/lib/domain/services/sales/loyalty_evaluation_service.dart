import 'dart:convert';
import 'package:pos_app/domain/models/loyalty/loyalty_evaluation.dart';
import 'package:pos_app/domain/models/loyalty/loyalty_program.dart';
import 'package:pos_app/domain/models/loyalty/loyalty_ticket_snapshot.dart';
import 'package:pos_app/domain/models/loyalty/reward_definition.dart';

class LoyaltyEvaluationService {
  const LoyaltyEvaluationService();

  LoyaltyEvaluation evaluate({
    required LoyaltyTicketSnapshot snapshot,
    required List<LoyaltyProgramLocal> programs,
    required List<RewardDefinitionLocal> rewards,
    required Map<String, int> balanceMap,
  }) {
    final now = snapshot.occurredAt;

    final activePrograms = programs.where((p) {
      if (!p.isActive) return false;
      if (!p.withinEarningWindow(now)) return false;
      return true;
    }).toList();

    final programEvaluations = activePrograms.map((program) {
      final earningPreview = _calculateEarning(program, snapshot);
      final balance = balanceMap[program.id] ?? 0;

      final programRewards = rewards
          .where((r) =>
              r.loyaltyProgramId == program.id &&
              r.isActive &&
              r.withinAvailabilityWindow(now))
          .toList();

      final eligibleRewards = programRewards
          .where((r) => balance >= r.costUnits)
          .map((r) => EligibleReward(
                rewardId: r.id,
                name: r.name,
                rewardType: r.rewardType,
                costUnits: r.costUnits,
              ))
          .toList();

      return ProgramEvaluation(
        programId: program.id,
        programName: program.name,
        programType: program.programType,
        balanceUnits: balance,
        earningPreviewUnits: earningPreview,
        eligibleRewards: eligibleRewards,
      );
    }).toList();

    return LoyaltyEvaluation(
      customerId: snapshot.customerId ?? '',
      ticketId: snapshot.ticketId,
      programs: programEvaluations,
    );
  }

  int _calculateEarning(
    LoyaltyProgramLocal program,
    LoyaltyTicketSnapshot snapshot,
  ) {
    final normalLines = snapshot.normalLines;

    switch (program.programType) {
      case LoyaltyProgramType.spendPoints:
        return _spendPointsEarning(program, normalLines);
      case LoyaltyProgramType.productStamps:
        return _productStampsEarning(program, normalLines);
      case LoyaltyProgramType.visitStamps:
        return _visitStampsEarning(program);
    }
  }

  int _spendPointsEarning(
    LoyaltyProgramLocal program,
    List<TicketLineSnapshot> normalLines,
  ) {
    final rule = _parseJson(program.earningRuleJson);
    final spendBlockNio = (rule['spendBlockNio'] as num?)?.toDouble() ?? 10.0;
    final pointsPerBlock = (rule['pointsPerBlock'] as num?)?.toInt() ?? 1;

    final totalNet = normalLines.fold(0.0, (sum, l) => sum + l.netAmount);
    final blocks = (totalNet / spendBlockNio).floor();

    return blocks * pointsPerBlock;
  }

  int _productStampsEarning(
    LoyaltyProgramLocal program,
    List<TicketLineSnapshot> normalLines,
  ) {
    final rule = _parseJson(program.earningRuleJson);
    final eligibleProductIds =
        (rule['eligibleProductIds'] as List<dynamic>?)
                ?.map((e) => e.toString())
                .toSet() ??
            {};

    if (eligibleProductIds.isEmpty) return 0;

    return normalLines
        .where((l) => eligibleProductIds.contains(l.productId))
        .fold(0, (sum, l) => sum + l.quantity);
  }

  int _visitStampsEarning(LoyaltyProgramLocal program) {
    final rule = _parseJson(program.earningRuleJson);
    final unitsPerVisit = (rule['unitsPerVisit'] as num?)?.toInt() ?? 1;

    return unitsPerVisit;
  }

  Map<String, dynamic> _parseJson(String jsonStr) {
    try {
      return json.decode(jsonStr) as Map<String, dynamic>;
    } catch (_) {
      return {};
    }
  }
}
