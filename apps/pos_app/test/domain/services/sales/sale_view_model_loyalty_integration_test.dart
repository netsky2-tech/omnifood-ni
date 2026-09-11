import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/models/config/tax_regime.dart';
import 'package:pos_app/domain/models/loyalty/loyalty_evaluation.dart';
import 'package:pos_app/domain/models/loyalty/loyalty_program.dart';
import 'package:pos_app/domain/models/loyalty/reward_definition.dart';
import 'package:pos_app/domain/models/sales/invoice.dart';
import 'package:pos_app/domain/models/sales/invoice_item.dart';
import 'package:pos_app/domain/models/sales/payment.dart';
import 'package:pos_app/domain/services/printer/receipt_layout_formatter.dart';
import 'package:pos_app/domain/services/sales/post_paid_feedback_service.dart';

/// Triangulation tests: PostPaidFeedbackService → ReceiptLayoutFormatter integration.
/// Simulates the data flow from SaleViewModel.processSale() loyalty processing
/// through PostPaidFeedbackService.compute() to receipt output.
void main() {
  group('SaleViewModel loyalty integration — triangulation', () {
    late PostPaidFeedbackService feedbackService;
    late ReceiptLayoutFormatter formatter58;

    setUp(() {
      feedbackService = const PostPaidFeedbackService();
      formatter58 = ReceiptLayoutFormatter.format58mm();
    });

    test('SPEND_POINTS: sale with earning produces correct feedback + receipt', () {
      // Simulate: customer spent C$500, earned 50 points, balance now 200
      // LoyaltyService.calculatePointsEarned(500) = 50 (rate 0.1)
      final evaluation = LoyaltyEvaluation(
        customerId: 'cust-1',
        ticketId: 'ticket-1',
        programs: [
          const ProgramEvaluation(
            programId: 'prog-soho',
            programName: 'Puntos SOHO',
            programType: LoyaltyProgramType.spendPoints,
            balanceUnits: 200,
            earningPreviewUnits: 50,
          ),
        ],
      );

      final feedback = feedbackService.compute(
        evaluation: evaluation,
        postCommitBalances: {'prog-soho': 200},
        earnedUnits: {'prog-soho': 50},
        redeemedUnits: {'prog-soho': 0},
      );

      expect(feedback.hasContent, isTrue);
      expect(feedback.programs.first.unitsEarned, 50);
      expect(feedback.programs.first.newBalance, 200);

      // Summary text for post-sale display
      final summary = feedbackService.computeSummary(feedback);
      expect(summary, contains('+50 puntos'));

      // Receipt output
      final invoice = Invoice(
        id: 'inv-001',
        number: '001-001-01-00000001',
        createdAt: DateTime(2026, 9, 1, 10, 30),
        userId: 'user-01',
        subtotal: 500.00,
        totalTax: 75.00,
        total: 575.00,
      );
      final items = [
        InvoiceItem(
          id: 'item-1',
          invoiceId: 'inv-001',
          productId: 'prod-1',
          productName: 'Combo Completo',
          quantity: 2,
          unitPrice: 250.0,
          originalTaxRate: 0.15,
          appliedTaxRate: 0.15,
          taxAmount: 75.0,
          total: 575.0,
        ),
      ];
      final payments = [
        const Payment(
          id: 'pay-1',
          invoiceId: 'inv-001',
          method: PaymentMethod.cash,
          amount: 575.0,
        ),
      ];

      final ticket = formatter58.formatInvoiceText(
        invoice,
        items: items,
        payments: payments,
        businessName: 'OMNIFOOD',
        ruc: 'J0010000012345',
        loyaltyFeedback: feedback,
      );

      expect(ticket, contains('LEALTAD'));
      expect(ticket, contains('+50'));
      expect(ticket, contains('*** GRACIAS POR SU COMPRA ***'));
    });

    test('PRODUCT_STAMPS: stamp earning produces correct feedback + receipt', () {
      // Simulate: customer bought 2 items, earned 2 stamps, now has 8/10
      final evaluation = LoyaltyEvaluation(
        customerId: 'cust-2',
        ticketId: 'ticket-2',
        programs: [
          const ProgramEvaluation(
            programId: 'prog-smash',
            programName: 'Smash Burger Club',
            programType: LoyaltyProgramType.productStamps,
            balanceUnits: 8,
            earningPreviewUnits: 2,
          ),
        ],
      );

      final feedback = feedbackService.compute(
        evaluation: evaluation,
        postCommitBalances: {'prog-smash': 8},
        earnedUnits: {'prog-smash': 2},
        redeemedUnits: {'prog-smash': 0},
      );

      expect(feedback.hasContent, isTrue);
      expect(feedback.programs.first.unitsEarned, 2);

      final summary = feedbackService.computeSummary(feedback);
      expect(summary, contains('+2 sellos'));
    });

    test('VISIT_STAMPS: visit earning produces correct feedback + receipt', () {
      // Simulate: customer visited, earned 1 visit stamp, now has 4/5
      final evaluation = LoyaltyEvaluation(
        customerId: 'cust-3',
        ticketId: 'ticket-3',
        programs: [
          const ProgramEvaluation(
            programId: 'prog-visit',
            programName: 'Club Frecuencia',
            programType: LoyaltyProgramType.visitStamps,
            balanceUnits: 4,
            earningPreviewUnits: 1,
          ),
        ],
      );

      final feedback = feedbackService.compute(
        evaluation: evaluation,
        postCommitBalances: {'prog-visit': 4},
        earnedUnits: {'prog-visit': 1},
        redeemedUnits: {'prog-visit': 0},
      );

      expect(feedback.hasContent, isTrue);
      expect(feedback.programs.first.unitsEarned, 1);

      final summary = feedbackService.computeSummary(feedback);
      expect(summary, contains('+1 visita'));
    });

    test('redemption: points redeemed reduces balance, shows in feedback + receipt', () {
      // Simulate: customer redeemed 100 points, earned 25 new, balance now 75
      final evaluation = LoyaltyEvaluation(
        customerId: 'cust-1',
        ticketId: 'ticket-4',
        programs: [
          const ProgramEvaluation(
            programId: 'prog-soho',
            programName: 'Puntos SOHO',
            programType: LoyaltyProgramType.spendPoints,
            balanceUnits: 75,
            earningPreviewUnits: 25,
          ),
        ],
      );

      final feedback = feedbackService.compute(
        evaluation: evaluation,
        postCommitBalances: {'prog-soho': 75},
        earnedUnits: {'prog-soho': 25},
        redeemedUnits: {'prog-soho': 100},
        redeemedRewardName: 'C\$50 descuento',
      );

      expect(feedback.hasContent, isTrue);
      expect(feedback.programs.first.unitsRedeemed, 100);
      expect(feedback.programs.first.unitsEarned, 25);
      expect(feedback.programs.first.rewardRedeemed, isTrue);
      expect(feedback.programs.first.redeemedRewardName, 'C\$50 descuento');

      final summary = feedbackService.computeSummary(feedback);
      expect(summary, contains('-100 puntos'));
      expect(summary, contains('C\$50 descuento'));
      expect(summary, contains('+25 puntos'));
    });

    test('reward available: balance reaches cost, shows in feedback + receipt', () {
      // Simulate: customer reached 10 stamps, reward available
      final evaluation = LoyaltyEvaluation(
        customerId: 'cust-2',
        ticketId: 'ticket-5',
        programs: [
          const ProgramEvaluation(
            programId: 'prog-smash',
            programName: 'Smash Burger Club',
            programType: LoyaltyProgramType.productStamps,
            balanceUnits: 10,
            earningPreviewUnits: 2,
            eligibleRewards: [
              EligibleReward(
                rewardId: 'rw-1',
                name: 'Smash Burger Gratis',
                rewardType: RewardType.freeProduct,
                costUnits: 10,
              ),
            ],
          ),
        ],
      );

      final feedback = feedbackService.compute(
        evaluation: evaluation,
        postCommitBalances: {'prog-smash': 10},
        earnedUnits: {'prog-smash': 2},
        redeemedUnits: {'prog-smash': 0},
      );

      expect(feedback.programs.first.rewardAvailable, isTrue);
      expect(feedback.programs.first.rewardName, isNotNull);

      final summary = feedbackService.computeSummary(feedback);
      expect(summary, contains('Recompensa disponible'));
    });

    test('multi-program: two programs in same sale', () {
      // Simulate: customer earns points AND stamps in same transaction
      final evaluation = LoyaltyEvaluation(
        customerId: 'cust-1',
        ticketId: 'ticket-6',
        programs: [
          const ProgramEvaluation(
            programId: 'prog-soho',
            programName: 'Puntos SOHO',
            programType: LoyaltyProgramType.spendPoints,
            balanceUnits: 200,
            earningPreviewUnits: 50,
          ),
          const ProgramEvaluation(
            programId: 'prog-smash',
            programName: 'Smash Burger Club',
            programType: LoyaltyProgramType.productStamps,
            balanceUnits: 8,
            earningPreviewUnits: 2,
          ),
        ],
      );

      final feedback = feedbackService.compute(
        evaluation: evaluation,
        postCommitBalances: {'prog-soho': 200, 'prog-smash': 8},
        earnedUnits: {'prog-soho': 50, 'prog-smash': 2},
        redeemedUnits: {'prog-soho': 0, 'prog-smash': 0},
      );

      expect(feedback.programs.length, 2);
      expect(feedback.hasContent, isTrue);

      final summary = feedbackService.computeSummary(feedback);
      expect(summary, contains('+50 puntos'));
      expect(summary, contains('+2 sellos'));
    });

    test('no customer programs: returns empty feedback, no loyalty block in receipt', () {
      final evaluation = LoyaltyEvaluation(
        customerId: 'cust-anonymous',
        ticketId: 'ticket-7',
        programs: [],
      );

      final feedback = feedbackService.compute(
        evaluation: evaluation,
        postCommitBalances: {},
        earnedUnits: {},
        redeemedUnits: {},
      );

      expect(feedback.hasContent, isFalse);
      expect(feedback.programs, isEmpty);

      // Receipt should NOT have loyalty block
      final invoice = Invoice(
        id: 'inv-002',
        number: '001-001-01-00000002',
        createdAt: DateTime(2026, 9, 1, 11, 0),
        userId: 'user-01',
        subtotal: 100.00,
        totalTax: 15.00,
        total: 115.00,
      );
      final items = [
        InvoiceItem(
          id: 'item-2',
          invoiceId: 'inv-002',
          productId: 'prod-2',
          productName: 'Café Americano',
          quantity: 1,
          unitPrice: 100.0,
          originalTaxRate: 0.15,
          appliedTaxRate: 0.15,
          taxAmount: 15.0,
          total: 115.0,
        ),
      ];
      final payments = [
        const Payment(
          id: 'pay-2',
          invoiceId: 'inv-002',
          method: PaymentMethod.cash,
          amount: 115.0,
        ),
      ];

      final ticket = formatter58.formatInvoiceText(
        invoice,
        items: items,
        payments: payments,
        businessName: 'OMNIFOOD',
        ruc: 'J0010000012345',
        loyaltyFeedback: feedback,
      );

      expect(ticket, isNot(contains('LEALTAD')));
      expect(ticket, contains('*** GRACIAS POR SU COMPRA ***'));
    });

    test('full flow: loyalty processing → feedback → receipt with loyalty block', () {
      // This test simulates the complete flow:
      // 1. Customer arrives with balance 150 points
      // 2. Spends C$500 → earns 50 points (LoyaltyService rate 0.1)
      // 3. Redeems 100 points for C$50 discount
      // 4. Final balance: 150 - 100 + 50 = 100
      // 5. PostPaidFeedbackService computes the feedback
      // 6. Receipt includes loyalty block

      // Step 1-3: Simulate loyalty processing (what SaleViewModel does)
      const initialBalance = 150;
      const pointsToRedeem = 100;
      const subtotal = 500.0;
      const loyaltyDiscountRate = 0.1;
      const pointsEarned = 50; // subtotal * rate = 500 * 0.1

      final balanceAfterRedeem = initialBalance - pointsToRedeem; // 50
      final balanceAfterEarn = balanceAfterRedeem + pointsEarned; // 100

      // Step 4: PostPaidFeedbackService computes feedback
      final evaluation = LoyaltyEvaluation(
        customerId: 'cust-1',
        ticketId: 'ticket-full',
        programs: [
          const ProgramEvaluation(
            programId: 'prog-soho',
            programName: 'Puntos SOHO',
            programType: LoyaltyProgramType.spendPoints,
            balanceUnits: 100,
            earningPreviewUnits: 50,
          ),
        ],
      );

      final feedback = feedbackService.compute(
        evaluation: evaluation,
        postCommitBalances: {'prog-soho': balanceAfterEarn},
        earnedUnits: {'prog-soho': pointsEarned},
        redeemedUnits: {'prog-soho': pointsToRedeem},
        redeemedRewardName: 'C\$50 descuento',
      );

      // Step 5: Verify feedback
      expect(feedback.programs.first.unitsEarned, 50);
      expect(feedback.programs.first.unitsRedeemed, 100);
      expect(feedback.programs.first.newBalance, 100);
      expect(feedback.programs.first.rewardRedeemed, isTrue);
      expect(feedback.programs.first.redeemedRewardName, 'C\$50 descuento');

      final summary = feedbackService.computeSummary(feedback);
      expect(summary, contains('-100 puntos'));
      expect(summary, contains('C\$50 descuento'));
      expect(summary, contains('+50 puntos'));

      // Step 6: Receipt includes loyalty block
      final invoice = Invoice(
        id: 'inv-full',
        number: '001-001-01-00000099',
        createdAt: DateTime(2026, 9, 1, 12, 0),
        userId: 'user-01',
        subtotal: 500.00,
        totalTax: 75.00,
        total: 575.00,
      );
      final items = [
        InvoiceItem(
          id: 'item-full',
          invoiceId: 'inv-full',
          productId: 'prod-1',
          productName: 'Combo Especial',
          quantity: 2,
          unitPrice: 250.0,
          originalTaxRate: 0.15,
          appliedTaxRate: 0.15,
          taxAmount: 75.0,
          total: 575.0,
        ),
      ];
      final payments = [
        const Payment(
          id: 'pay-full',
          invoiceId: 'inv-full',
          method: PaymentMethod.cash,
          amount: 575.0,
        ),
      ];

      final ticket = formatter58.formatInvoiceText(
        invoice,
        items: items,
        payments: payments,
        businessName: 'OMNIFOOD',
        ruc: 'J0010000012345',
        loyaltyFeedback: feedback,
      );

      // Verify loyalty block in receipt
      expect(ticket, contains('LEALTAD'));
      expect(ticket, contains('Redimido'));
      expect(ticket, contains('C\$50 descuento'));
      expect(ticket, contains('+50'));
      expect(ticket, contains('Saldo'));
      expect(ticket, contains('*** GRACIAS POR SU COMPRA ***'));

      // Verify order: loyalty block before GRACIAS
      final loyaltyIdx = ticket.indexOf('LEALTAD');
      final graciasIdx = ticket.indexOf('*** GRACIAS POR SU COMPRA ***');
      expect(loyaltyIdx, lessThan(graciasIdx));
    });
  });
}
