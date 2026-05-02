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
    String? variantId,
    String? notes,
    @Default([]) List<Modifier> selectedModifiers,
  }) = _CartItem;

  factory CartItem.fromJson(Map<String, dynamic> json) => _$CartItemFromJson(json);
}

extension CartItemX on CartItem {
  double get subtotal => quantity * unitPrice;
  
  double get modifiersTotal => selectedModifiers.fold(0.0, (sum, m) => sum + m.extraPrice) * quantity;
  
  double get taxAmount => (subtotal + modifiersTotal) * taxRate;
  
  double get total => subtotal + modifiersTotal + taxAmount;
}
