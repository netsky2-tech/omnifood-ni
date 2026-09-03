import 'package:flutter/material.dart';
import 'package:pos_app/domain/models/loyalty/loyalty_program.dart';
import 'package:pos_app/domain/services/sales/post_paid_feedback_service.dart';

class PostPaidFeedbackWidget extends StatelessWidget {
  final PostPaidFeedback? feedback;

  const PostPaidFeedbackWidget({super.key, this.feedback});

  @override
  Widget build(BuildContext context) {
    if (feedback == null || !feedback!.hasContent) {
      return const SizedBox.shrink();
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.green.shade50,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.green.shade200),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          ...feedback!.programs.map((p) => _ProgramFeedbackRow(program: p)),
        ],
      ),
    );
  }
}

class _ProgramFeedbackRow extends StatelessWidget {
  final ProgramFeedback program;

  const _ProgramFeedbackRow({required this.program});

  String get _programEmoji {
    switch (program.programType) {
      case LoyaltyProgramType.spendPoints:
        return '★';
      case LoyaltyProgramType.productStamps:
        return '◉';
      case LoyaltyProgramType.visitStamps:
        return '👣';
    }
  }

  String get _unitLabel {
    switch (program.programType) {
      case LoyaltyProgramType.spendPoints:
        return 'puntos';
      case LoyaltyProgramType.productStamps:
        return program.unitsEarned == 1 ? 'sello' : 'sellos';
      case LoyaltyProgramType.visitStamps:
        return program.unitsEarned == 1 ? 'visita' : 'visitas';
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              Text(_programEmoji, style: const TextStyle(fontSize: 14)),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  program.programName,
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w500,
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              if (program.unitsRedeemed > 0)
                Padding(
                  padding: const EdgeInsets.only(right: 6),
                  child: Text(
                    '-${program.unitsRedeemed}',
                    style: TextStyle(
                      fontSize: 11,
                      color: Colors.red.shade700,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              if (program.unitsEarned > 0)
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(
                    color: Colors.green.shade100,
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Text(
                    '+${program.unitsEarned} $_unitLabel',
                    style: TextStyle(
                      fontSize: 11,
                      color: Colors.green.shade800,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
            ],
          ),
          if (program.rewardAvailable && program.rewardName != null)
            Padding(
              padding: const EdgeInsets.only(top: 2, left: 20),
              child: Text(
                'Recompensa disponible: ${program.rewardName}',
                style: TextStyle(
                  fontSize: 11,
                  color: Colors.green.shade700,
                  fontWeight: FontWeight.w600,
                ),
              ),
            )
          else if (program.unitsToNextReward > 0)
            Padding(
              padding: const EdgeInsets.only(top: 2, left: 20),
              child: Text(
                'Te faltan ${program.unitsToNextReward} para tu recompensa',
                style: TextStyle(
                  fontSize: 10,
                  color: Colors.grey.shade600,
                ),
              ),
            ),
          if (program.rewardRedeemed && program.redeemedRewardName != null)
            Padding(
              padding: const EdgeInsets.only(top: 2, left: 20),
              child: Text(
                'Redimido: ${program.redeemedRewardName}',
                style: TextStyle(
                  fontSize: 10,
                  color: Colors.orange.shade700,
                ),
              ),
            ),
          Padding(
            padding: const EdgeInsets.only(top: 1, left: 20),
            child: Text(
              'Saldo: ${program.newBalance}',
              style: TextStyle(
                fontSize: 10,
                color: Colors.grey.shade500,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
