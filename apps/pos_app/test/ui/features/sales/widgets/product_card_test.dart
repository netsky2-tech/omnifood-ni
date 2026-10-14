import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/models/inventory/product.dart';
import 'package:pos_app/ui/design_system/nhilos_tokens.dart';
import 'package:pos_app/ui/features/sales/widgets/product_card.dart';
import 'package:pos_app/ui/features/sales/widgets/product_card_thumbnail.dart';
import 'package:pos_app/ui/features/sales/widgets/product_grid_geometry.dart';

/// Minimal valid 1x1 GIF data URL — the offline-first format the POS stores.
const _photoDataUrl =
    'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

const _withPhoto = Product(
  id: 'prod-1',
  name: 'Galletas Oreo 6pk',
  sellPrice: 25.0,
  averageCost: 10.0,
  uom: 'Unidad',
  stock: 10.0,
  sku: 'GAL-01',
  category: 'Snacks',
  imageUrl: _photoDataUrl,
);

const _withoutPhoto = Product(
  id: 'prod-2',
  name: 'Cappuccino 12oz',
  sellPrice: 125.0,
  averageCost: 40.0,
  uom: 'Taza',
  stock: 10.0,
  sku: 'CAP-12',
  category: 'Café Caliente',
);

/// Pumps a single card inside the exact cell the grid gives it on a device:
/// the visible card plus Flutter's `Card` margin on each side.
Future<void> _pumpCard(
  WidgetTester tester, {
  required Product product,
  required double cardWidth,
  String? promoLabel,
  VoidCallback? onTap,
}) async {
  const margin = ProductGridGeometry.cardMargin;
  await tester.pumpWidget(
    MaterialApp(
      home: Scaffold(
        body: Center(
          child: SizedBox(
            width: cardWidth + margin * 2,
            height: cardWidth +
                ProductGridGeometry.footerHeightForCard(cardWidth) +
                margin * 2,
            child: ProductCard(
              product: product,
              promoLabel: promoLabel,
              onTap: onTap ?? () {},
            ),
          ),
        ),
      ),
    ),
  );
}

void main() {
  group('ProductCard — la foto es el protagonista (S1, S5, S6)', () {
    testWidgets('la foto ocupa el ancho completo de la tarjeta y es 1:1', (
      tester,
    ) async {
      await _pumpCard(tester, product: _withPhoto, cardWidth: 108);

      final cell = tester.getRect(find.byType(ProductCard));
      final image = tester.getRect(find.byType(ProductCardThumbnail));

      expect(cell.width, closeTo(116, 1.0), reason: 'celda de 3 columnas');
      expect(image.width, closeTo(108, 1.0), reason: 'la tarjeta visible');
      expect(image.height, closeTo(image.width, 1.0));
      expect(image.width, greaterThan(90), reason: 'la foto ya no es de 36 dp');
    });

    testWidgets('nombre y precio viven en una banda compacta, sin hueco', (
      tester,
    ) async {
      await _pumpCard(tester, product: _withPhoto, cardWidth: 108);

      final cell = tester.getRect(find.byType(ProductCard));
      final image = tester.getRect(find.byType(ProductCardThumbnail));

      final footerBand = cell.height - image.height;
      expect(
        footerBand,
        closeTo(
          ProductGridGeometry.footerHeightForCard(108) +
              ProductGridGeometry.cardMargin * 2,
          2,
        ),
        reason: 'celda = foto + pie + márgenes, sin aire entre medio',
      );

      expect(find.text('Galletas Oreo 6pk'), findsOneWidget);
      expect(find.text('C\$ 25.00'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('el nombre se limita a dos líneas y no desborda la tarjeta', (
      tester,
    ) async {
      // 9.0 text scale proof: the footer flexes, it never throws overflow.
      await _pumpCard(tester, product: _withPhoto, cardWidth: 108);

      final name = tester.widget<Text>(find.text('Galletas Oreo 6pk'));
      expect(name.maxLines, 2);
      expect(name.overflow, TextOverflow.ellipsis);
    });

    testWidgets('la tarjeta ancha (Q80) usa la banda de pie más alta', (
      tester,
    ) async {
      await _pumpCard(tester, product: _withPhoto, cardWidth: 157.8);

      final cell = tester.getRect(find.byType(ProductCard));
      final image = tester.getRect(find.byType(ProductCardThumbnail));

      expect(image.width, closeTo(157.8, 1.0));
      expect(
        cell.height - image.height,
        closeTo(
          ProductGridGeometry.footerHeightForCard(157.8) +
              ProductGridGeometry.cardMargin * 2,
          2,
        ),
      );
    });
  });

  group('ProductCard — accesibilidad y estado (S11, S12, S16)', () {
    testWidgets('con el texto ampliado la tarjeta no desborda el layout', (
      tester,
    ) async {
      tester.platformDispatcher.textScaleFactorTestValue = 1.3;
      addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);

      await _pumpCard(tester, product: _withPhoto, cardWidth: 108);

      expect(tester.takeException(), isNull);
      expect(find.text('Galletas Oreo 6pk'), findsOneWidget);
    });

    testWidgets('la tarjeta es un botón con nombre y precio accesibles', (
      tester,
    ) async {
      final semantics = tester.ensureSemantics();
      await _pumpCard(tester, product: _withPhoto, cardWidth: 108);

      expect(
        find.bySemanticsLabel(RegExp('Galletas Oreo 6pk')),
        findsOneWidget,
      );
      expect(
        find.bySemanticsLabel(RegExp('C\\\$ 25.00')),
        findsOneWidget,
        reason: 'el precio se anuncia con el producto (§46)',
      );

      semantics.dispose();
    });

    testWidgets('el badge de promoción existe, anuncia su texto y no usa '
        'colores fuera de la paleta (§42.1)', (tester) async {
      await _pumpCard(
        tester,
        product: _withPhoto,
        cardWidth: 108,
        promoLabel: '2x1',
      );

      expect(find.text('2x1'), findsOneWidget);

      final badgeContainer = tester.widget<Container>(
        find.ancestor(of: find.text('2x1'), matching: find.byType(Container)).first,
      );
      final decoration = badgeContainer.decoration! as BoxDecoration;

      expect(
        decoration.color,
        NhilosColors.brandPrimary,
        reason: 'el acento de promoción sale de la paleta vigente',
      );
      expect(
        decoration.color,
        isNot(Colors.deepOrange),
        reason: 'deepOrange no pertenece a §42.1',
      );
      expect(
        decoration.borderRadius,
        NhilosRadii.badgeRadius,
        reason: 'badges de 4 dp (§42.7)',
      );
    });

    testWidgets('la tarjeta responde al toque', (tester) async {
      var taps = 0;
      await _pumpCard(
        tester,
        product: _withPhoto,
        cardWidth: 108,
        onTap: () => taps++,
      );

      await tester.tap(find.byType(ProductCard));
      await tester.pumpAndSettle();

      expect(taps, 1);
    });
  });

  group('ProductCard — fallback proporcional cuando no hay foto (S11)', () {
    testWidgets('el glifo de categoría escala con la caja de la foto', (
      tester,
    ) async {
      await _pumpCard(tester, product: _withoutPhoto, cardWidth: 200);

      final icon = tester.widget<Icon>(
        find.byIcon(Icons.local_cafe_outlined),
      );
      expect(icon.size, isNotNull);
      expect(
        icon.size!,
        inInclusiveRange(200 * 0.25, 200 * 0.5),
        reason: 'un glifo de tamaño fijo se vería perdido en una foto grande',
      );
    });

    testWidgets('el monograma escala y ya no se limita a 18 dp', (
      tester,
    ) async {
      const noGlyphCategory = Product(
        id: 'prod-3',
        name: 'Arroz con Pollo',
        sellPrice: 90.0,
        averageCost: 30.0,
        uom: 'Plato',
        stock: 5.0,
        sku: 'ARP-01',
        category: 'Generico',
      );

      await _pumpCard(tester, product: noGlyphCategory, cardWidth: 200);

      final monogram = tester.widget<Text>(find.text('AC'));
      final fontSize = monogram.style!.fontSize!;

      expect(fontSize, greaterThan(18));
      expect(
        fontSize,
        inInclusiveRange(200 * 0.15, 200 * 0.35),
      );
    });
  });
}
