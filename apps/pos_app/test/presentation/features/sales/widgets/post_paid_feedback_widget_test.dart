import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/models/loyalty/loyalty_program.dart';
import 'package:pos_app/domain/services/sales/post_paid_feedback_service.dart';
import 'package:pos_app/presentation/features/sales/widgets/post_paid_feedback_widget.dart';

void main() {
  group('PostPaidFeedbackWidget', () {
    testWidgets('muestra puntos ganados para SPEND_POINTS',
        (tester) async {
      final feedback = PostPaidFeedback(
        programs: [
          ProgramFeedback(
            programId: 'prog-1',
            programName: 'Puntos SOHO',
            programType: LoyaltyProgramType.spendPoints,
            unitsEarned: 25,
            unitsRedeemed: 0,
            newBalance: 100,
            unitsToNextReward: 0,
            rewardAvailable: false,
          ),
        ],
      );

      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: PostPaidFeedbackWidget(feedback: feedback),
        ),
      ));

      expect(find.text('Puntos SOHO'), findsOneWidget);
      expect(find.text('+25 puntos'), findsOneWidget);
      expect(find.text('Saldo: 100'), findsOneWidget);
    });

    testWidgets('muestra sellos ganados para PRODUCT_STAMPS',
        (tester) async {
      final feedback = PostPaidFeedback(
        programs: [
          ProgramFeedback(
            programId: 'prog-2',
            programName: 'Smash Burger Club',
            programType: LoyaltyProgramType.productStamps,
            unitsEarned: 1,
            unitsRedeemed: 0,
            newBalance: 7,
            unitsToNextReward: 3,
            rewardAvailable: false,
          ),
        ],
      );

      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: PostPaidFeedbackWidget(feedback: feedback),
        ),
      ));

      expect(find.text('Smash Burger Club'), findsOneWidget);
      expect(find.text('+1 sello'), findsOneWidget);
      expect(find.textContaining('3 para tu recompensa'), findsOneWidget);
    });

    testWidgets('muestra recompensa disponible', (tester) async {
      final feedback = PostPaidFeedback(
        programs: [
          ProgramFeedback(
            programId: 'prog-2',
            programName: 'Smash Burger Club',
            programType: LoyaltyProgramType.productStamps,
            unitsEarned: 1,
            unitsRedeemed: 0,
            newBalance: 10,
            unitsToNextReward: 0,
            rewardAvailable: true,
            rewardName: 'Smash Burger Gratis',
          ),
        ],
      );

      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: PostPaidFeedbackWidget(feedback: feedback),
        ),
      ));

      expect(find.textContaining('Recompensa disponible'), findsWidgets);
      expect(find.textContaining('Smash Burger Gratis'), findsWidgets);
    });

    testWidgets('muestra redención aplicada', (tester) async {
      final feedback = PostPaidFeedback(
        programs: [
          ProgramFeedback(
            programId: 'prog-1',
            programName: 'Puntos SOHO',
            programType: LoyaltyProgramType.spendPoints,
            unitsEarned: 25,
            unitsRedeemed: 100,
            newBalance: 25,
            unitsToNextReward: 75,
            rewardAvailable: false,
            rewardRedeemed: true,
            redeemedRewardName: 'C\$50 descuento',
          ),
        ],
      );

      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: PostPaidFeedbackWidget(feedback: feedback),
        ),
      ));

      expect(find.textContaining('-100'), findsOneWidget);
      expect(find.textContaining('+25'), findsOneWidget);
      expect(find.textContaining('C\$50 descuento'), findsWidgets);
    });

    testWidgets('no muestra nada cuando feedback es null', (tester) async {
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: PostPaidFeedbackWidget(feedback: null),
        ),
      ));

      expect(find.byType(PostPaidFeedbackWidget), findsOneWidget);
      expect(find.byType(SizedBox), findsWidgets);
    });

    testWidgets('muestra visitas ganadas para VISIT_STAMPS',
        (tester) async {
      final feedback = PostPaidFeedback(
        programs: [
          ProgramFeedback(
            programId: 'prog-3',
            programName: 'Visitas',
            programType: LoyaltyProgramType.visitStamps,
            unitsEarned: 1,
            unitsRedeemed: 0,
            newBalance: 5,
            unitsToNextReward: 0,
            rewardAvailable: false,
          ),
        ],
      );

      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: PostPaidFeedbackWidget(feedback: feedback),
        ),
      ));

      expect(find.text('Visitas'), findsOneWidget);
      expect(find.text('+1 visita'), findsOneWidget);
    });

    testWidgets('muestra múltiples programas', (tester) async {
      final feedback = PostPaidFeedback(
        programs: [
          ProgramFeedback(
            programId: 'prog-1',
            programName: 'Puntos SOHO',
            programType: LoyaltyProgramType.spendPoints,
            unitsEarned: 25,
            unitsRedeemed: 0,
            newBalance: 100,
            unitsToNextReward: 0,
            rewardAvailable: false,
          ),
          ProgramFeedback(
            programId: 'prog-2',
            programName: 'Smash Burger Club',
            programType: LoyaltyProgramType.productStamps,
            unitsEarned: 1,
            unitsRedeemed: 0,
            newBalance: 7,
            unitsToNextReward: 3,
            rewardAvailable: false,
          ),
        ],
      );

      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: PostPaidFeedbackWidget(feedback: feedback),
        ),
      ));

      expect(find.text('Puntos SOHO'), findsOneWidget);
      expect(find.text('Smash Burger Club'), findsOneWidget);
    });
  });
}
