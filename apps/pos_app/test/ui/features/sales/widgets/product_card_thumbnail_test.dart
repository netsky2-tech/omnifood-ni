import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/ui/features/sales/widgets/product_card_thumbnail.dart';

void main() {
  // Minimal valid 1x1 GIF data URL for testing Image.memory
  const validBase64Gif =
      'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

  Widget wrap(Widget child) {
    return MaterialApp(
      home: Scaffold(
        body: Center(child: child),
      ),
    );
  }

  group('ProductCardThumbnail — image and fallback presentation (S3)', () {
    testWidgets('renders category icon glyph when no image is provided', (
      tester,
    ) async {
      await tester.pumpWidget(
        wrap(
          const ProductCardThumbnail(
            category: 'Hamburguesas',
            productName: 'Classic Burger',
            size: 48,
          ),
        ),
      );

      expect(find.byIcon(Icons.lunch_dining_outlined), findsOneWidget);
      expect(find.byType(Image), findsNothing);
    });

    testWidgets('renders typographic monogram when category has no glyph', (
      tester,
    ) async {
      await tester.pumpWidget(
        wrap(
          const ProductCardThumbnail(
            category: 'Generico',
            productName: 'Arroz con Pollo',
            size: 48,
          ),
        ),
      );

      expect(find.byType(Image), findsNothing);
      expect(find.text('AC'), findsOneWidget);
    });

    testWidgets('renders Image.memory when valid base64 data URL is supplied', (
      tester,
    ) async {
      await tester.pumpWidget(
        wrap(
          const ProductCardThumbnail(
            imageUrl: validBase64Gif,
            category: 'Bebidas',
            productName: 'Café Espresso',
            size: 48,
          ),
        ),
      );

      expect(find.byType(Image), findsOneWidget);
      final clipRRect = tester.widget<ClipRRect>(find.byType(ClipRRect));
      expect(clipRRect.borderRadius, equals(BorderRadius.circular(48 * 0.22)));
    });

    testWidgets(
      'falls back gracefully to monogram on malformed/unparseable data URL',
      (tester) async {
        await tester.pumpWidget(
          wrap(
            const ProductCardThumbnail(
              imageUrl: 'data:image/webp;base64,!!!invalid_base64!!!',
              category: 'Generico',
              productName: 'Sopa de Res',
              size: 48,
            ),
          ),
        );

        // Fallback kicks in without crashing
        expect(find.text('SD'), findsOneWidget);
      },
    );

    testWidgets('renders Image.network when HTTPS URL is supplied', (
      tester,
    ) async {
      await tester.pumpWidget(
        wrap(
          const ProductCardThumbnail(
            imageUrl: 'https://example.com/product.webp',
            category: 'Postres',
            productName: 'Flan de Leche',
            size: 48,
          ),
        ),
      );

      expect(find.byType(Image), findsOneWidget);
    });
  });
}
