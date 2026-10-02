import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/ui/features/sales/widgets/product_card_thumbnail.dart';

void main() {
  group('ProductVisualResolver — Standard §12.6 Eliminación del Síndrome de la Hamburguesa', () {
    test('resolves hot coffee drinks to coffee icon', () {
      final visual1 = ProductVisualResolver.resolve(
        category: 'Bebidas Calientes',
        productName: 'Café Americano',
      );
      expect(visual1.icon, equals(Icons.local_cafe_outlined));
      expect(visual1.monogram, isNull);

      final visual2 = ProductVisualResolver.resolve(
        category: 'Cafetería',
        productName: 'Cappuccino Artesanal',
      );
      expect(visual2.icon, equals(Icons.local_cafe_outlined));
    });

    test('resolves cold drinks to cold drink / glass icon', () {
      final visual = ProductVisualResolver.resolve(
        category: 'Bebidas Frías',
        productName: 'Jugo Natural de Pitahaya',
      );
      expect(visual.icon, equals(Icons.local_drink_outlined));
      expect(visual.monogram, isNull);
    });

    test('resolves bakery and desserts to bakery icon', () {
      final visual1 = ProductVisualResolver.resolve(
        category: 'Repostería',
        productName: 'Croissant Almendras',
      );
      expect(visual1.icon, equals(Icons.bakery_dining_outlined));

      final visual2 = ProductVisualResolver.resolve(
        category: 'Postres',
        productName: 'Pastel Tres Leches Artesanal',
      );
      expect(visual2.icon, equals(Icons.bakery_dining_outlined));
    });

    test('resolves prepared meals and breakfasts to dining icon', () {
      final visual1 = ProductVisualResolver.resolve(
        category: 'Comidas',
        productName: 'Quesillo Doble Especial',
      );
      expect(visual1.icon, equals(Icons.restaurant_outlined));

      final visual2 = ProductVisualResolver.resolve(
        category: 'Desayunos',
        productName: 'Desayuno Típico Nica',
      );
      expect(visual2.icon, equals(Icons.restaurant_outlined));
    });

    test('resolves burgers to burger icon ONLY when category or name specifies burger', () {
      final visual = ProductVisualResolver.resolve(
        category: 'Hamburguesas',
        productName: 'Burger Clásica',
      );
      expect(visual.icon, equals(Icons.lunch_dining_outlined));
    });

    test('falls back to level 2 typographic monogram when category has no glyph', () {
      final visual1 = ProductVisualResolver.resolve(
        category: 'Misceláneos',
        productName: 'Espresso Doble',
      );
      expect(visual1.icon, isNull);
      expect(visual1.monogram, equals('ED'));

      final visual2 = ProductVisualResolver.resolve(
        category: null,
        productName: 'Cappuccino 12oz',
      );
      expect(visual2.icon, isNull);
      expect(visual2.monogram, equals('C12'));

      final visual3 = ProductVisualResolver.resolve(
        category: 'Merchandising',
        productName: 'Taza SOHO',
      );
      expect(visual3.icon, isNull);
      expect(visual3.monogram, equals('TS'));
    });

    test('monogram handles single-word products gracefully', () {
      final visual = ProductVisualResolver.resolve(
        category: 'Otros',
        productName: 'Matcha',
      );
      expect(visual.icon, isNull);
      expect(visual.monogram, equals('MA'));
    });

    test('prohibits fastfood burger icon for coffee/breakfast/pastry products', () {
      final coffeeVisual = ProductVisualResolver.resolve(
        category: 'Bebidas Calientes',
        productName: 'Latte Vainilla',
      );
      expect(coffeeVisual.icon, isNot(equals(Icons.fastfood)));

      final pastryVisual = ProductVisualResolver.resolve(
        category: 'Repostería',
        productName: 'Croissant',
      );
      expect(pastryVisual.icon, isNot(equals(Icons.fastfood)));
    });
  });
}
