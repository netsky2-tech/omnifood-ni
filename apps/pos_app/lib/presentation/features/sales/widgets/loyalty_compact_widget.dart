import 'package:flutter/material.dart';
import 'package:pos_app/domain/models/loyalty/loyalty_evaluation.dart';
import 'package:pos_app/domain/models/loyalty/loyalty_program.dart';

class LoyaltyCompactWidget extends StatelessWidget {
  final LoyaltyEvaluation? evaluation;

  const LoyaltyCompactWidget({super.key, this.evaluation});

  @override
  Widget build(BuildContext context) {
    if (evaluation == null || evaluation!.programs.isEmpty) {
      return const SizedBox.shrink();
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.grey.shade50,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.grey.shade200),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          if (evaluation!.staleConfigIndicator)
            Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Row(
                children: [
                  Icon(Icons.info_outline, size: 14, color: Colors.orange.shade700),
                  const SizedBox(width: 4),
                  Text(
                    'Config. desactualizada',
                    style: TextStyle(
                      fontSize: 11,
                      color: Colors.orange.shade700,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),
          ...evaluation!.programs.map((program) => _ProgramRow(program: program)),
        ],
      ),
    );
  }
}

class _ProgramRow extends StatelessWidget {
  final ProgramEvaluation program;

  const _ProgramRow({required this.program});

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

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        children: [
          Text(_programEmoji, style: const TextStyle(fontSize: 14)),
          const SizedBox(width: 6),
          Expanded(
            child: Text(
              program.programName,
              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w500),
              overflow: TextOverflow.ellipsis,
            ),
          ),
          if (program.earningPreviewUnits > 0)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(
                color: Colors.green.shade50,
                borderRadius: BorderRadius.circular(4),
              ),
              child: Text(
                '+${program.earningPreviewUnits}',
                style: TextStyle(
                  fontSize: 11,
                  color: Colors.green.shade700,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
          const SizedBox(width: 8),
          Text(
            '${program.balanceUnits}',
            style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
          ),
          if (program.nextReward != null) ...[
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                'Próx: ${program.nextReward!.name}',
                style: TextStyle(fontSize: 10, color: Colors.grey.shade600),
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ],
      ),
    );
  }
}
