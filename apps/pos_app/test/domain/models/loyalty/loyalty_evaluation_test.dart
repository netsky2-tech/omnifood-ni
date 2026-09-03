import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/models/loyalty/loyalty_evaluation.dart';
import 'package:pos_app/domain/models/loyalty/loyalty_program.dart';
import 'package:pos_app/domain/models/loyalty/reward_definition.dart';

void main() {
  group('LoyaltyEvaluation — Domain Model', () {
    test('crea evaluación vacía (sin programas)', () {
      const evaluation = LoyaltyEvaluation(
        customerId: 'c-1',
        ticketId: 'ticket-1',
        programs: [],
        selectedRedemptionStillValid: false,
        staleConfigIndicator: false,
      );

      expect(evaluation.programs, isEmpty);
      expect(evaluation.hasAnyEarning, isFalse);
      expect(evaluation.hasAnyEligibleReward, isFalse);
      expect(evaluation.totalEarningPreviewUnits, equals(0));
    });

    test('hasAnyEarning retorna true cuando al menos un programa tiene earning > 0', () {
      const evaluation = LoyaltyEvaluation(
        customerId: 'c-1',
        ticketId: 'ticket-1',
        programs: [
          ProgramEvaluation(
            programId: 'p1',
            programName: 'Puntos SOHO',
            programType: LoyaltyProgramType.spendPoints,
            balanceUnits: 50,
            earningPreviewUnits: 25,
          ),
          ProgramEvaluation(
            programId: 'p2',
            programName: 'Sellos Café',
            programType: LoyaltyProgramType.productStamps,
            balanceUnits: 7,
            earningPreviewUnits: 0,
          ),
        ],
        selectedRedemptionStillValid: false,
        staleConfigIndicator: false,
      );

      expect(evaluation.hasAnyEarning, isTrue);
      expect(evaluation.totalEarningPreviewUnits, equals(25));
    });

    test('hasAnyEligibleReward retorna true cuando al menos un programa tiene rewards elegibles', () {
      const evaluation = LoyaltyEvaluation(
        customerId: 'c-1',
        ticketId: 'ticket-1',
        programs: [
          ProgramEvaluation(
            programId: 'p1',
            programName: 'Puntos SOHO',
            programType: LoyaltyProgramType.spendPoints,
            balanceUnits: 100,
            earningPreviewUnits: 10,
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
        selectedRedemptionStillValid: false,
        staleConfigIndicator: false,
      );

      expect(evaluation.hasAnyEligibleReward, isTrue);
    });

    test('nextReward retorna la reward de menor costo entre todas las elegibles', () {
      const evaluation = LoyaltyEvaluation(
        customerId: 'c-1',
        ticketId: 'ticket-1',
        programs: [
          ProgramEvaluation(
            programId: 'p1',
            programName: 'Puntos',
            programType: LoyaltyProgramType.spendPoints,
            balanceUnits: 200,
            earningPreviewUnits: 10,
            eligibleRewards: [
              EligibleReward(
                rewardId: 'rw-big', name: 'Grande', rewardType: RewardType.discountAmount, costUnits: 200,
              ),
              EligibleReward(
                rewardId: 'rw-small', name: 'Pequeña', rewardType: RewardType.discountAmount, costUnits: 50,
              ),
            ],
          ),
        ],
        selectedRedemptionStillValid: false,
        staleConfigIndicator: false,
      );

      expect(evaluation.nextReward?.rewardId, equals('rw-small'));
    });
  });

  group('ProgramEvaluation', () {
    test('construye con valores por defecto', () {
      const pe = ProgramEvaluation(
        programId: 'p1',
        programName: 'Test',
        programType: LoyaltyProgramType.visitStamps,
        balanceUnits: 0,
        earningPreviewUnits: 0,
      );

      expect(pe.eligibleRewards, isEmpty);
      expect(pe.nextReward, isNull);
    });
  });
}
