import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/models/inventory/product.dart';
import 'package:pos_app/ui/features/sales/sale_view.dart';
import 'package:pos_app/ui/features/sales/widgets/product_card.dart';
import 'package:pos_app/ui/features/sales/widgets/product_card_thumbnail.dart';
import 'package:pos_app/ui/features/sales/widgets/product_grid_geometry.dart';

/// Devices the sales catalog must serve, with the real numbers measured from
/// the field (logical width dp / device pixel ratio):
///
/// - Sunmi V2s: 480x854 px @ density 240 -> 320x569 dp
/// - Samsung S23: 1080x2316 px @ density 450 -> 384x823.5 dp (ADB capture)
/// - MIRAY Q80: 800x1280 px @ density 240 -> 533x853 dp (ADB capture)
///
/// Product photos are stored 1:1 at 300x300 px by the backoffice pipeline
/// (`product-image-field.tsx`), so the catalog geometry is only correct if it
/// keeps the rendered photo inside that budget on every device.
class _Device {
  const _Device(this.name, this.width, this.dpr);

  final String name;
  final double width;
  final double dpr;

  ProductGridGeometry get geometry =>
      ProductGridGeometry(viewportWidth: width, devicePixelRatio: dpr);
}

const _devices = <_Device>[
  _Device('Sunmi V2s', 320, 1.5),
  _Device('Samsung S23', 384, 2.8125),
  _Device('MIRAY Q80', 533.33, 1.5),
];

Product _product(int index) => Product(
      id: 'prod-$index',
      name: 'Producto $index',
      sellPrice: 25.0 + index,
      averageCost: 10.0,
      uom: 'Unidad',
      stock: 10.0,
      sku: 'SKU-$index',
      category: 'Snacks',
    );

void main() {
  group('ProductGridGeometry — columnas por ancho y densidad (S8)', () {
    test('handheld bands: two columns on tiny terminals, three above', () {
      expect(_devices[0].geometry.columns, 2, reason: 'Sunmi V2s');
      expect(_devices[1].geometry.columns, 3, reason: 'Samsung S23');
      expect(_devices[2].geometry.columns, 3, reason: 'MIRAY Q80');
    });

    test('a high-density 360 dp phone gets three columns, not two', () {
      // 360 dp is the most common Android phone width. Two columns there would
      // render the stored photo at 1.48x; three keep it at 1.00x.
      final common = ProductGridGeometry(
        viewportWidth: 360,
        devicePixelRatio: 3,
      );

      expect(common.columns, 3);
      expect(common.imageUpscale, lessThanOrEqualTo(1.15));
    });

    test('a low-density 360 dp terminal keeps two comfortable columns', () {
      final terminal = ProductGridGeometry(
        viewportWidth: 360,
        devicePixelRatio: 1.5,
      );

      expect(terminal.columns, 2);
      expect(terminal.cardWidth, greaterThan(150));
    });

    test('tablets keep the historical four columns at 800 dp', () {
      final tablet = ProductGridGeometry(
        viewportWidth: 800,
        devicePixelRatio: 1.0,
      );

      expect(tablet.columns, 4);
    });

    test('cell width, spacing and padding always fill the viewport', () {
      for (final geometry in [
        ..._devices.map((d) => d.geometry),
        const ProductGridGeometry(viewportWidth: 800, devicePixelRatio: 1.0),
      ]) {
        final filled = geometry.cellWidth * geometry.columns +
            geometry.crossAxisSpacing * (geometry.columns - 1) +
            geometry.horizontalPadding * 2;
        expect(
          filled,
          closeTo(geometry.viewportWidth, 0.01),
          reason: 'no horizontal slack at ${geometry.viewportWidth} dp',
        );
      }
    });

    test('the visible card is the cell minus the Card margin', () {
      for (final device in _devices) {
        expect(
          device.geometry.cellWidth - device.geometry.cardWidth,
          closeTo(ProductGridGeometry.cardMargin * 2, 0.01),
        );
      }
    });
  });

  group('ProductGridGeometry — nitidez contra el material de 300 px (S9)', () {
    test('no supported device upscales the stored photo past 1.15x', () {
      for (final device in _devices) {
        expect(
          device.geometry.imageUpscale,
          lessThanOrEqualTo(ProductGridGeometry.maxPhotoUpscale),
          reason: '${device.name} renders the 1:1 photo at '
              '${(device.geometry.imageUpscale * 100).toStringAsFixed(1)}% '
              'of 300 px',
        );
      }
    });

    test('common phone densities stay crisp too', () {
      for (final dpr in <double>[2.0, 2.625, 2.75, 3.0]) {
        final geometry = ProductGridGeometry(
          viewportWidth: 360,
          devicePixelRatio: dpr,
        );
        expect(
          geometry.imageUpscale,
          lessThanOrEqualTo(ProductGridGeometry.maxPhotoUpscale),
          reason: '360 dp at DPR $dpr',
        );
      }
    });

    test('the S23 photo lands within 2% of the stored resolution', () {
      expect(_devices[1].geometry.imageUpscale, closeTo(1.01, 0.02));
    });
  });

  group('ProductGridGeometry — cero espacio muerto en la tarjeta (S7)', () {
    test('cell height equals the square photo plus the footer band', () {
      for (final device in _devices) {
        final geometry = device.geometry;
        final expected = geometry.cardWidth +
            geometry.footerHeight +
            ProductGridGeometry.cardMargin * 2;
        expect(geometry.cellWidth / geometry.childAspectRatio,
            closeTo(expected, 0.01));
      }
    });

    test('the photo dominates the card: footer stays under 42% of it', () {
      for (final device in _devices) {
        final geometry = device.geometry;
        final cardHeight = geometry.cardWidth + geometry.footerHeight;
        expect(
          geometry.footerHeight / cardHeight,
          lessThan(0.42),
          reason: '${device.name} must not go back to a mostly empty card',
        );
      }
    });

    test('every card still clears the 48 dp touch target (§46)', () {
      for (final device in _devices) {
        final geometry = device.geometry;
        expect(
          geometry.cardWidth,
          greaterThanOrEqualTo(ProductGridGeometry.minTouchTarget),
        );
        expect(geometry.childAspectRatio, lessThan(1));
      }
    });
  });

  group('ProductGrid — grilla renderizada por dispositivo (S2, S6, S7)', () {
    for (final device in _devices) {
      testWidgets('${device.name}: columnas, foto 1:1 y sin espacio muerto', (
        tester,
      ) async {
        tester.view.physicalSize = Size(
          device.width * device.dpr,
          900 * device.dpr,
        );
        tester.view.devicePixelRatio = device.dpr;
        addTearDown(tester.view.reset);

        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: ProductGrid(
                products: List.generate(6, (i) => _product(i + 1)),
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();

        expect(tester.takeException(), isNull);

        final cards = find.byType(ProductCard);
        expect(cards, findsNWidgets(6));

        double? firstTop;
        var firstRow = 0;
        for (var i = 0; i < 6; i++) {
          final rect = tester.getRect(cards.at(i));
          firstTop ??= rect.top;
          if ((rect.top - firstTop).abs() < 1) firstRow++;
        }
        expect(firstRow, device.geometry.columns, reason: '${device.name}');

        final cellRect = tester.getRect(cards.at(0));
        final imageRect =
            tester.getRect(find.byType(ProductCardThumbnail).at(0));

        expect(
          imageRect.width,
          closeTo(device.geometry.cardWidth, 1.0),
          reason: 'the photo spans the full card width (S6)',
        );
        expect(
          imageRect.height,
          closeTo(imageRect.width, 1.0),
          reason: 'the photo is 1:1 (S6)',
        );
        expect(
          cellRect.height - imageRect.height,
          closeTo(
            device.geometry.footerHeight +
                ProductGridGeometry.cardMargin * 2,
            2.0,
          ),
          reason: 'the cell is exactly photo + footer + margins (S7)',
        );
      });
    }
  });
}
