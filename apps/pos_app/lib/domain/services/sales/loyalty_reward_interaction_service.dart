import 'package:pos_app/domain/models/loyalty/loyalty_evaluation.dart';
import 'package:pos_app/domain/models/loyalty/reward_definition.dart';
import 'package:pos_app/domain/services/sales/loyalty_evaluation_service.dart';

class LoyaltyRewardInteractionService {
  final LoyaltyEvaluationService _evaluationService;
  String? _selectedRewardId;

  LoyaltyRewardInteractionService(this._evaluationService);

  String? get selectedRewardId => _selectedRewardId;

  bool canShowCta(LoyaltyEvaluation evaluation) {
    return evaluation.programs.any((p) => p.eligibleRewards.isNotEmpty);
  }

  void selectReward(LoyaltyEvaluation evaluation, String rewardId) {
    final isEligible = evaluation.programs.any(
      (p) => p.eligibleRewards.any((r) => r.rewardId == rewardId),
    );

    if (isEligible) {
      _selectedRewardId = rewardId;
    }
  }

  void clearSelection() {
    _selectedRewardId = null;
  }

  bool validateAfterCartChange(LoyaltyEvaluation newEvaluation) {
    if (_selectedRewardId == null) return false;

    final stillEligible = newEvaluation.programs.any(
      (p) => p.eligibleRewards.any((r) => r.rewardId == _selectedRewardId),
    );

    if (!stillEligible) {
      _selectedRewardId = null;
      return false;
    }

    return true;
  }

  RewardDefinitionLocal? getSelectedReward(List<RewardDefinitionLocal> rewards) {
    if (_selectedRewardId == null) return null;
    try {
      return rewards.firstWhere((r) => r.id == _selectedRewardId);
    } catch (_) {
      return null;
    }
  }
}
