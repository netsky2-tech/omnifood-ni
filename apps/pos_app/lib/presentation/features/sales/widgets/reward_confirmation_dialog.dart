import 'package:flutter/material.dart';
import 'package:pos_app/domain/models/loyalty/loyalty_evaluation.dart';

/// Confirmation dialog for applying a loyalty reward before PAID.
///
/// Requires explicit operator confirmation. Never auto-confirms.
/// Shows reward name and cost in points.
class RewardConfirmationDialog extends StatelessWidget {
  final EligibleReward reward;
  final VoidCallback onConfirm;
  final VoidCallback onCancel;

  const RewardConfirmationDialog({
    super.key,
    required this.reward,
    required this.onConfirm,
    required this.onCancel,
  });

  static Future<bool?> show(
    BuildContext context, {
    required EligibleReward reward,
  }) {
    return showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (_) => RewardConfirmationDialog(
        reward: reward,
        onConfirm: () => Navigator.of(context).pop(true),
        onCancel: () => Navigator.of(context).pop(false),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      key: const Key('reward_confirmation_dialog'),
      title: const Text('Aplicar recompensa'),
      content: Text(
        '¿Desea aplicar "${reward.name}" por ${reward.costUnits} puntos?',
        key: const Key('reward_confirmation_text'),
      ),
      actions: [
        TextButton(
          key: const Key('reward_cancel_button'),
          onPressed: onCancel,
          child: const Text('Cancelar'),
        ),
        ElevatedButton(
          key: const Key('reward_confirm_button'),
          onPressed: onConfirm,
          child: const Text('Aplicar'),
        ),
      ],
    );
  }
}
