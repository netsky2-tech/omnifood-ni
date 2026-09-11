import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/models/config/tax_regime.dart';
import 'package:pos_app/domain/models/loyalty/loyalty_program.dart';
import 'package:pos_app/domain/models/sales/invoice.dart';
import 'package:pos_app/domain/models/sales/invoice_item.dart';
import 'package:pos_app/domain/models/sales/payment.dart';
import 'package:pos_app/domain/services/printer/receipt_layout_formatter.dart';
import 'package:pos_app/domain/services/sales/post_paid_feedback_service.dart';

void main() {
  group('formatInvoiceText — loyalty block integration', () {
    late ReceiptLayoutFormatter f58;
    late ReceiptLayoutFormatter f80;
    late Invoice testInvoice;
    late List<InvoiceItem> testItems;
    late List<Payment> testPayments;

    setUp(() {
      f58 = ReceiptLayoutFormatter.format58mm();
      f80 = ReceiptLayoutFormatter.format80mm();
      testInvoice = Invoice(
        id: 'inv-001',
        number: '001-001-01-00000001',
        createdAt: DateTime(2026, 9, 1, 10, 30),
        userId: 'user-01',
        subtotal: 250.00,
        totalTax: 37.50,
        total: 287.50,
      );
      testItems = [
        InvoiceItem(
          id: 'item-1',
          invoiceId: 'inv-001',
          productId: 'prod-1',
          productName: 'Smash Burger',
          quantity: 2,
          unitPrice: 125.0,
          originalTaxRate: 0.15,
          appliedTaxRate: 0.15,
          taxAmount: 37.50,
          total: 287.50,
        ),
      ];
      testPayments = [
        const Payment(
          id: 'pay-1',
          invoiceId: 'inv-001',
          method: PaymentMethod.cash,
          amount: 287.50,
        ),
      ];
    });

    test('includes loyalty block when loyaltyFeedback is provided (58mm)', () {
      final feedback = PostPaidFeedback(
        programs: [
          ProgramFeedback(
            programId: 'prog-1',
            programName: 'Puntos SOHO',
            programType: LoyaltyProgramType.spendPoints,
            unitsEarned: 25,
            newBalance: 175,
            unitsToNextReward: 25,
          ),
        ],
      );

      final ticket = f58.formatInvoiceText(
        testInvoice,
        items: testItems,
        payments: testPayments,
        businessName: 'OMNIFOOD',
        ruc: 'J0010000012345',
        loyaltyFeedback: feedback,
      );

      expect(ticket, contains('LEALTAD'));
      expect(ticket, contains('Puntos SOHO'));
      expect(ticket, contains('+25'));
      expect(ticket, contains('175'));
      expect(ticket, contains('*** GRACIAS POR SU COMPRA ***'));
    });

    test('includes loyalty block when loyaltyFeedback is provided (80mm)', () {
      final feedback = PostPaidFeedback(
        programs: [
          ProgramFeedback(
            programId: 'prog-1',
            programName: 'Smash Burger Club',
            programType: LoyaltyProgramType.productStamps,
            unitsEarned: 1,
            newBalance: 8,
            unitsToNextReward: 2,
            rewardAvailable: false,
          ),
        ],
      );

      final ticket = f80.formatInvoiceText(
        testInvoice,
        items: testItems,
        payments: testPayments,
        businessName: 'OMNIFOOD',
        ruc: 'J0010000012345',
        loyaltyFeedback: feedback,
      );

      expect(ticket, contains('LEALTAD'));
      expect(ticket, contains('Smash Burger Club'));
      expect(ticket, contains('+1'));
    });

    test('works normally when loyaltyFeedback is null', () {
      final ticket = f58.formatInvoiceText(
        testInvoice,
        items: testItems,
        payments: testPayments,
        businessName: 'OMNIFOOD',
        ruc: 'J0010000012345',
      );

      expect(ticket, isNot(contains('LEALTAD')));
      expect(ticket, contains('*** GRACIAS POR SU COMPRA ***'));
    });

    test('works normally when loyaltyFeedback has no content', () {
      final feedback = PostPaidFeedback(programs: []);

      final ticket = f58.formatInvoiceText(
        testInvoice,
        items: testItems,
        payments: testPayments,
        businessName: 'OMNIFOOD',
        ruc: 'J0010000012345',
        loyaltyFeedback: feedback,
      );

      expect(ticket, isNot(contains('LEALTAD')));
      expect(ticket, contains('*** GRACIAS POR SU COMPRA ***'));
    });

    test('loyalty block appears before GRACIAS line', () {
      final feedback = PostPaidFeedback(
        programs: [
          ProgramFeedback(
            programId: 'prog-1',
            programName: 'Puntos SOHO',
            programType: LoyaltyProgramType.spendPoints,
            unitsEarned: 10,
            newBalance: 50,
          ),
        ],
      );

      final ticket = f58.formatInvoiceText(
        testInvoice,
        items: testItems,
        payments: testPayments,
        businessName: 'OMNIFOOD',
        ruc: 'J0010000012345',
        loyaltyFeedback: feedback,
      );

      final loyaltyIdx = ticket.indexOf('LEALTAD');
      final graciasIdx = ticket.indexOf('*** GRACIAS POR SU COMPRA ***');
      expect(loyaltyIdx, lessThan(graciasIdx));
    });

    test('multiple programs in loyalty block', () {
      final feedback = PostPaidFeedback(
        programs: [
          ProgramFeedback(
            programId: 'prog-1',
            programName: 'Puntos SOHO',
            programType: LoyaltyProgramType.spendPoints,
            unitsEarned: 25,
            newBalance: 175,
            unitsToNextReward: 25,
          ),
          ProgramFeedback(
            programId: 'prog-2',
            programName: 'Smash Burger Club',
            programType: LoyaltyProgramType.productStamps,
            unitsEarned: 2,
            newBalance: 8,
            unitsToNextReward: 2,
          ),
        ],
      );

      final ticket = f58.formatInvoiceText(
        testInvoice,
        items: testItems,
        payments: testPayments,
        businessName: 'OMNIFOOD',
        ruc: 'J0010000012345',
        loyaltyFeedback: feedback,
      );

      expect(ticket, contains('Puntos SOHO'));
      expect(ticket, contains('Smash Burger Club'));
      expect(ticket, contains('+25'));
      expect(ticket, contains('+2'));
    });

    test('reward available shows in loyalty block', () {
      final feedback = PostPaidFeedback(
        programs: [
          ProgramFeedback(
            programId: 'prog-2',
            programName: 'Smash Burger Club',
            programType: LoyaltyProgramType.productStamps,
            unitsEarned: 2,
            newBalance: 10,
            unitsToNextReward: 0,
            rewardAvailable: true,
            rewardName: 'Smash Burger Gratis',
          ),
        ],
      );

      final ticket = f58.formatInvoiceText(
        testInvoice,
        items: testItems,
        payments: testPayments,
        businessName: 'OMNIFOOD',
        ruc: 'J0010000012345',
        loyaltyFeedback: feedback,
      );

      expect(ticket, contains('Recompensa'));
      expect(ticket, contains('Smash Burger Gratis'));
    });

    test('redemption shows in loyalty block', () {
      final feedback = PostPaidFeedback(
        programs: [
          ProgramFeedback(
            programId: 'prog-1',
            programName: 'Puntos SOHO',
            programType: LoyaltyProgramType.spendPoints,
            unitsEarned: 25,
            unitsRedeemed: 100,
            newBalance: 75,
            unitsToNextReward: 25,
            rewardRedeemed: true,
            redeemedRewardName: 'C\$50 descuento',
          ),
        ],
      );

      final ticket = f58.formatInvoiceText(
        testInvoice,
        items: testItems,
        payments: testPayments,
        businessName: 'OMNIFOOD',
        ruc: 'J0010000012345',
        loyaltyFeedback: feedback,
      );

      expect(ticket, contains('Redimido'));
      expect(ticket, contains('C\$50 descuento'));
    });
  });

  group('formatInvoiceEscPos — loyalty block integration', () {
    late ReceiptLayoutFormatter f58;
    late Invoice testInvoice;
    late List<InvoiceItem> testItems;
    late List<Payment> testPayments;

    setUp(() {
      f58 = ReceiptLayoutFormatter.format58mm();
      testInvoice = Invoice(
        id: 'inv-002',
        number: '001-001-01-00000002',
        createdAt: DateTime(2026, 9, 1, 11, 0),
        userId: 'user-01',
        subtotal: 150.00,
        totalTax: 22.50,
        total: 172.50,
      );
      testItems = [
        InvoiceItem(
          id: 'item-2',
          invoiceId: 'inv-002',
          productId: 'prod-2',
          productName: 'Papas Fritas',
          quantity: 3,
          unitPrice: 50.0,
          originalTaxRate: 0.15,
          appliedTaxRate: 0.15,
          taxAmount: 22.50,
          total: 172.50,
        ),
      ];
      testPayments = [
        const Payment(
          id: 'pay-2',
          invoiceId: 'inv-002',
          method: PaymentMethod.cash,
          amount: 172.50,
        ),
      ];
    });

    test('ESC/POS output includes loyalty block when feedback provided', () {
      final feedback = PostPaidFeedback(
        programs: [
          ProgramFeedback(
            programId: 'prog-1',
            programName: 'Puntos SOHO',
            programType: LoyaltyProgramType.spendPoints,
            unitsEarned: 15,
            newBalance: 65,
          ),
        ],
      );

      final escPos = f58.formatInvoiceEscPos(
        testInvoice,
        items: testItems,
        payments: testPayments,
        businessName: 'OMNIFOOD',
        ruc: 'J0010000012345',
        loyaltyFeedback: feedback,
      );

      expect(escPos, isNotEmpty);
    });

    test('ESC/POS works normally when loyaltyFeedback is null', () {
      final escPos = f58.formatInvoiceEscPos(
        testInvoice,
        items: testItems,
        payments: testPayments,
        businessName: 'OMNIFOOD',
        ruc: 'J0010000012345',
      );

      expect(escPos, isNotEmpty);
    });
  });
}
