import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/services/config/discount_policy_service.dart';

/// SOHO-P3 S1b: pure enforcement rules for the owner-configured manual
/// discount cap. Canonical rejection rule (mirrored verbatim from the
/// backend fiscal-config contract): a manual discount is ALLOWED only when
/// the resulting accumulated manual discount is less than or equal to EVERY
/// configured cap — `amount <= maxDiscountAmount` AND
/// `amount <= (maxDiscountPercent / 100) x gross subtotal`. Equivalently the
/// effective cap is the MINIMUM of the configured caps; a cap of 0 forbids
/// ANY manual discount; when both are null the discount is NOT limited.
void main() {
  const service = DiscountPolicyService();

  group('DiscountPolicyService (SOHO-P3 S1b manual discount cap)', () {
    test('no caps configured: any manual discount is allowed', () {
      final decision = service.evaluateManualDiscount(
        requestedAmount: 100000,
        accumulatedManualDiscount: 0,
        grossSubtotal: 100,
      );

      expect(decision.allowed, isTrue);
      expect(decision.rejectionMessage, isNull);
    });

    test('amount cap allows exactly at the boundary', () {
      final decision = service.evaluateManualDiscount(
        requestedAmount: 500,
        accumulatedManualDiscount: 0,
        grossSubtotal: 1000,
        maxDiscountAmount: 500,
      );

      expect(decision.allowed, isTrue);
    });

    test('amount cap rejects above the boundary and names the bound', () {
      final decision = service.evaluateManualDiscount(
        requestedAmount: 500.01,
        accumulatedManualDiscount: 0,
        grossSubtotal: 1000,
        maxDiscountAmount: 500,
      );

      expect(decision.allowed, isFalse);
      expect(decision.boundByAmount, isTrue);
      expect(decision.effectiveCap, 500.0);
      expect(decision.rejectionMessage, contains('500.00'));
    });

    test('percent cap allows exactly at the boundary', () {
      final decision = service.evaluateManualDiscount(
        requestedAmount: 25,
        accumulatedManualDiscount: 0,
        grossSubtotal: 100,
        maxDiscountPercent: 25,
      );

      expect(decision.allowed, isTrue);
    });

    test('percent cap rejects above the boundary and names the bound', () {
      final decision = service.evaluateManualDiscount(
        requestedAmount: 25.01,
        accumulatedManualDiscount: 0,
        grossSubtotal: 100,
        maxDiscountPercent: 25,
      );

      expect(decision.allowed, isFalse);
      expect(decision.boundByAmount, isFalse);
      expect(decision.effectiveCap, 25.0);
      expect(decision.rejectionMessage, contains('25.00'));
      expect(decision.rejectionMessage, contains('%'));
    });

    test('with BOTH caps configured the stricter one binds', () {
      // Amount cap 40, percent cap 10% of a 100 gross subtotal -> 10. The
      // percent cap is stricter, so 10 passes and 15 (under the amount cap)
      // is rejected BY THE PERCENT CAP.
      final atBoundary = service.evaluateManualDiscount(
        requestedAmount: 10,
        accumulatedManualDiscount: 0,
        grossSubtotal: 100,
        maxDiscountAmount: 40,
        maxDiscountPercent: 10,
      );
      expect(atBoundary.allowed, isTrue);

      final overStricter = service.evaluateManualDiscount(
        requestedAmount: 15,
        accumulatedManualDiscount: 0,
        grossSubtotal: 100,
        maxDiscountAmount: 40,
        maxDiscountPercent: 10,
      );
      expect(overStricter.allowed, isFalse);
      expect(overStricter.boundByAmount, isFalse);
      expect(overStricter.effectiveCap, 10.0);
      expect(overStricter.rejectionMessage, contains('10.00'));
    });

    test('amount cap of 0 forbids ANY positive manual discount', () {
      final decision = service.evaluateManualDiscount(
        requestedAmount: 1,
        accumulatedManualDiscount: 0,
        grossSubtotal: 1000,
        maxDiscountAmount: 0,
      );

      expect(decision.allowed, isFalse);
      expect(decision.boundByAmount, isTrue);
      expect(decision.effectiveCap, 0.0);
      expect(decision.rejectionMessage, contains('0.00'));
    });

    test('DD-3: evaluation uses accumulated + requested, not each request in isolation', () {
      // Cap 30: 20 accumulates fine, then a 15 request is UNDER the cap on
      // its own but 20 + 15 = 35 would exceed it -> rejected.
      final first = service.evaluateManualDiscount(
        requestedAmount: 20,
        accumulatedManualDiscount: 0,
        grossSubtotal: 1000,
        maxDiscountAmount: 30,
      );
      expect(first.allowed, isTrue);

      final second = service.evaluateManualDiscount(
        requestedAmount: 15,
        accumulatedManualDiscount: 20,
        grossSubtotal: 1000,
        maxDiscountAmount: 30,
      );
      expect(second.allowed, isFalse);
      expect(second.effectiveCap, 30.0);

      // A request that lands exactly on the cap is still allowed.
      final exact = service.evaluateManualDiscount(
        requestedAmount: 25,
        accumulatedManualDiscount: 5,
        grossSubtotal: 1000,
        maxDiscountAmount: 30,
      );
      expect(exact.allowed, isTrue);
    });
  });
}
