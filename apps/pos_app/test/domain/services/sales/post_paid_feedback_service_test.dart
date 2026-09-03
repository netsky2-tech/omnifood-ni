import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/models/loyalty/loyalty_evaluation.dart';
import 'package:pos_app/domain/models/loyalty/loyalty_program.dart';
import 'package:pos_app/domain/models/loyalty/reward_definition.dart';
import 'package:pos_app/domain/services/sales/post_paid_feedback_service.dart';

void main() {
  late PostPaidFeedbackService service;

  setUp(() {
    service = const PostPaidFeedbackService();
  });

  group('PostPaidFeedbackService', () {
    group('SPEND_POINTS earning feedback', () {
      test('genera feedback con puntos ganados y distancia a reward', () {
        final evaluation = LoyaltyEvaluation(
          customerId: 'cust-1',
          ticketId: 'ticket-1',
          programs: [
            const ProgramEvaluation(
              programId: 'prog-1',
              programName: 'Puntos SOHO',
              programType: LoyaltyProgramType.spendPoints,
              balanceUnits: 75,
              earningPreviewUnits: 25,
            ),
          ],
        );

        final feedback = service.compute(
          evaluation: evaluation,
          postCommitBalances: const {'prog-1': 100},
          earnedUnits: const {'prog-1': 25},
          redeemedUnits: const {},
        );

        expect(feedback.programs.length, equals(1));
        expect(feedback.programs.first.unitsEarned, equals(25));
        expect(feedback.programs.first.newBalance, equals(100));
        expect(feedback.programs.first.programName, equals('Puntos SOHO'));
      });

      test('muestra recompensa disponible cuando balance alcanza costo', () {
        final evaluation = LoyaltyEvaluation(
          customerId: 'cust-1',
          ticketId: 'ticket-1',
          programs: [
            ProgramEvaluation(
              programId: 'prog-1',
              programName: 'Puntos SOHO',
              programType: LoyaltyProgramType.spendPoints,
              balanceUnits: 80,
              earningPreviewUnits: 25,
              eligibleRewards: const [
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

        final feedback = service.compute(
          evaluation: evaluation,
          postCommitBalances: const {'prog-1': 105},
          earnedUnits: const {'prog-1': 25},
          redeemedUnits: const {},
        );

        expect(feedback.programs.first.rewardAvailable, isTrue);
        expect(feedback.programs.first.rewardName, equals('C\$50 descuento'));
      });

      test('no muestra recompensa disponible cuando balance es insuficiente', () {
        final evaluation = LoyaltyEvaluation(
          customerId: 'cust-1',
          ticketId: 'ticket-1',
          programs: [
            ProgramEvaluation(
              programId: 'prog-1',
              programName: 'Puntos SOHO',
              programType: LoyaltyProgramType.spendPoints,
              balanceUnits: 50,
              earningPreviewUnits: 20,
              eligibleRewards: const [
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

        final feedback = service.compute(
          evaluation: evaluation,
          postCommitBalances: const {'prog-1': 70},
          earnedUnits: const {'prog-1': 20},
          redeemedUnits: const {},
        );

        expect(feedback.programs.first.rewardAvailable, isFalse);
        expect(feedback.programs.first.unitsToNextReward, equals(30));
      });
    });

    group('PRODUCT_STAMPS earning feedback', () {
      test('genera feedback con sellos ganados', () {
        final evaluation = LoyaltyEvaluation(
          customerId: 'cust-1',
          ticketId: 'ticket-1',
          programs: [
            ProgramEvaluation(
              programId: 'prog-2',
              programName: 'Smash Burger Club',
              programType: LoyaltyProgramType.productStamps,
              balanceUnits: 6,
              earningPreviewUnits: 1,
              eligibleRewards: const [
                EligibleReward(
                  rewardId: 'rw-2',
                  name: 'Smash Burger Gratis',
                  rewardType: RewardType.freeProduct,
                  costUnits: 10,
                ),
              ],
            ),
          ],
        );

        final feedback = service.compute(
          evaluation: evaluation,
          postCommitBalances: const {'prog-2': 7},
          earnedUnits: const {'prog-2': 1},
          redeemedUnits: const {},
        );

        expect(feedback.programs.first.unitsEarned, equals(1));
        expect(feedback.programs.first.newBalance, equals(7));
        expect(feedback.programs.first.unitsToNextReward, equals(3));
        expect(feedback.programs.first.rewardAvailable, isFalse);
      });

      test('muestra recompensa disponible al alcanzar 10/10', () {
        final evaluation = LoyaltyEvaluation(
          customerId: 'cust-1',
          ticketId: 'ticket-1',
          programs: [
            ProgramEvaluation(
              programId: 'prog-2',
              programName: 'Smash Burger Club',
              programType: LoyaltyProgramType.productStamps,
              balanceUnits: 9,
              earningPreviewUnits: 1,
              eligibleRewards: const [
                EligibleReward(
                  rewardId: 'rw-2',
                  name: 'Smash Burger Gratis',
                  rewardType: RewardType.freeProduct,
                  costUnits: 10,
                ),
              ],
            ),
          ],
        );

        final feedback = service.compute(
          evaluation: evaluation,
          postCommitBalances: const {'prog-2': 10},
          earnedUnits: const {'prog-2': 1},
          redeemedUnits: const {},
        );

        expect(feedback.programs.first.rewardAvailable, isTrue);
        expect(feedback.programs.first.rewardName, equals('Smash Burger Gratis'));
        expect(feedback.programs.first.unitsToNextReward, equals(0));
      });
    });

    group('VISIT_STAMPS earning feedback', () {
      test('genera feedback con visitas ganadas', () {
        final evaluation = LoyaltyEvaluation(
          customerId: 'cust-1',
          ticketId: 'ticket-1',
          programs: [
            const ProgramEvaluation(
              programId: 'prog-3',
              programName: 'Visitas',
              programType: LoyaltyProgramType.visitStamps,
              balanceUnits: 4,
              earningPreviewUnits: 1,
            ),
          ],
        );

        final feedback = service.compute(
          evaluation: evaluation,
          postCommitBalances: const {'prog-3': 5},
          earnedUnits: const {'prog-3': 1},
          redeemedUnits: const {},
        );

        expect(feedback.programs.first.unitsEarned, equals(1));
        expect(feedback.programs.first.newBalance, equals(5));
      });
    });

    group('Redemption feedback', () {
      test('muestra información de redención cuando se aplicó reward', () {
        final evaluation = LoyaltyEvaluation(
          customerId: 'cust-1',
          ticketId: 'ticket-1',
          programs: [
            ProgramEvaluation(
              programId: 'prog-1',
              programName: 'Puntos SOHO',
              programType: LoyaltyProgramType.spendPoints,
              balanceUnits: 100,
              earningPreviewUnits: 25,
              eligibleRewards: const [
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

        final feedback = service.compute(
          evaluation: evaluation,
          postCommitBalances: const {'prog-1': 25},
          earnedUnits: const {'prog-1': 25},
          redeemedUnits: const {'prog-1': 100},
          redeemedRewardName: 'C\$50 descuento',
        );

        expect(feedback.programs.first.unitsRedeemed, equals(100));
        expect(feedback.programs.first.rewardRedeemed, isTrue);
        expect(feedback.programs.first.redeemedRewardName, equals('C\$50 descuento'));
      });
    });

    group('Multiple programs', () {
      test('genera feedback para múltiples programas', () {
        final evaluation = LoyaltyEvaluation(
          customerId: 'cust-1',
          ticketId: 'ticket-1',
          programs: [
            const ProgramEvaluation(
              programId: 'prog-1',
              programName: 'Puntos SOHO',
              programType: LoyaltyProgramType.spendPoints,
              balanceUnits: 75,
              earningPreviewUnits: 25,
            ),
            const ProgramEvaluation(
              programId: 'prog-2',
              programName: 'Smash Burger Club',
              programType: LoyaltyProgramType.productStamps,
              balanceUnits: 6,
              earningPreviewUnits: 1,
            ),
          ],
        );

        final feedback = service.compute(
          evaluation: evaluation,
          postCommitBalances: const {'prog-1': 100, 'prog-2': 7},
          earnedUnits: const {'prog-1': 25, 'prog-2': 1},
          redeemedUnits: const {},
        );

        expect(feedback.programs.length, equals(2));
      });
    });

    group('No earning', () {
      test('retorna vacío cuando no hay earning', () {
        final evaluation = LoyaltyEvaluation(
          customerId: 'cust-1',
          ticketId: 'ticket-1',
          programs: [
            const ProgramEvaluation(
              programId: 'prog-1',
              programName: 'Puntos SOHO',
              programType: LoyaltyProgramType.spendPoints,
              balanceUnits: 50,
              earningPreviewUnits: 0,
            ),
          ],
        );

        final feedback = service.compute(
          evaluation: evaluation,
          postCommitBalances: const {'prog-1': 50},
          earnedUnits: const {'prog-1': 0},
          redeemedUnits: const {},
        );

        expect(feedback.programs.length, equals(1));
        expect(feedback.programs.first.unitsEarned, equals(0));
      });
    });

    group('computeSummary', () {
      test('genera texto legible para un programa con puntos ganados', () {
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
              rewardAvailable: true,
              rewardName: 'C\$50 descuento',
            ),
          ],
        );

        final summary = service.computeSummary(feedback);
        expect(summary, contains('+25'));
        expect(summary, contains('Recompensa disponible'));
      });

      test('genera texto legible con distancia a reward', () {
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

        final summary = service.computeSummary(feedback);
        expect(summary, contains('+1'));
        expect(summary, contains('3'));
      });

      test('genera texto con redención aplicada', () {
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

        final summary = service.computeSummary(feedback);
        expect(summary, contains('-100'));
        expect(summary, contains('+25'));
      });
    });
  });
}
