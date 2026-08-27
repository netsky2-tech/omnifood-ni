import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/models/sales/cart_item.dart';
import 'package:pos_app/domain/models/inventory/product.dart';
import 'package:pos_app/domain/models/sales/promotion.dart';
import 'package:pos_app/domain/services/sales/promotions_engine.dart';

void main() {
  late PromotionsEngine engine;

  final pBeer = const Product(
    id: 'prod-beer',
    name: 'Cerveza Toña',
    uom: 'UND',
    stock: 50,
    averageCost: 30,
    sellPrice: 60,
    category: 'Bebidas',
  );

  final pBurger = const Product(
    id: 'prod-burger',
    name: 'Hamburguesa Doble Carne',
    uom: 'UND',
    stock: 20,
    averageCost: 80,
    sellPrice: 150,
    category: 'Comida',
  );

  final pWings = const Product(
    id: 'prod-wings',
    name: 'Alitas BBQ',
    uom: 'UND',
    stock: 30,
    averageCost: 70,
    sellPrice: 120,
    category: 'Comida',
  );

  CartItem item(Product p, double qty) => CartItem(
        productId: p.id,
        productName: p.name,
        unitPrice: p.sellPrice,
        taxRate: 0.15,
        category: p.category,
        quantity: qty,
      );

  setUp(() {
    engine = const PromotionsEngine();
  });

  group('PromotionsEngine - 2x1 / BuyXGetYFree Triangulation', () {
    final promo2x1 = const Promotion(
      id: 'promo-2x1-beer',
      name: '2x1 en Cerveza Toña',
      type: PromotionType.buyXGetYFree,
      targetProductId: 'prod-beer',
      buyQuantity: 1,
      getQuantity: 1, // Buy 1 Get 1 Free -> each pair gets 1 free (60 C$)
    );

    test('aplica 0 descuento cuando no se alcanza la cantidad mínima', () {
      final cart = [item(pBeer, 1)];
      final result = engine.evaluate(cart: cart, promotions: [promo2x1]);

      expect(result.totalDiscount, equals(0.0));
      expect(result.appliedPromotions, isEmpty);
    });

    test('aplica 1 ítem gratis con 2 unidades en carrito (2x1 exacto)', () {
      final cart = [item(pBeer, 2)];
      final result = engine.evaluate(cart: cart, promotions: [promo2x1]);

      expect(result.totalDiscount, equals(60.0));
      expect(result.appliedPromotions.length, equals(1));
      expect(result.appliedPromotions.first.promotionId, equals('promo-2x1-beer'));
      expect(result.appliedPromotions.first.discountAmount, equals(60.0));
    });

    test('aplica 2 ítems gratis con 5 unidades en carrito (2 pares calificados + 1 sobrante)', () {
      final cart = [item(pBeer, 5)];
      final result = engine.evaluate(cart: cart, promotions: [promo2x1]);

      expect(result.totalDiscount, equals(120.0)); // 2 * 60 C$
    });

    test('triangula promoción 3x2 (Buy 2 Get 1 Free)', () {
      final promo3x2 = const Promotion(
        id: 'promo-3x2-wings',
        name: '3x2 en Alitas BBQ',
        type: PromotionType.buyXGetYFree,
        targetProductId: 'prod-wings',
        buyQuantity: 2,
        getQuantity: 1,
      );

      final cart2 = [item(pWings, 2)];
      expect(engine.evaluate(cart: cart2, promotions: [promo3x2]).totalDiscount, equals(0.0));

      final cart3 = [item(pWings, 3)];
      expect(engine.evaluate(cart: cart3, promotions: [promo3x2]).totalDiscount, equals(120.0));

      final cart7 = [item(pWings, 7)];
      expect(engine.evaluate(cart: cart7, promotions: [promo3x2]).totalDiscount, equals(240.0)); // 2 sets * 120
    });
  });

  group('PromotionsEngine - Percentage Discount Triangulation', () {
    test('aplica porcentaje de descuento en producto específico (20% en Hamburguesas)', () {
      final promo20 = const Promotion(
        id: 'promo-20-burger',
        name: '20% en Hamburguesas',
        type: PromotionType.percentageDiscount,
        targetProductId: 'prod-burger',
        discountValue: 20.0, // 20%
      );

      final cart = [item(pBurger, 2)]; // 2 * 150 = 300 C$
      final result = engine.evaluate(cart: cart, promotions: [promo20]);

      expect(result.totalDiscount, equals(60.0)); // 20% de 300 = 60 C$
    });

    test('aplica porcentaje de descuento por categoría (10% en toda la categoría Bebidas)', () {
      final promoCat = const Promotion(
        id: 'promo-10-drinks',
        name: '10% en Bebidas',
        type: PromotionType.percentageDiscount,
        targetCategoryId: 'Bebidas',
        discountValue: 10.0,
      );

      final cart = [
        item(pBeer, 4), // 4 * 60 = 240 C$ -> 24 C$ desc
        item(pBurger, 1), // 150 C$ (Comida, no califica)
      ];
      final result = engine.evaluate(cart: cart, promotions: [promoCat]);

      expect(result.totalDiscount, equals(24.0));
    });
  });

  group('PromotionsEngine - Fixed Amount Discount Triangulation', () {
    test('aplica descuento fijo en córdobas por producto', () {
      final promoFixed = const Promotion(
        id: 'promo-fixed-30',
        name: 'C\$30 de descuento en Hamburguesa',
        type: PromotionType.fixedDiscount,
        targetProductId: 'prod-burger',
        discountValue: 30.0,
      );

      final cart = [item(pBurger, 2)];
      final result = engine.evaluate(cart: cart, promotions: [promoFixed]);

      expect(result.totalDiscount, equals(60.0)); // 2 * 30 C$
    });

    test('el descuento fijo nunca supera el precio unitario del producto', () {
      final promoOver = const Promotion(
        id: 'promo-fixed-over',
        name: 'C\$100 de descuento en Cerveza',
        type: PromotionType.fixedDiscount,
        targetProductId: 'prod-beer',
        discountValue: 100.0, // Precio es 60
      );

      final cart = [item(pBeer, 1)];
      final result = engine.evaluate(cart: cart, promotions: [promoOver]);

      expect(result.totalDiscount, equals(60.0)); // Tope en 60 C$
    });
  });

  group('PromotionsEngine - Happy Hour & Schedule Triangulation', () {
    final happyHourPromo = const Promotion(
      id: 'promo-happy-hour',
      name: 'Happy Hour Cervezas 2x1',
      type: PromotionType.buyXGetYFree,
      targetProductId: 'prod-beer',
      buyQuantity: 1,
      getQuantity: 1,
      daysOfWeek: [5, 6], // Viernes y Sábado
      startTime: '17:00',
      endTime: '20:00',
    );

    test('aplica promoción dentro del horario y día válido (Viernes 18:30)', () {
      final friday1830 = DateTime(2026, 8, 28, 18, 30); // 2026-08-28 es Viernes (weekday 5)
      final cart = [item(pBeer, 2)];

      final result = engine.evaluate(
        cart: cart,
        promotions: [happyHourPromo],
        currentTime: friday1830,
      );

      expect(result.totalDiscount, equals(60.0));
      expect(result.appliedPromotions, isNotEmpty);
    });

    test('rechaza promoción fuera de la ventana horaria (Viernes 21:05)', () {
      final friday2105 = DateTime(2026, 8, 28, 21, 5);
      final cart = [item(pBeer, 2)];

      final result = engine.evaluate(
        cart: cart,
        promotions: [happyHourPromo],
        currentTime: friday2105,
      );

      expect(result.totalDiscount, equals(0.0));
      expect(result.appliedPromotions, isEmpty);
    });

    test('rechaza promoción en día no configurado (Jueves 18:30)', () {
      final thursday1830 = DateTime(2026, 8, 27, 18, 30); // Jueves (weekday 4)
      final cart = [item(pBeer, 2)];

      final result = engine.evaluate(
        cart: cart,
        promotions: [happyHourPromo],
        currentTime: thursday1830,
      );

      expect(result.totalDiscount, equals(0.0));
    });
  });

  group('PromotionsEngine - Minimum Order Amount & Stacking Rules', () {
    test('requiere monto mínimo de compra antes de aplicar el descuento', () {
      final promoMin = const Promotion(
        id: 'promo-min-order',
        name: '15% en compras mayores a C\$300',
        type: PromotionType.percentageDiscount,
        targetCategoryId: 'Comida',
        discountValue: 15.0,
        minOrderAmount: 300.0,
      );

      // Carrito con 150 C$ (< 300)
      final cartSmall = [item(pBurger, 1)];
      expect(engine.evaluate(cart: cartSmall, promotions: [promoMin]).totalDiscount, equals(0.0));

      // Carrito con 420 C$ (>= 300)
      final cartLarge = [
        item(pBurger, 2), // 300
        item(pWings, 1),  // 120
      ];
      final res = engine.evaluate(cart: cartLarge, promotions: [promoMin]);
      expect(res.totalDiscount, equals(63.0)); // 15% de 420 = 63.0 C$
    });

    test('promociones inactivas son ignoradas', () {
      final promoDisabled = const Promotion(
        id: 'promo-disabled',
        name: 'Inactiva',
        type: PromotionType.percentageDiscount,
        targetProductId: 'prod-burger',
        discountValue: 50.0,
        isActive: false,
      );

      final cart = [item(pBurger, 2)];
      expect(engine.evaluate(cart: cart, promotions: [promoDisabled]).totalDiscount, equals(0.0));
    });
  });

  group('PromotionsEngine - DGI Fiscal Impact Calculation', () {
    test('calcula correctamente subtotal bruto, descuentos, subtotal neto e IVA 15%', () {
      final promo = const Promotion(
        id: 'promo-20-burger',
        name: '20% Descuento',
        type: PromotionType.percentageDiscount,
        targetProductId: 'prod-burger',
        discountValue: 20.0,
      );

      final cart = [
        item(pBurger, 2), // Bruto: 300 C$, Descuento: 60 C$ -> Neto: 240 C$
        item(pBeer, 1),   // Bruto: 60 C$, Descuento: 0 -> Neto: 60 C$
      ];

      final evaluation = engine.evaluate(cart: cart, promotions: [promo]);

      final grossSubtotal = cart.fold(0.0, (sum, i) => sum + (i.unitPrice * i.quantity)); // 360 C$
      final totalDiscount = evaluation.totalDiscount; // 60 C$
      final netSubtotal = grossSubtotal - totalDiscount; // 300 C$
      final vatAmount = netSubtotal * 0.15; // 45 C$
      final totalInvoice = netSubtotal + vatAmount; // 345 C$

      expect(grossSubtotal, equals(360.0));
      expect(totalDiscount, equals(60.0));
      expect(netSubtotal, equals(300.0));
      expect(vatAmount, equals(45.0));
      expect(totalInvoice, equals(345.0));
    });
  });
}
