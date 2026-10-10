/// Origin-level discount apportionment for the POS.
///
/// The cloud stores WHY and HOW MUCH a line's discount exists as an optional
/// per-line breakdown `{manual?, promotion?, loyalty?}` (positive numbers only;
/// absent/null = legacy). The POS computes each line's discount from ORDER-level
/// components, so it must split that per-line discount back into origin
/// components. [allocateDiscountOrigins] is that rule, in isolation.
///
/// Technique mirrors `invoice_fiscal_calculator.dart`: integer cents, largest
/// remainder (Hare-Niemeyer) with the tie-break remainder desc -> gross desc ->
/// index asc, per-line caps, and a leftover loop that only increments lines
/// that still have capacity.
library;

/// The three discount origins persisted by the cloud (DB CHECK keys
/// `manual | promotion | loyalty`).
enum DiscountOrigin {
  promotion,
  manual,
  loyalty;

  /// Exact wire literal persisted in the per-line amounts breakdown.
  /// Pinned by test: a rename here must break loudly, not silently.
  String get wire {
    switch (this) {
      case DiscountOrigin.promotion:
        return 'promotion';
      case DiscountOrigin.manual:
        return 'manual';
      case DiscountOrigin.loyalty:
        return 'loyalty';
    }
  }
}

/// Monetary rounding policy shared with `invoice_fiscal_calculator.dart`:
/// standard 2-decimal half-up rounding with an epsilon of 1e-9 to eliminate
/// IEEE-754 binary floating point precision artifacts.
double _round(double value) {
  if (value.isNaN || value.isInfinite) return 0.0;
  const epsilon = 1e-9;
  final adjusted = value + (value >= 0 ? epsilon : -epsilon);
  return ((adjusted * 100.0).roundToDouble()) / 100.0;
}

int _toCents(double value) => (_round(value) * 100.0).round();

/// Deterministic leftover-distribution candidate (largest remainder method).
class _RemainderCandidate {
  final int index;
  final int remainder;
  final int grossCents;

  const _RemainderCandidate({
    required this.index,
    required this.remainder,
    required this.grossCents,
  });
}

/// Splits each line's AUTHORITATIVE discount (already computed by the fiscal
/// path) back into origin components, apportioning the order-level
/// promotion / manual / loyalty totals across lines.
///
/// Preconditions:
/// - `lineGrosses`, `lineDiscounts` and `lineProductIds` must be parallel,
///   equal-length lists (the caller passes the fiscal result lines).
/// - `promotion + manual + loyalty` (in cents) must be >= the sum of the
///   per-line caps for invariant 1 to hold; the real caller satisfies this
///   because the granted totals sum to the applied aggregate. Without that
///   arithmetic precondition, lines cannot be filled to their caps and
///   invariant 1 does NOT hold.
/// - A non-finite (NaN/infinite) or negative grant or discount is read as 0
///   (defensive degradation, not an error).
///
/// Invariants:
/// 1. For each line, the sum of its breakdown equals `lineDiscounts[i]`
///    exactly (in cents) — guaranteed only under the arithmetic
///    precondition above.
/// 2. For each origin, the sum over lines equals its granted order-level
///    total exactly — EXCEPT the documented truncation case. Allocation is
///    strictly sequential and greedy in the fixed order promotion -> manual
///    -> loyalty: each origin places `min(granted, remaining capacity)`.
///    When `promotion + manual + loyalty` exceeds the total applied
///    capacity, the shortfall lands on the LAST origin in that fixed order
///    that still has a granted amount to place, and every origin processed
///    after capacity is exhausted is dropped entirely. Loyalty is the sink
///    ONLY when promotion + manual fit within the applied capacity (the
///    reachable case: sum(grants) >= sum(caps) with promotion + manual
///    within gross). Example: caps 2.00 with promotion 1.00 / manual 3.00 /
///    loyalty 1.00 yields `promotion 1.00, manual 1.00` and loyalty 0.
///
/// Each returned map contains ONLY origins whose allocation is > 0; a line
/// with no discount yields an EMPTY map. Keys are inserted in the fixed order
/// promotion, manual, loyalty so the serialized order is stable.
List<Map<DiscountOrigin, double>> allocateDiscountOrigins({
  required List<double> lineGrosses,
  required List<double> lineDiscounts,
  required List<String> lineProductIds,
  required double promotionDiscount,
  required double manualDiscount,
  required double loyaltyDiscount,
  Map<String, double>? promotionItemDiscounts,
}) {
  final lineCount = lineGrosses.length;

  // 1. Per-line capacity in integer cents.
  final caps = List<int>.filled(lineCount, 0);
  final remaining = List<int>.filled(lineCount, 0);
  for (var i = 0; i < lineCount; i++) {
    final cap = _toCents(lineDiscounts[i]);
    caps[i] = cap > 0 ? cap : 0;
    remaining[i] = caps[i];
  }

  final grossCents = List<int>.filled(lineCount, 0);
  for (var i = 0; i < lineCount; i++) {
    grossCents[i] = _toCents(lineGrosses[i]);
  }

  var totalRemaining = 0;
  for (final r in remaining) {
    totalRemaining += r;
  }

  // Per-origin integer-cent allocations, indexed like the cart.
  final allocations = <DiscountOrigin, List<int>>{
    for (final origin in DiscountOrigin.values) origin: List<int>.filled(lineCount, 0),
  };

  // 2-4. Process origins in the fixed order: promotion, manual, loyalty.
  final grantedTotals = <DiscountOrigin, double>{
    DiscountOrigin.promotion: promotionDiscount,
    DiscountOrigin.manual: manualDiscount,
    DiscountOrigin.loyalty: loyaltyDiscount,
  };

  for (final origin in DiscountOrigin.values) {
    if (totalRemaining <= 0) break;

    final grantedCents = _toCents(grantedTotals[origin]! > 0 ? grantedTotals[origin]! : 0.0);
    if (grantedCents <= 0) continue;

    final placeCents = grantedCents < totalRemaining ? grantedCents : totalRemaining;

    final weights = _weightsForOrigin(
      origin,
      lineCount,
      grossCents,
      lineProductIds,
      promotionItemDiscounts,
      remaining,
    );

    _allocateOrigin(
      allocations[origin]!,
      weights: weights,
      grossCents: grossCents,
      remaining: remaining,
      placeCents: placeCents,
    );

    var placed = 0;
    for (var i = 0; i < lineCount; i++) {
      remaining[i] -= allocations[origin]![i];
      placed += allocations[origin]![i];
    }
    totalRemaining -= placed;
  }

  // 5. Build the per-line maps with ONLY positive origins, in fixed key order.
  final result = List<Map<DiscountOrigin, double>>.generate(
    lineCount,
    (_) => <DiscountOrigin, double>{},
  );
  for (var i = 0; i < lineCount; i++) {
    for (final origin in DiscountOrigin.values) {
      final cents = allocations[origin]![i];
      if (cents > 0) {
        result[i][origin] = _round(cents / 100.0);
      }
    }
  }
  return result;
}

/// Integer-cent weights per line for one origin.
///
/// - promotion: with a non-null/non-empty [promotionItemDiscounts], the weight
///   of a line is its share of its product's promotion amount, distributed
///   across ALL lines sharing that productId proportionally to their gross
///   (largest remainder, tie-break gross desc -> index asc). Lines whose
///   productId is absent from the map get weight 0. Without the map, fall
///   back to line gross.
/// - manual / loyalty: weight = line gross.
/// - If the total weight is 0 (all grosses 0, or the promotion map names
///   only products absent from the cart), fall back to [remaining].
List<int> _weightsForOrigin(
  DiscountOrigin origin,
  int lineCount,
  List<int> grossCents,
  List<String> lineProductIds,
  Map<String, double>? promotionItemDiscounts,
  List<int> remaining,
) {
  List<int>? weights;

  if (origin == DiscountOrigin.promotion &&
      promotionItemDiscounts != null &&
      promotionItemDiscounts.isNotEmpty) {
    weights = List<int>.filled(lineCount, 0);

    // Group line indices by productId, preserving cart order.
    final indicesByProduct = <String, List<int>>{};
    for (var i = 0; i < lineCount; i++) {
      indicesByProduct.putIfAbsent(lineProductIds[i], () => <int>[]).add(i);
    }

    for (final entry in indicesByProduct.entries) {
      final amount = promotionItemDiscounts[entry.key];
      if (amount == null) continue;
      final amountCents = _toCents(amount);
      if (amountCents <= 0) continue;

      final indices = entry.value;
      var productGross = 0;
      for (final i in indices) {
        productGross += grossCents[i];
      }
      if (productGross <= 0) continue;

      // Largest remainder over the product's lines; each line's integer-cent
      // share of this product's promotion amount.
      final shares = List<int>.filled(indices.length, 0);
      final candidates = <_RemainderCandidate>[];
      var allocated = 0;
      for (var j = 0; j < indices.length; j++) {
        final gross = grossCents[indices[j]];
        final exact = amountCents * gross;
        final base = exact ~/ productGross;
        shares[j] = base;
        allocated += base;
        candidates.add(
          _RemainderCandidate(
            index: j,
            remainder: exact - base * productGross,
            grossCents: gross,
          ),
        );
      }

      var leftover = amountCents - allocated;
      if (leftover > 0) {
        candidates.sort((a, b) {
          final remCmp = b.remainder.compareTo(a.remainder);
          if (remCmp != 0) return remCmp;
          final grossCmp = b.grossCents.compareTo(a.grossCents);
          if (grossCmp != 0) return grossCmp;
          return a.index.compareTo(b.index);
        });
        for (final c in candidates) {
          if (leftover <= 0) break;
          shares[c.index] += 1;
          leftover -= 1;
        }
      }

      for (var j = 0; j < indices.length; j++) {
        weights[indices[j]] = shares[j];
      }
    }
  }

  weights ??= List<int>.from(grossCents);

  var totalWeight = 0;
  for (final w in weights) {
    totalWeight += w;
  }

  // Zero total weight (all grosses 0): fall back to remaining capacity.
  if (totalWeight <= 0) {
    weights = List<int>.from(remaining);
  }
  return weights;
}

/// Allocates [placeCents] across lines proportionally to integer [weights],
/// floored with a largest-remainder leftover loop (remainder desc -> gross
/// desc -> index asc), never exceeding [remaining] per line. Pure integer
/// arithmetic: the origin total lands exactly on [placeCents].
void _allocateOrigin(
  List<int> out, {
  required List<int> weights,
  required List<int> grossCents,
  required List<int> remaining,
  required int placeCents,
}) {
  final lineCount = out.length;
  var totalWeight = 0;
  for (final w in weights) {
    totalWeight += w;
  }
  if (totalWeight <= 0 || placeCents <= 0) return;

  final candidates = <_RemainderCandidate>[];
  var allocated = 0;
  for (var i = 0; i < lineCount; i++) {
    final exact = placeCents * weights[i];
    final base = exact ~/ totalWeight;
    final capped = base > remaining[i] ? remaining[i] : base;
    out[i] = capped > 0 ? capped : 0;
    allocated += out[i];
    candidates.add(
      _RemainderCandidate(
        index: i,
        remainder: exact - base * totalWeight,
        grossCents: grossCents[i],
      ),
    );
  }

  var leftover = placeCents - allocated;
  if (leftover <= 0) return;

  candidates.sort((a, b) {
    final remCmp = b.remainder.compareTo(a.remainder);
    if (remCmp != 0) return remCmp;
    final grossCmp = b.grossCents.compareTo(a.grossCents);
    if (grossCmp != 0) return grossCmp;
    return a.index.compareTo(b.index);
  });

  // One cent at a time, skipping lines with no remaining capacity.
  while (leftover > 0) {
    var progressed = false;
    for (final c in candidates) {
      if (leftover <= 0) break;
      if (out[c.index] < remaining[c.index]) {
        out[c.index] += 1;
        leftover -= 1;
        progressed = true;
      }
    }
    if (!progressed) break; // unreachable: placeCents <= sum(remaining)
  }
}
