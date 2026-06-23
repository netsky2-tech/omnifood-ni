/// UOM conversion governance (Batch 1, NFR Decimal 4dp) — POS side.
///
/// SINGLE RULE — documented and tested:
///
///   inventoryBaseQuantity = purchaseQuantity * factorToInventoryBase
///
/// The stock is ALWAYS stored in the insumo's base inventory unit. The factor
/// expresses how many base-inventory units one purchase unit equals.
///
/// Example (lb -> kg):
///   purchaseQuantity = 50 (lb)
///   factorToInventoryBase = 0.453592 (kg per lb)
///   inventoryBaseQuantity = 50 * 0.453592 = 22.6796 kg
///
/// Results are rounded to 4 decimal places (NUMERIC(14,4)) so the inventory
/// source of truth is deterministic and never accumulates float drift.
class UomConversionCalculator {
  const UomConversionCalculator();

  /// Fixed scale for all inventory cost/stock quantities.
  static const int inventoryScale = 4;

  /// Convert a purchase-unit quantity into the base inventory unit.
  ///
  /// [purchaseQuantity] quantity expressed in the purchase UOM.
  /// [factorToInventoryBase] base-inventory units per one purchase unit.
  /// Returns the quantity in the base inventory unit, rounded to 4 decimals.
  double toInventoryBaseQuantity({
    required double purchaseQuantity,
    required double factorToInventoryBase,
  }) {
    if (factorToInventoryBase <= 0) {
      throw ArgumentError.value(
        factorToInventoryBase,
        'factorToInventoryBase',
        'must be > 0 (one purchase unit must equal a positive amount of base inventory unit)',
      );
    }
    return _roundToScale(
      purchaseQuantity * factorToInventoryBase,
      inventoryScale,
    );
  }

  /// Inverse conversion: how many purchase units are needed to deliver a
  /// target base-inventory quantity. Rounded to 4 decimals.
  double fromInventoryBaseQuantity({
    required double inventoryBaseQuantity,
    required double factorToInventoryBase,
  }) {
    if (factorToInventoryBase <= 0) {
      throw ArgumentError.value(
        factorToInventoryBase,
        'factorToInventoryBase',
        'must be > 0',
      );
    }
    return _roundToScale(
      inventoryBaseQuantity / factorToInventoryBase,
      inventoryScale,
    );
  }
}

/// Round half-away-from-zero to a fixed decimal scale (matches NUMERIC(14,4)).
double _roundToScale(double value, int scale) {
  final factor = _pow10(scale);
  final rounded = (value.abs() * factor).roundToDouble() / factor;
  return value < 0 ? -rounded : rounded;
}

double _pow10(int n) {
  var r = 1.0;
  for (var i = 0; i < n; i++) {
    r *= 10;
  }
  return r;
}
