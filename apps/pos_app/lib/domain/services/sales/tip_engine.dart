import 'package:freezed_annotation/freezed_annotation.dart';

part 'tip_engine.freezed.dart';
part 'tip_engine.g.dart';

/// Supported types of voluntary tips in OmniFood NI POS.
enum TipType {
  @JsonValue('SUGGESTED_10_PERCENT')
  suggestedTenPercent,

  @JsonValue('CUSTOM_PERCENTAGE')
  customPercentage,

  @JsonValue('FIXED_AMOUNT_NIO')
  fixedAmountNio,

  @JsonValue('FIXED_AMOUNT_USD')
  fixedAmountUsd,

  @JsonValue('NONE')
  none;

  bool get isSuggestedTenPercent => this == TipType.suggestedTenPercent;
  bool get isCustomPercentage => this == TipType.customPercentage;
  bool get isFixedAmountNio => this == TipType.fixedAmountNio;
  bool get isFixedAmountUsd => this == TipType.fixedAmountUsd;
  bool get isNone => this == TipType.none;
}

@freezed
class TipCalculation with _$TipCalculation {
  const TipCalculation._();

  const factory TipCalculation({
    required TipType tipType,
    required double tipAmountNio,
    required double tipAmountUsd,
    required double effectivePercentage,
    required double subtotalNio,
    required double taxNio,
    required double discountNio,
    required double totalWithTipNio,
    required double totalWithTipUsd,
    required double commercialRate,
  }) = _TipCalculation;

  factory TipCalculation.fromJson(Map<String, dynamic> json) =>
      _$TipCalculationFromJson(json);
}

/// Domain engine for computing voluntary non-taxable tips under Nicaraguan DGI regulations.
class TipEngine {
  TipEngine._();

  /// Calculates the tip and final totals while preserving the DGI Non-Taxable Invariant (INV-16.1).
  ///
  /// The tip is calculated based on the net subtotal (`subtotalNio - discountNio`).
  /// Tax (IVA 15%) is strictly computed on the taxable base only and is NOT applied to the tip.
  static TipCalculation calculate({
    required double subtotalNio,
    required double taxNio,
    required double discountNio,
    required TipType tipType,
    double customPercentage = 0.0,
    double fixedAmount = 0.0,
    required double commercialRate,
  }) {
    final netSubtotal = (subtotalNio - discountNio) > 0 ? (subtotalNio - discountNio) : 0.0;
    final rate = commercialRate > 0 ? commercialRate : 36.50;

    double calculatedTipNio = 0.0;
    double effectivePct = 0.0;

    switch (tipType) {
      case TipType.suggestedTenPercent:
        if (netSubtotal > 0) {
          calculatedTipNio = netSubtotal * 0.10;
          effectivePct = 10.0;
        }
        break;

      case TipType.customPercentage:
        if (netSubtotal > 0 && customPercentage > 0) {
          final clampedPct = customPercentage.clamp(0.0, 100.0);
          calculatedTipNio = netSubtotal * (clampedPct / 100.0);
          effectivePct = clampedPct;
        }
        break;

      case TipType.fixedAmountNio:
        if (fixedAmount > 0) {
          calculatedTipNio = fixedAmount;
          effectivePct = netSubtotal > 0 ? (calculatedTipNio / netSubtotal) * 100.0 : 0.0;
        }
        break;

      case TipType.fixedAmountUsd:
        if (fixedAmount > 0) {
          calculatedTipNio = fixedAmount * rate;
          effectivePct = netSubtotal > 0 ? (calculatedTipNio / netSubtotal) * 100.0 : 0.0;
        }
        break;

      case TipType.none:
        calculatedTipNio = 0.0;
        effectivePct = 0.0;
        break;
    }

    // Round tip to 2 decimals
    calculatedTipNio = double.parse(calculatedTipNio.toStringAsFixed(2));
    final calculatedTipUsd = double.parse((calculatedTipNio / rate).toStringAsFixed(2));

    final totalNio = double.parse((netSubtotal + taxNio + calculatedTipNio).toStringAsFixed(2));
    final totalUsd = double.parse((totalNio / rate).toStringAsFixed(2));

    return TipCalculation(
      tipType: tipType,
      tipAmountNio: calculatedTipNio,
      tipAmountUsd: calculatedTipUsd,
      effectivePercentage: double.parse(effectivePct.toStringAsFixed(2)),
      subtotalNio: subtotalNio,
      taxNio: taxNio,
      discountNio: discountNio,
      totalWithTipNio: totalNio,
      totalWithTipUsd: totalUsd,
      commercialRate: rate,
    );
  }
}
