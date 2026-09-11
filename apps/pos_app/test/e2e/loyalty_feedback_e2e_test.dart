import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/adapters/printer/mock_printer_adapter.dart';
import 'package:pos_app/domain/models/config/tax_regime.dart';
import 'package:pos_app/domain/models/loyalty/loyalty_evaluation.dart';
import 'package:pos_app/domain/models/loyalty/loyalty_program.dart';
import 'package:pos_app/domain/models/loyalty/reward_definition.dart';
import 'package:pos_app/domain/models/sales/invoice.dart';
import 'package:pos_app/domain/models/sales/invoice_item.dart';
import 'package:pos_app/domain/models/sales/payment.dart';
import 'package:pos_app/domain/services/sales/post_paid_feedback_service.dart';

/// E2E test: PostPaidFeedbackService → ReceiptLayoutFormatter → MockPrinterAdapter
/// Verifies the complete chain from loyalty processing to printed receipt.
void main() {
  group('E2E — Loyalty feedback to printed receipt', () {
    late MockPrinterAdapter printer;
    late PostPaidFeedbackService feedbackService;

    setUp(() {
      printer = MockPrinterAdapter();
      feedbackService = const PostPaidFeedbackService();
    });

    test('SPEND_POINTS: complete flow from earning to printed receipt', () async {
      // 1. Simulate loyalty processing: customer earned 50 points, balance now 200
      final evaluation = LoyaltyEvaluation(
        customerId: 'cust-001',
        ticketId: 'ticket-001',
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

      // 2. Compute feedback
      final feedback = feedbackService.compute(
        evaluation: evaluation,
        postCommitBalances: {'prog-soho': 200},
        earnedUnits: {'prog-soho': 50},
        redeemedUnits: {'prog-soho': 0},
      );

      expect(feedback.hasContent, isTrue);

      // 3. Print receipt with loyalty feedback
      final invoice = Invoice(
        id: 'inv-e2e-001',
        number: '001-001-01-00000001',
        createdAt: DateTime(2026, 9, 1, 14, 30),
        userId: 'user-01',
        subtotal: 500.00,
        totalTax: 75.00,
        total: 575.00,
      );
      final items = [
        InvoiceItem(
          id: 'item-e2e-1',
          invoiceId: 'inv-e2e-001',
          productId: 'prod-1',
          productName: 'Combo Deluxe',
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
          id: 'pay-e2e-1',
          invoiceId: 'inv-e2e-001',
          method: PaymentMethod.cash,
          amount: 575.0,
        ),
      ];

      final result = await printer.printInvoice(
        invoice,
        items: items,
        payments: payments,
        businessName: 'OMNIFOOD NI',
        ruc: 'J0010000012345',
        taxRegime: TaxRegime.regimenGeneral,
        loyaltyFeedback: feedback,
      );

      // 4. Verify printer received and printed successfully
      expect(result.isSuccess, isTrue);
      expect(result.printedText, isNotNull);

      // 5. Verify printed text contains loyalty block
      final printedText = result.printedText!;
      expect(printedText, contains('LEALTAD'));
      expect(printedText, contains('+50'));
      expect(printedText, contains('200'));
      expect(printedText, contains('*** GRACIAS POR SU COMPRA ***'));

      // 6. Verify loyalty block appears before GRACIAS
      final loyaltyIdx = printedText.indexOf('LEALTAD');
      final graciasIdx = printedText.indexOf('*** GRACIAS POR SU COMPRA ***');
      expect(loyaltyIdx, lessThan(graciasIdx));
    });

    test(
      'PRODUCT_STAMPS: complete flow from stamp earning to printed receipt',
      () async {
        // 1. Simulate: customer earned 2 stamps, now has 8/10
        final evaluation = LoyaltyEvaluation(
          customerId: 'cust-002',
          ticketId: 'ticket-002',
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

        // 2. Compute feedback
        final feedback = feedbackService.compute(
          evaluation: evaluation,
          postCommitBalances: {'prog-smash': 8},
          earnedUnits: {'prog-smash': 2},
          redeemedUnits: {'prog-smash': 0},
        );

        // 3. Print receipt
        final invoice = Invoice(
          id: 'inv-e2e-002',
          number: '001-001-01-00000002',
          createdAt: DateTime(2026, 9, 1, 15, 0),
          userId: 'user-01',
          subtotal: 250.00,
          totalTax: 37.50,
          total: 287.50,
        );
        final items = [
          InvoiceItem(
            id: 'item-e2e-2',
            invoiceId: 'inv-e2e-002',
            productId: 'prod-2',
            productName: 'Smash Burger',
            quantity: 1,
            unitPrice: 250.0,
            originalTaxRate: 0.15,
            appliedTaxRate: 0.15,
            taxAmount: 37.5,
            total: 287.5,
          ),
        ];
        final payments = [
          const Payment(
            id: 'pay-e2e-2',
            invoiceId: 'inv-e2e-002',
            method: PaymentMethod.cash,
            amount: 287.50,
          ),
        ];

        final result = await printer.printInvoice(
          invoice,
          items: items,
          payments: payments,
          businessName: 'OMNIFOOD NI',
          ruc: 'J0010000012345',
          taxRegime: TaxRegime.regimenGeneral,
          loyaltyFeedback: feedback,
        );

        expect(result.isSuccess, isTrue);
        final printedText = result.printedText!;
        expect(printedText, contains('LEALTAD'));
        expect(printedText, contains('+2'));
      },
    );

    test('redemption + earning: complete flow with points redeemed', () async {
      // 1. Simulate: customer redeemed 100 points, earned 25 new, balance 75
      final evaluation = LoyaltyEvaluation(
        customerId: 'cust-001',
        ticketId: 'ticket-003',
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

      // 2. Compute feedback with redemption
      final feedback = feedbackService.compute(
        evaluation: evaluation,
        postCommitBalances: {'prog-soho': 75},
        earnedUnits: {'prog-soho': 25},
        redeemedUnits: {'prog-soho': 100},
        redeemedRewardName: 'C\$50 descuento',
      );

      expect(feedback.programs.first.rewardRedeemed, isTrue);
      expect(feedback.programs.first.redeemedRewardName, 'C\$50 descuento');

      // 3. Print receipt
      final invoice = Invoice(
        id: 'inv-e2e-003',
        number: '001-001-01-00000003',
        createdAt: DateTime(2026, 9, 1, 15, 30),
        userId: 'user-01',
        subtotal: 300.00,
        totalTax: 45.00,
        total: 345.00,
      );
      final items = [
        InvoiceItem(
          id: 'item-e2e-3',
          invoiceId: 'inv-e2e-003',
          productId: 'prod-3',
          productName: 'Combo Familiar',
          quantity: 1,
          unitPrice: 300.0,
          originalTaxRate: 0.15,
          appliedTaxRate: 0.15,
          taxAmount: 45.0,
          total: 345.0,
        ),
      ];
      final payments = [
        const Payment(
          id: 'pay-e2e-3',
          invoiceId: 'inv-e2e-003',
          method: PaymentMethod.cash,
          amount: 345.0,
        ),
      ];

      final result = await printer.printInvoice(
        invoice,
        items: items,
        payments: payments,
        businessName: 'OMNIFOOD NI',
        ruc: 'J0010000012345',
        taxRegime: TaxRegime.regimenGeneral,
        loyaltyFeedback: feedback,
      );

      expect(result.isSuccess, isTrue);
      final printedText = result.printedText!;
      expect(printedText, contains('LEALTAD'));
      expect(printedText, contains('Redimido'));
      expect(printedText, contains('C\$50 descuento'));
      expect(printedText, contains('+25'));
      expect(printedText, contains('75'));
    });

    test(
      'reward available: complete flow when balance reaches reward cost',
      () async {
        // 1. Simulate: customer reached 10 stamps, reward available
        final evaluation = LoyaltyEvaluation(
          customerId: 'cust-002',
          ticketId: 'ticket-004',
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

        // 2. Compute feedback
        final feedback = feedbackService.compute(
          evaluation: evaluation,
          postCommitBalances: {'prog-smash': 10},
          earnedUnits: {'prog-smash': 2},
          redeemedUnits: {'prog-smash': 0},
        );

        expect(feedback.programs.first.rewardAvailable, isTrue);

        // 3. Print receipt
        final invoice = Invoice(
          id: 'inv-e2e-004',
          number: '001-001-01-00000004',
          createdAt: DateTime(2026, 9, 1, 16, 0),
          userId: 'user-01',
          subtotal: 150.00,
          totalTax: 22.50,
          total: 172.50,
        );
        final items = [
          InvoiceItem(
            id: 'item-e2e-4',
            invoiceId: 'inv-e2e-004',
            productId: 'prod-4',
            productName: 'Papas Fritas',
            quantity: 3,
            unitPrice: 50.0,
            originalTaxRate: 0.15,
            appliedTaxRate: 0.15,
            taxAmount: 22.5,
            total: 172.5,
          ),
        ];
        final payments = [
          const Payment(
            id: 'pay-e2e-4',
            invoiceId: 'inv-e2e-004',
            method: PaymentMethod.cash,
            amount: 172.50,
          ),
        ];

        final result = await printer.printInvoice(
          invoice,
          items: items,
          payments: payments,
          businessName: 'OMNIFOOD NI',
          ruc: 'J0010000012345',
          taxRegime: TaxRegime.regimenGeneral,
          loyaltyFeedback: feedback,
        );

        expect(result.isSuccess, isTrue);
        final printedText = result.printedText!;
        expect(printedText, contains('LEALTAD'));
        expect(printedText, contains('Recompensa'));
        expect(printedText, contains('Smash Burger Gratis'));
      },
    );

    test('no loyalty: receipt prints normally without loyalty block', () async {
      // 1. No customer selected → empty feedback
      final evaluation = LoyaltyEvaluation(
        customerId: 'cust-anonymous',
        ticketId: 'ticket-005',
        programs: [],
      );

      final feedback = feedbackService.compute(
        evaluation: evaluation,
        postCommitBalances: {},
        earnedUnits: {},
        redeemedUnits: {},
      );

      expect(feedback.hasContent, isFalse);

      // 2. Print receipt without loyalty feedback
      final invoice = Invoice(
        id: 'inv-e2e-005',
        number: '001-001-01-00000005',
        createdAt: DateTime(2026, 9, 1, 16, 30),
        userId: 'user-01',
        subtotal: 100.00,
        totalTax: 15.00,
        total: 115.00,
      );
      final items = [
        InvoiceItem(
          id: 'item-e2e-5',
          invoiceId: 'inv-e2e-005',
          productId: 'prod-5',
          productName: 'Agua Botella',
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
          id: 'pay-e2e-5',
          invoiceId: 'inv-e2e-005',
          method: PaymentMethod.cash,
          amount: 115.0,
        ),
      ];

      final result = await printer.printInvoice(
        invoice,
        items: items,
        payments: payments,
        businessName: 'OMNIFOOD NI',
        ruc: 'J0010000012345',
        taxRegime: TaxRegime.regimenGeneral,
        loyaltyFeedback: feedback,
      );

      expect(result.isSuccess, isTrue);
      final printedText = result.printedText!;
      expect(printedText, isNot(contains('LEALTAD')));
      expect(printedText, contains('*** GRACIAS POR SU COMPRA ***'));
    });

    test('multi-program: two loyalty programs in same sale', () async {
      // 1. Customer earns points AND stamps in same transaction
      final evaluation = LoyaltyEvaluation(
        customerId: 'cust-001',
        ticketId: 'ticket-006',
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

      // 2. Print receipt
      final invoice = Invoice(
        id: 'inv-e2e-006',
        number: '001-001-01-00000006',
        createdAt: DateTime(2026, 9, 1, 17, 0),
        userId: 'user-01',
        subtotal: 500.00,
        totalTax: 75.00,
        total: 575.00,
      );
      final items = [
        InvoiceItem(
          id: 'item-e2e-6',
          invoiceId: 'inv-e2e-006',
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
          id: 'pay-e2e-6',
          invoiceId: 'inv-e2e-006',
          method: PaymentMethod.cash,
          amount: 575.0,
        ),
      ];

      final result = await printer.printInvoice(
        invoice,
        items: items,
        payments: payments,
        businessName: 'OMNIFOOD NI',
        ruc: 'J0010000012345',
        taxRegime: TaxRegime.regimenGeneral,
        loyaltyFeedback: feedback,
      );

      expect(result.isSuccess, isTrue);
      final printedText = result.printedText!;
      expect(printedText, contains('LEALTAD'));
      expect(printedText, contains('+50'));
      expect(printedText, contains('+2'));
    });
  });
}
