import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/services/sales/discount_origin_allocator.dart';

/// Focused domain tests for [allocateDiscountOrigins].
///
/// Invariants exercised everywhere:
/// 1. For each line: sum of its origin breakdown == lineDiscounts[i] (in cents).
/// 2. For each origin: sum over lines == its granted order-level total,
///    except the documented truncation case: allocation is strictly
///    sequential and greedy (promotion -> manual -> loyalty), so when
///    promotion + manual + loyalty exceeds the applied capacity the
///    shortfall lands on the LAST origin in that fixed order that still has
///    a granted amount to place (loyalty absorbs only when promotion and
///    manual fit).
/// Deliberately mirrors the implementation's 2-decimal rounding policy
/// (`_round`-style: `((value + 1e-9) * 100).round()` for non-negative
/// values) so "exact cents" assertions do not diverge from what the
/// allocator produces for non-cent multiples (e.g. 1.005 -> 101).
int _centsOf(double value) => ((value + 1e-9) * 100).round();

void _expectLineSumsExact(
  List<double> lineDiscounts,
  List<Map<DiscountOrigin, double>> result,
) {
  expect(result.length, lineDiscounts.length);
  for (var i = 0; i < lineDiscounts.length; i++) {
    var lineSumCents = 0;
    for (final amount in result[i].values) {
      expect(amount, greaterThan(0.0), reason: 'line $i has a non-positive origin amount');
      lineSumCents += _centsOf(amount);
    }
    expect(
      lineSumCents,
      _centsOf(lineDiscounts[i]),
      reason: 'line $i breakdown must sum exactly to its discount in cents',
    );
  }
}

void _expectOriginTotalsExact(
  List<Map<DiscountOrigin, double>> result, {
  double promotionDiscount = 0.0,
  double manualDiscount = 0.0,
  double loyaltyDiscount = 0.0,
}) {
  final granted = <DiscountOrigin, int>{
    DiscountOrigin.promotion: _centsOf(promotionDiscount),
    DiscountOrigin.manual: _centsOf(manualDiscount),
    DiscountOrigin.loyalty: _centsOf(loyaltyDiscount),
  };
  for (final origin in DiscountOrigin.values) {
    var originSumCents = 0;
    for (final line in result) {
      originSumCents += _centsOf(line[origin] ?? 0.0);
    }
    expect(
      originSumCents,
      granted[origin],
      reason: 'origin ${origin.wire} must sum exactly to its granted total in cents',
    );
  }
}

void main() {
  group('DiscountOrigin.wire literals', () {
    test('pins wire values to the DB CHECK keys', () {
      expect(DiscountOrigin.promotion.wire, 'promotion');
      expect(DiscountOrigin.manual.wire, 'manual');
      expect(DiscountOrigin.loyalty.wire, 'loyalty');
    });

    test('exposes exactly the three contract origins', () {
      expect(
        DiscountOrigin.values.map((o) => o.wire).toList(),
        ['promotion', 'manual', 'loyalty'],
      );
    });
  });

  group('T1 single line capacity and spill', () {
    test('promotion below capacity lands proportionally and stays exact', () {
      final result = allocateDiscountOrigins(
        lineGrosses: [10.00, 10.00],
        lineDiscounts: [5.00, 5.00],
        lineProductIds: ['A', 'B'],
        promotionDiscount: 6.00,
        manualDiscount: 4.00,
        loyaltyDiscount: 0.0,
      );

      _expectLineSumsExact([5.00, 5.00], result);
      _expectOriginTotalsExact(result, promotionDiscount: 6.00, manualDiscount: 4.00);
      expect(_centsOf(result[0][DiscountOrigin.promotion]!), 300);
      expect(_centsOf(result[1][DiscountOrigin.promotion]!), 300);
      expect(_centsOf(result[0][DiscountOrigin.manual]!), 200);
      expect(_centsOf(result[1][DiscountOrigin.manual]!), 200);
    });

    test('overflow spills to lines with remaining capacity, per-line sums exact', () {
      // The promotion map gives product A 5.00 on a line whose cap is only
      // 4.00: the excess must spill to line 1 instead of exceeding the cap.
      final result = allocateDiscountOrigins(
        lineGrosses: [4.00, 6.00],
        lineDiscounts: [4.00, 6.00],
        lineProductIds: ['A', 'B'],
        promotionDiscount: 10.00,
        manualDiscount: 0.0,
        loyaltyDiscount: 0.0,
        promotionItemDiscounts: {'A': 5.00, 'B': 5.00},
      );

      _expectLineSumsExact([4.00, 6.00], result);
      _expectOriginTotalsExact(result, promotionDiscount: 10.00);
      expect(_centsOf(result[0][DiscountOrigin.promotion]!), 400);
      expect(_centsOf(result[1][DiscountOrigin.promotion]!), 600);
    });
  });

  group('T2 invariant matrix over unequal grosses and cent-forcing totals', () {
    final cases = <(String, List<double>, List<double>, List<String>, double, double, double)>[
      (
        '1.00 over 3 unequal lines',
        [10.00, 20.00, 70.00],
        [0.10, 0.20, 0.70],
        ['A', 'B', 'C'],
        0.40, 0.30, 0.30,
      ),
      (
        '2.00 over 3 unequal lines',
        [3.33, 3.33, 3.34],
        [0.50, 0.70, 0.80],
        ['A', 'B', 'C'],
        0.80, 0.70, 0.50,
      ),
      (
        '0.01 split over two equal lines',
        [1.00, 1.00],
        [0.01, 0.01],
        ['A', 'B'],
        0.01, 0.01, 0.00,
      ),
      (
        '0.02 split over three lines',
        [1.00, 1.00, 1.00],
        [0.01, 0.00, 0.01],
        ['A', 'B', 'C'],
        0.01, 0.01, 0.00,
      ),
    ];

    for (final (name, grosses, discounts, productIds, promo, manual, loyalty) in cases) {
      test('invariants hold: $name', () {
        final result = allocateDiscountOrigins(
          lineGrosses: grosses,
          lineDiscounts: discounts,
          lineProductIds: productIds,
          promotionDiscount: promo,
          manualDiscount: manual,
          loyaltyDiscount: loyalty,
        );

        _expectLineSumsExact(discounts, result);
        _expectOriginTotalsExact(
          result,
          promotionDiscount: promo,
          manualDiscount: manual,
          loyaltyDiscount: loyalty,
        );
      });
    }
  });

  group('T3 same product on two cart lines', () {
    test('promotion amount splits proportionally to gross between the twin lines', () {
      final result = allocateDiscountOrigins(
        lineGrosses: [4.00, 6.00],
        lineDiscounts: [2.00, 3.00],
        lineProductIds: ['P1', 'P1'],
        promotionDiscount: 2.00,
        manualDiscount: 3.00,
        loyaltyDiscount: 0.0,
        promotionItemDiscounts: {'P1': 2.00},
      );

      _expectLineSumsExact([2.00, 3.00], result);
      _expectOriginTotalsExact(result, promotionDiscount: 2.00, manualDiscount: 3.00);
      // 2.00 split 4:6 by gross => 0.80 / 1.20.
      expect(_centsOf(result[0][DiscountOrigin.promotion]!), 80);
      expect(_centsOf(result[1][DiscountOrigin.promotion]!), 120);
    });

    test('lines of products absent from the promotion map get promotion weight 0', () {
      // Consistent fixture: promotion lands entirely on the P2 line; manual
      // covers the rest by gross, so each line's cap is exactly filled.
      final result = allocateDiscountOrigins(
        lineGrosses: [4.00, 6.00],
        lineDiscounts: [1.20, 3.80],
        lineProductIds: ['P1', 'P2'],
        promotionDiscount: 2.00,
        manualDiscount: 3.00,
        loyaltyDiscount: 0.0,
        promotionItemDiscounts: {'P2': 2.00},
      );

      _expectLineSumsExact([1.20, 3.80], result);
      _expectOriginTotalsExact(result, promotionDiscount: 2.00, manualDiscount: 3.00);
      expect(_centsOf(result[1][DiscountOrigin.promotion]!), 200);
      expect(result[0].containsKey(DiscountOrigin.promotion), isFalse);
    });
  });

  group('T4 zero total weight', () {
    test('all grosses 0 with a granted discount falls back to remaining capacity', () {
      final result = allocateDiscountOrigins(
        lineGrosses: [0.00, 0.00],
        lineDiscounts: [1.00, 1.00],
        lineProductIds: ['A', 'B'],
        promotionDiscount: 2.00,
        manualDiscount: 0.0,
        loyaltyDiscount: 0.0,
      );

      _expectLineSumsExact([1.00, 1.00], result);
      _expectOriginTotalsExact(result, promotionDiscount: 2.00);
      expect(_centsOf(result[0][DiscountOrigin.promotion]!), 100);
      expect(_centsOf(result[1][DiscountOrigin.promotion]!), 100);
    });
  });

  group('T5 truncation (sequential shortfall: loyalty absorbs only when promotion+manual fit)', () {
    test('promotion and manual fit, so loyalty (last origin) places only the remaining capacity', () {
      // Caps total 10.00 but origins grant 12.00: promotion (4.00) and
      // manual (4.00) fit within capacity, so the 2.00 shortfall lands on
      // the LAST origin in the fixed order with a grant to place: loyalty.
      final result = allocateDiscountOrigins(
        lineGrosses: [10.00],
        lineDiscounts: [10.00],
        lineProductIds: ['A'],
        promotionDiscount: 4.00,
        manualDiscount: 4.00,
        loyaltyDiscount: 4.00,
      );

      _expectLineSumsExact([10.00], result);
      expect(_centsOf(result[0][DiscountOrigin.promotion]!), 400);
      expect(_centsOf(result[0][DiscountOrigin.manual]!), 400);
      expect(_centsOf(result[0][DiscountOrigin.loyalty]!), 200);
    });
  });

  group('T6 no discount at all', () {
    test('every line maps to an empty map', () {
      final result = allocateDiscountOrigins(
        lineGrosses: [5.00, 7.00, 2.50],
        lineDiscounts: [0.00, 0.00, 0.00],
        lineProductIds: ['A', 'B', 'C'],
        promotionDiscount: 0.0,
        manualDiscount: 0.0,
        loyaltyDiscount: 0.0,
      );

      expect(result, hasLength(3));
      for (final line in result) {
        expect(line, isEmpty);
      }
    });
  });

  group('T7 no zero or negative origin amounts', () {
    test('a line whose discount is 0 keeps an empty map while others are filled', () {
      final result = allocateDiscountOrigins(
        lineGrosses: [10.00, 10.00, 10.00],
        lineDiscounts: [0.00, 2.00, 1.00],
        lineProductIds: ['A', 'B', 'C'],
        promotionDiscount: 2.00,
        manualDiscount: 1.00,
        loyaltyDiscount: 0.0,
      );

      _expectLineSumsExact([0.00, 2.00, 1.00], result);
      _expectOriginTotalsExact(result, promotionDiscount: 2.00, manualDiscount: 1.00);
      expect(result[0], isEmpty);
      for (final line in result) {
        for (final amount in line.values) {
          expect(amount, greaterThan(0.0));
        }
      }
    });
  });

  group('T8 determinism and key order', () {
    test('two calls with the same inputs return deep-equal results', () {
      List<Map<DiscountOrigin, double>> call() => allocateDiscountOrigins(
            lineGrosses: [4.00, 6.00, 1.00],
            lineDiscounts: [1.50, 2.50, 0.50],
            lineProductIds: ['A', 'B', 'C'],
            promotionDiscount: 1.00,
            manualDiscount: 2.00,
            loyaltyDiscount: 1.50,
          );

      final a = call();
      final b = call();
      expect(a.length, b.length);
      for (var i = 0; i < a.length; i++) {
        expect(a[i].keys.toList(), b[i].keys.toList());
        for (final key in a[i].keys) {
          expect(a[i][key], b[i][key]);
        }
      }
    });

    test('map key order is promotion, manual, loyalty', () {
      final result = allocateDiscountOrigins(
        lineGrosses: [10.00],
        lineDiscounts: [6.00],
        lineProductIds: ['A'],
        promotionDiscount: 2.00,
        manualDiscount: 2.00,
        loyaltyDiscount: 2.00,
      );

      expect(result.single.keys.toList(), [
        DiscountOrigin.promotion,
        DiscountOrigin.manual,
        DiscountOrigin.loyalty,
      ]);
    });
  });

  group('T9 sequential shortfall rule (general truncation)', () {
    test('repro A: promotion fits, manual overflows -> manual absorbs the shortfall, loyalty dropped', () {
      // Caps total 2.00; grants are promotion 1.00 + manual 3.00 + loyalty
      // 1.00. Sequential greedy order promotion -> manual -> loyalty:
      // promotion places its full 1.00, manual places only the 1.00 of
      // remaining capacity, and loyalty is dropped entirely. The shortfall
      // lands on the LAST origin in the fixed order that still has a grant
      // to place — NOT automatically loyalty.
      final result = allocateDiscountOrigins(
        lineGrosses: [10.00],
        lineDiscounts: [2.00],
        lineProductIds: ['A'],
        promotionDiscount: 1.00,
        manualDiscount: 3.00,
        loyaltyDiscount: 1.00,
      );

      // Invariant 1 still holds exactly: the line is filled to its cap.
      _expectLineSumsExact([2.00], result);
      expect(result[0][DiscountOrigin.promotion], 1.0,
          reason:
              'shortfall rule: the first origin in the fixed order keeps its full grant when capacity allows');
      expect(result[0][DiscountOrigin.manual], 1.0,
          reason:
              'shortfall rule: manual absorbs the 2.00 shortfall because capacity runs out during manual (manual keeps 1.00 of its 3.00 grant, loyalty is not the sink here)');
      expect(result[0].containsKey(DiscountOrigin.loyalty), isFalse,
          reason:
              'shortfall rule: loyalty is dropped entirely when capacity is exhausted before loyalty is processed');
    });

    test('repro B: promotion itself overflows -> promotion short, manual and loyalty dropped', () {
      // Caps total 2.00; grants are promotion 3.00 + manual 2.00 + loyalty
      // 1.00. Promotion alone exhausts capacity: it is clamped to 2.00 and
      // both later origins are dropped.
      final result = allocateDiscountOrigins(
        lineGrosses: [10.00],
        lineDiscounts: [2.00],
        lineProductIds: ['A'],
        promotionDiscount: 3.00,
        manualDiscount: 2.00,
        loyaltyDiscount: 1.00,
      );

      // Invariant 1 still holds exactly: the line is filled to its cap.
      _expectLineSumsExact([2.00], result);
      expect(result[0][DiscountOrigin.promotion], 2.0,
          reason:
              'shortfall rule: promotion is clamped to the applied capacity (2.00 of its 3.00 grant) and the shortfall is its own');
      expect(result[0].containsKey(DiscountOrigin.manual), isFalse,
          reason:
              'shortfall rule: manual is dropped entirely when promotion alone exhausts capacity');
      expect(result[0].containsKey(DiscountOrigin.loyalty), isFalse,
          reason:
              'shortfall rule: loyalty is dropped entirely when promotion alone exhausts capacity');
    });
  });

  group('T10 same-product largest-remainder tie-break', () {
    test('equal gross and equal remainder -> the leftover cent goes to the lowest cart index', () {
      // 1.00 across three equal lines of the same product: base share is 33
      // cents each with equal remainders, so the leftover cent is decided
      // purely by the tie-break (remainder desc -> gross desc -> index asc)
      // and lands on index 0: 0.34 / 0.33 / 0.33 by index.
      final result = allocateDiscountOrigins(
        lineGrosses: [1.00, 1.00, 1.00],
        lineDiscounts: [0.34, 0.33, 0.33],
        lineProductIds: ['P', 'P', 'P'],
        promotionDiscount: 1.00,
        manualDiscount: 0.0,
        loyaltyDiscount: 0.0,
        promotionItemDiscounts: {'P': 1.00},
      );

      _expectLineSumsExact([0.34, 0.33, 0.33], result);
      _expectOriginTotalsExact(result, promotionDiscount: 1.00);
      expect(_centsOf(result[0][DiscountOrigin.promotion]!), 34,
          reason:
              'tie-break pin: with equal remainder and equal gross the leftover cent goes to the lowest index');
      expect(_centsOf(result[1][DiscountOrigin.promotion]!), 33,
          reason: 'tie-break pin: line 1 keeps the floored base share of 33 cents');
      expect(_centsOf(result[2][DiscountOrigin.promotion]!), 33,
          reason: 'tie-break pin: line 2 keeps the floored base share of 33 cents');
    });

    test('non-cent promotion amount converts with the epsilon-aware 2-decimal policy', () {
      // 1.005 is not a cent multiple: the implementation's _round policy
      // ((value + 1e-9) * 100).round() reads it as 101 cents (a naive
      // (value * 100).round() would read 100). 101 cents over three equal
      // grosses: base 33 each, leftover 2 -> indices 0 and 1 by tie-break.
      final result = allocateDiscountOrigins(
        lineGrosses: [1.00, 1.00, 1.00],
        lineDiscounts: [0.34, 0.34, 0.33],
        lineProductIds: ['P', 'P', 'P'],
        promotionDiscount: 1.005,
        manualDiscount: 0.0,
        loyaltyDiscount: 0.0,
        promotionItemDiscounts: {'P': 1.005},
      );

      _expectLineSumsExact([0.34, 0.34, 0.33], result);
      _expectOriginTotalsExact(result, promotionDiscount: 1.005);
      expect(_centsOf(result[0][DiscountOrigin.promotion]!), 34,
          reason:
              'epsilon pin: 1.005 converts to 101 cents and the first leftover cent lands on index 0');
      expect(_centsOf(result[1][DiscountOrigin.promotion]!), 34,
          reason:
              'epsilon pin: 1.005 converts to 101 cents and the second leftover cent lands on index 1');
      expect(_centsOf(result[2][DiscountOrigin.promotion]!), 33,
          reason: 'epsilon pin: the last line keeps the floored base share of 33 cents');
    });
  });

  group('T11 promotion map names only a product absent from the cart', () {
    test('every promotion weight is 0 -> falls back to remaining capacity, both invariants hold', () {
      // The map names only 'X', which is not in the cart: every promotion
      // weight is 0, so promotion falls back to the lines' remaining
      // capacity (120 / 380 of 500) -> 0.48 / 1.52. Manual then fills each
      // cap by gross, so both invariants hold exactly.
      final result = allocateDiscountOrigins(
        lineGrosses: [4.00, 6.00],
        lineDiscounts: [1.20, 3.80],
        lineProductIds: ['A', 'B'],
        promotionDiscount: 2.00,
        manualDiscount: 3.00,
        loyaltyDiscount: 0.0,
        promotionItemDiscounts: {'X': 2.00},
      );

      _expectLineSumsExact([1.20, 3.80], result);
      _expectOriginTotalsExact(result, promotionDiscount: 2.00, manualDiscount: 3.00);
      expect(_centsOf(result[0][DiscountOrigin.promotion]!), 48,
          reason:
              'absent-product pin: zero promotion weight falls back to remaining capacity (120 of 500), not gross (would be 80 of 1000)');
      expect(_centsOf(result[1][DiscountOrigin.promotion]!), 152,
          reason:
              'absent-product pin: zero promotion weight falls back to remaining capacity (380 of 500), not gross (would be 120 of 1000)');
      expect(_centsOf(result[0][DiscountOrigin.manual]!), 72,
          reason:
              'absent-product pin: manual fills the remainder of line 0 after the fallback promotion placement');
      expect(_centsOf(result[1][DiscountOrigin.manual]!), 228,
          reason:
              'absent-product pin: manual fills the remainder of line 1 after the fallback promotion placement');
    });
  });
}
