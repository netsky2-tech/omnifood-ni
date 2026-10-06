import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/models/inventory/product.dart';
import 'package:pos_app/domain/models/sales/cart_item.dart';

void main() {
  Modifier modifier(
    double extraPrice, {
    int quantity = 1,
    String name = 'Extra Shot',
  }) =>
      Modifier(
        id: 'mod-1',
        name: name,
        extraPrice: extraPrice,
        quantity: quantity,
      );

  group('CartItem.modifiersTotal with modifier quantities (T3.3)', () {
    test('line quantity multiplies the per-unit modifier amount and its own quantity', () {
      final item = CartItem(
        productId: 'p-1',
        productName: 'Capuccino',
        // Line of TWO products, each with TWO shots at C$ 15 per shot.
        quantity: 2,
        unitPrice: 50,
        taxRate: 0.15,
        selectedModifiers: [modifier(15, quantity: 2)],
      );

      // (15 per unit × 2 shots) × 2 products = 60.
      expect(item.modifiersTotal, 60.0);
    });

    test('multiple modifiers each contribute their own quantity', () {
      final item = CartItem(
        productId: 'p-1',
        productName: 'Capuccino',
        quantity: 1,
        unitPrice: 50,
        taxRate: 0.15,
        selectedModifiers: [
          modifier(15, quantity: 2, name: 'Extra Shot'),
          modifier(10, quantity: 1, name: 'Crema'),
        ],
      );

      // 15×2 + 10×1 = 40.
      expect(item.modifiersTotal, 40.0);
    });

    test('a legacy modifier WITHOUT quantity (old persisted payload) totals as before', () {
      // Old persisted payloads carry no quantity key: it must default to 1.
      final legacy = Modifier.fromJson({'id': 'mod-1', 'name': 'Extra Shot', 'extraPrice': 15.0});
      expect(legacy.quantity, 1);

      final item = CartItem(
        productId: 'p-1',
        productName: 'Capuccino',
        quantity: 2,
        unitPrice: 50,
        taxRate: 0.15,
        selectedModifiers: [legacy],
      );

      // Same total the pre-quantity build computed: 15 × 2 products.
      expect(item.modifiersTotal, 30.0);
    });
  });
}
