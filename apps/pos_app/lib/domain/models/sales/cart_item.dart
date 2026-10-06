import 'package:freezed_annotation/freezed_annotation.dart';
import '../inventory/product.dart'; // For Modifier

part 'cart_item.freezed.dart';
part 'cart_item.g.dart';

@freezed
class CartItem with _$CartItem {
  const factory CartItem({
    required String productId,
    required String productName,
    required double quantity,
    required double unitPrice,
    required double taxRate,
    String? category,
    /// T0.5c: resolved category identity carried from the product for strict
    /// promotion matching (exact id equality; no case folding).
    String? categoryId,
    String? variantId,
    String? notes,
    @Default([]) List<Modifier> selectedModifiers,
  }) = _CartItem;

  factory CartItem.fromJson(Map<String, dynamic> json) => _$CartItemFromJson(json);
}

extension CartItemX on CartItem {
  /// Base price multiplied by quantity (excluding modifiers).
  double get subtotal => quantity * unitPrice;
  
  /// Total extra price of selected modifiers multiplied by quantity.
  /// Sum of per-unit modifier prices × each modifier's quantity, times the
  /// line quantity. A modifier without quantity (legacy payload) counts as
  /// one unit.
  double get modifiersTotal => selectedModifiers.fold(0.0, (sum, m) => sum + m.extraPrice * m.quantity) * quantity;

  /// Total pre-tax gross amount (subtotal + modifiersTotal).
  double get grossAmount => subtotal + modifiersTotal;
  
  /// Pre-fiscal estimation of tax amount.
  /// Deprecated: CartItem does not have company fiscal regime context.
  /// All tax computations must be performed by [InvoiceFiscalCalculator].
  @Deprecated('Use InvoiceFiscalCalculator. CartItem does not know company TaxRegime.')
  double get taxAmount => (subtotal + modifiersTotal) * taxRate;
  
  /// Pre-fiscal estimation of line total.
  /// Deprecated: CartItem does not have company fiscal regime context.
  /// All final line totals must be resolved via [InvoiceFiscalCalculator] or [grossAmount].
  @Deprecated('Use InvoiceFiscalCalculator or grossAmount. CartItem does not know company TaxRegime.')
  double get total => subtotal + modifiersTotal + taxAmount;
}
