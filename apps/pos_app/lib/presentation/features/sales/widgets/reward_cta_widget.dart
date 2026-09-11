import 'package:flutter/material.dart';
import 'package:pos_app/domain/models/loyalty/loyalty_evaluation.dart';

/// CTA button that appears when a loyalty reward is eligible.
///
/// Shows the next available reward name and cost. Requires explicit
/// operator tap to apply — never auto-redeems at threshold.
class RewardCtaWidget extends StatelessWidget {
  final LoyaltyEvaluation? evaluation;
  final VoidCallback? onApplyReward;

  const RewardCtaWidget({
    super.key,
    this.evaluation,
    this.onApplyReward,
  });

  bool get _hasEligibleReward => evaluation?.hasAnyEligibleReward ?? false;

  EligibleReward? get _nextReward => evaluation?.nextReward;

  @override
  Widget build(BuildContext context) {
    if (!_hasEligibleReward || _nextReward == null) {
      return const SizedBox.shrink();
    }

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: SizedBox(
        width: double.infinity,
        child: ElevatedButton.icon(
          key: const Key('reward_cta_button'),
          onPressed: onApplyReward,
          icon: const Icon(Icons.card_giftcard, size: 16),
          label: Text(
            'Aplicar ${_nextReward!.name}',
            key: const Key('reward_cta_label'),
          ),
          style: ElevatedButton.styleFrom(
            backgroundColor: Colors.green.shade50,
            foregroundColor: Colors.green.shade800,
            elevation: 0,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          ),
        ),
      ),
    );
  }
}
