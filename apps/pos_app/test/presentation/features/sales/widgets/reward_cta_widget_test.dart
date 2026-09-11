import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/models/loyalty/loyalty_evaluation.dart';
import 'package:pos_app/domain/models/loyalty/loyalty_program.dart';
import 'package:pos_app/domain/models/loyalty/reward_definition.dart';

/// Widget that displays a CTA button when a reward is eligible.
/// Shows reward name and cost, requires explicit tap to apply.
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

/// Dialog for confirming reward application before PAID.
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

void main() {
  group('RewardCtaWidget — Triangulación', () {
    testWidgets('muestra CTA cuando hay recompensa elegible', (tester) async {
      const evaluation = LoyaltyEvaluation(
        customerId: 'c1',
        ticketId: 't1',
        programs: [
          ProgramEvaluation(
            programId: 'p1',
            programName: 'Puntos',
            programType: LoyaltyProgramType.spendPoints,
            balanceUnits: 150,
            eligibleRewards: [
              EligibleReward(
                rewardId: 'rw-1',
                name: 'C\$50 descuento',
                rewardType: RewardType.discountAmount,
                costUnits: 100,
              ),
            ],
          ),
        ],
      );

      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: RewardCtaWidget(evaluation: evaluation),
          ),
        ),
      );

      expect(find.byKey(const Key('reward_cta_button')), findsOneWidget);
      expect(find.byKey(const Key('reward_cta_label')), findsOneWidget);
      expect(find.text('Aplicar C\$50 descuento'), findsOneWidget);
    });

    testWidgets('oculta CTA cuando no hay recompensa elegible', (tester) async {
      const evaluation = LoyaltyEvaluation(
        customerId: 'c1',
        ticketId: 't1',
        programs: [
          ProgramEvaluation(
            programId: 'p1',
            programName: 'Puntos',
            programType: LoyaltyProgramType.spendPoints,
            balanceUnits: 50,
            eligibleRewards: [],
          ),
        ],
      );

      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: RewardCtaWidget(evaluation: evaluation),
          ),
        ),
      );

      expect(find.byKey(const Key('reward_cta_button')), findsNothing);
    });

    testWidgets('oculta CTA cuando evaluation es null', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: RewardCtaWidget(evaluation: null),
          ),
        ),
      );

      expect(find.byKey(const Key('reward_cta_button')), findsNothing);
    });

    testWidgets('llama onApplyReward al tocar el botón', (tester) async {
      bool tapped = false;
      const evaluation = LoyaltyEvaluation(
        customerId: 'c1',
        ticketId: 't1',
        programs: [
          ProgramEvaluation(
            programId: 'p1',
            programName: 'Puntos',
            programType: LoyaltyProgramType.spendPoints,
            balanceUnits: 150,
            eligibleRewards: [
              EligibleReward(
                rewardId: 'rw-1',
                name: 'C\$50 descuento',
                rewardType: RewardType.discountAmount,
                costUnits: 100,
              ),
            ],
          ),
        ],
      );

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: RewardCtaWidget(
              evaluation: evaluation,
              onApplyReward: () => tapped = true,
            ),
          ),
        ),
      );

      await tester.tap(find.byKey(const Key('reward_cta_button')));
      expect(tapped, isTrue);
    });
  });

  group('RewardConfirmationDialog — Triangulación', () {
    testWidgets('muestra nombre y costo de la recompensa', (tester) async {
      const reward = EligibleReward(
        rewardId: 'rw-1',
        name: 'Smash Burger Gratis',
        rewardType: RewardType.freeProduct,
        costUnits: 10,
      );

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Builder(
              builder: (context) => ElevatedButton(
                onPressed: () => RewardConfirmationDialog.show(
                  context,
                  reward: reward,
                ),
                child: const Text('Show'),
              ),
            ),
          ),
        ),
      );

      await tester.tap(find.text('Show'));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('reward_confirmation_dialog')), findsOneWidget);
      expect(find.text('¿Desea aplicar "Smash Burger Gratis" por 10 puntos?'), findsOneWidget);
    });

    testWidgets('retorna true al confirmar', (tester) async {
      const reward = EligibleReward(
        rewardId: 'rw-1',
        name: 'Test Reward',
        rewardType: RewardType.discountAmount,
        costUnits: 50,
      );

      bool? result;
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Builder(
              builder: (context) => ElevatedButton(
                onPressed: () async {
                  result = await RewardConfirmationDialog.show(
                    context,
                    reward: reward,
                  );
                },
                child: const Text('Show'),
              ),
            ),
          ),
        ),
      );

      await tester.tap(find.text('Show'));
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('reward_confirm_button')));
      await tester.pumpAndSettle();

      expect(result, isTrue);
    });

    testWidgets('retorna false al cancelar', (tester) async {
      const reward = EligibleReward(
        rewardId: 'rw-1',
        name: 'Test Reward',
        rewardType: RewardType.discountAmount,
        costUnits: 50,
      );

      bool? result;
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Builder(
              builder: (context) => ElevatedButton(
                onPressed: () async {
                  result = await RewardConfirmationDialog.show(
                    context,
                    reward: reward,
                  );
                },
                child: const Text('Show'),
              ),
            ),
          ),
        ),
      );

      await tester.tap(find.text('Show'));
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('reward_cancel_button')));
      await tester.pumpAndSettle();

      expect(result, isFalse);
    });
  });
}
