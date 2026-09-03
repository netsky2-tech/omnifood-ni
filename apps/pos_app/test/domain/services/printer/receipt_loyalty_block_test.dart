import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/models/loyalty/loyalty_program.dart';
import 'package:pos_app/domain/services/printer/receipt_layout_formatter.dart';
import 'package:pos_app/domain/services/sales/post_paid_feedback_service.dart';

bool _anyLineContains(List<String> lines, String substring) {
  return lines.any((line) => line.contains(substring));
}

void main() {
  group('ReceiptLayoutFormatter — Loyalty block', () {
    late ReceiptLayoutFormatter formatter58;
    late ReceiptLayoutFormatter formatter80;

    setUp(() {
      formatter58 = ReceiptLayoutFormatter.format58mm();
      formatter80 = ReceiptLayoutFormatter.format80mm();
    });

    group('formatInvoiceText — 58mm', () {
      test('incluye bloque Loyalty cuando hay feedback', () {
        final loyaltyLines = formatter58.formatLoyaltyBlock(
          feedback: PostPaidFeedback(
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
          ),
        );

        expect(_anyLineContains(loyaltyLines, 'Puntos SOHO'), isTrue);
        expect(_anyLineContains(loyaltyLines, '+25'), isTrue);
        expect(_anyLineContains(loyaltyLines, '100'), isTrue);
      });

      test('incluye recompensa disponible en bloque Loyalty', () {
        final loyaltyLines = formatter58.formatLoyaltyBlock(
          feedback: PostPaidFeedback(
            programs: [
              ProgramFeedback(
                programId: 'prog-2',
                programName: 'Smash Burger Club',
                programType: LoyaltyProgramType.productStamps,
                unitsEarned: 1,
                unitsRedeemed: 0,
                newBalance: 100,
                unitsToNextReward: 0,
                rewardAvailable: true,
                rewardName: 'Smash Burger Gratis',
              ),
            ],
          ),
        );

        expect(_anyLineContains(loyaltyLines, 'Recompensa'), isTrue);
        expect(_anyLineContains(loyaltyLines, 'Smash Burger Gratis'), isTrue);
      });

      test('incluye distancia a recompensa', () {
        final loyaltyLines = formatter58.formatLoyaltyBlock(
          feedback: PostPaidFeedback(
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
          ),
        );

        expect(_anyLineContains(loyaltyLines, '3'), isTrue);
      });

      test('incluye redención aplicada', () {
        final loyaltyLines = formatter58.formatLoyaltyBlock(
          feedback: PostPaidFeedback(
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
          ),
        );

        expect(_anyLineContains(loyaltyLines, '-100'), isTrue);
        expect(_anyLineContains(loyaltyLines, 'C\$50 descuento'), isTrue);
      });

      test('retorna lista vacía cuando feedback es null', () {
        final loyaltyLines = formatter58.formatLoyaltyBlock(feedback: null);
        expect(loyaltyLines, isEmpty);
      });

      test('muestra múltiples programas', () {
        final loyaltyLines = formatter58.formatLoyaltyBlock(
          feedback: PostPaidFeedback(
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
          ),
        );

        expect(_anyLineContains(loyaltyLines, 'Puntos SOHO'), isTrue);
        expect(_anyLineContains(loyaltyLines, 'Smash Burger Club'), isTrue);
      });
    });

    group('formatInvoiceText — 80mm', () {
      test('incluye bloque Loyalty con formato 80mm', () {
        final loyaltyLines = formatter80.formatLoyaltyBlock(
          feedback: PostPaidFeedback(
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
          ),
        );

        expect(_anyLineContains(loyaltyLines, 'Puntos SOHO'), isTrue);
        expect(_anyLineContains(loyaltyLines, '+25'), isTrue);
      });
    });
  });
}
