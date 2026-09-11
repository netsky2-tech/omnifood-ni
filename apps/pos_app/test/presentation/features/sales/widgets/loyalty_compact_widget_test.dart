import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/models/loyalty/loyalty_evaluation.dart';
import 'package:pos_app/domain/models/loyalty/loyalty_program.dart';
import 'package:pos_app/domain/models/loyalty/reward_definition.dart';
import 'package:pos_app/presentation/features/sales/widgets/loyalty_compact_widget.dart';

void main() {
  group('LoyaltyCompactWidget', () {
    testWidgets('muestra balance cuando hay evaluación con earning',
        (tester) async {
      final evaluation = LoyaltyEvaluation(
        customerId: 'cust-1',
        ticketId: 'ticket-1',
        programs: [
          const ProgramEvaluation(
            programId: 'prog-1',
            programName: 'Puntos SOHO',
            programType: LoyaltyProgramType.spendPoints,
            balanceUnits: 150,
            earningPreviewUnits: 20,
          ),
        ],
      );

      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: LoyaltyCompactWidget(evaluation: evaluation),
        ),
      ));

      expect(find.text('Puntos SOHO'), findsOneWidget);
      expect(find.text('150'), findsOneWidget);
      expect(find.text('+20'), findsOneWidget);
    });

    testWidgets('muestra próxima reward cuando hay eligibleRewards',
        (tester) async {
      final evaluation = LoyaltyEvaluation(
        customerId: 'cust-1',
        ticketId: 'ticket-1',
        programs: [
          const ProgramEvaluation(
            programId: 'prog-1',
            programName: 'Puntos SOHO',
            programType: LoyaltyProgramType.spendPoints,
            balanceUnits: 150,
            earningPreviewUnits: 20,
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

      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: LoyaltyCompactWidget(evaluation: evaluation),
        ),
      ));

      expect(find.text('Próx: C\$50 descuento'), findsOneWidget);
    });

    testWidgets('muestra config stale indicator cuando staleConfigIndicator=true',
        (tester) async {
      final evaluation = LoyaltyEvaluation(
        customerId: 'cust-1',
        ticketId: 'ticket-1',
        programs: [
          const ProgramEvaluation(
            programId: 'prog-1',
            programName: 'Puntos SOHO',
            programType: LoyaltyProgramType.spendPoints,
            balanceUnits: 150,
            earningPreviewUnits: 20,
          ),
        ],
        staleConfigIndicator: true,
      );

      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: LoyaltyCompactWidget(evaluation: evaluation),
        ),
      ));

      expect(find.text('Config. desactualizada'), findsOneWidget);
    });

    testWidgets('no muestra nada cuando evaluation es null', (tester) async {
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: LoyaltyCompactWidget(evaluation: null),
        ),
      ));

      expect(find.byType(LoyaltyCompactWidget), findsOneWidget);
      // Should render empty container
      expect(find.byType(SizedBox), findsWidgets);
    });

    testWidgets('muestra múltiples programas', (tester) async {
      final evaluation = LoyaltyEvaluation(
        customerId: 'cust-1',
        ticketId: 'ticket-1',
        programs: [
          const ProgramEvaluation(
            programId: 'prog-1',
            programName: 'Puntos SOHO',
            programType: LoyaltyProgramType.spendPoints,
            balanceUnits: 150,
            earningPreviewUnits: 20,
          ),
          const ProgramEvaluation(
            programId: 'prog-2',
            programName: 'Sellos Café',
            programType: LoyaltyProgramType.productStamps,
            balanceUnits: 7,
            earningPreviewUnits: 3,
          ),
        ],
      );

      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: LoyaltyCompactWidget(evaluation: evaluation),
        ),
      ));

      expect(find.text('Puntos SOHO'), findsOneWidget);
      expect(find.text('Sellos Café'), findsOneWidget);
    });

    testWidgets('muestra próximo reward cuando hay eligibleRewards en programa',
        (tester) async {
      final evaluation = LoyaltyEvaluation(
        customerId: 'cust-1',
        ticketId: 'ticket-1',
        programs: [
          const ProgramEvaluation(
            programId: 'prog-1',
            programName: 'Puntos SOHO',
            programType: LoyaltyProgramType.spendPoints,
            balanceUnits: 150,
            earningPreviewUnits: 20,
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

      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: LoyaltyCompactWidget(evaluation: evaluation),
        ),
      ));

      expect(find.text('Próx: C\$50 descuento'), findsOneWidget);
    });

    testWidgets('muestraearning preview por programa', (tester) async {
      final evaluation = LoyaltyEvaluation(
        customerId: 'cust-1',
        ticketId: 'ticket-1',
        programs: [
          const ProgramEvaluation(
            programId: 'prog-1',
            programName: 'Puntos SOHO',
            programType: LoyaltyProgramType.spendPoints,
            balanceUnits: 150,
            earningPreviewUnits: 25,
          ),
          const ProgramEvaluation(
            programId: 'prog-2',
            programName: 'Sellos Café',
            programType: LoyaltyProgramType.productStamps,
            balanceUnits: 7,
            earningPreviewUnits: 3,
          ),
        ],
      );

      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: LoyaltyCompactWidget(evaluation: evaluation),
        ),
      ));

      expect(find.text('+25'), findsOneWidget);
      expect(find.text('+3'), findsOneWidget);
    });
  });
}
