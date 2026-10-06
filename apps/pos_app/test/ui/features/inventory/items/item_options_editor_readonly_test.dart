import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/models/inventory/product.dart';
import 'package:pos_app/ui/features/inventory/items/item_options_editor.dart';

const _productWithOptions = Product(
  id: 'prod-1',
  name: 'Hamburguesa',
  uom: 'un',
  stock: 3,
  averageCost: 45,
  sellPrice: 120,
  variants: [
    ProductVariant(id: 'var-1', name: 'Grande', priceAdjustment: 25),
  ],
  availableModifierGroups: [
    EffectiveModifierGroup(
      id: 'grp-1',
      name: 'Extras',
      minSelected: 0,
      maxSelected: 3,
      allowQuantities: true,
      source: 'category',
      options: [
        EffectiveModifierOption(
          id: 'opt-1',
          name: 'Extra Queso',
          priceDelta: 15,
          isDefault: false,
        ),
        EffectiveModifierOption(
          id: 'opt-2',
          name: 'Tocino',
          priceDelta: 20.5,
          isDefault: false,
        ),
      ],
    ),
  ],
);

const _productWithoutOptions = Product(
  id: 'prod-2',
  name: 'Refresco',
  uom: 'un',
  stock: 10,
  averageCost: 20,
  sellPrice: 45,
);

Future<void> _pumpEditor(
  WidgetTester tester, {
  Product product = _productWithOptions,
}) async {
  await tester.pumpWidget(
    MaterialApp(home: ItemOptionsEditor(product: product)),
  );
  await tester.pumpAndSettle();
}

Future<void> _openTab(WidgetTester tester, String label) async {
  await tester.tap(find.text(label));
  await tester.pumpAndSettle();
}

/// Copy guard: everything rendered must be plain Spanish business language.
/// No technical jargon, section marks, task codes, hashes, ids or file paths.
final RegExp _forbiddenCopy = RegExp(
  r'(§|t\d+\.\d+|[0-9a-f]{8,}|grp-|opt-|var-|prod-|\.dart|/lib/|/test/|'
  r'\bsync\b|\bdelta\b|\buuid\b|\brepo\b|\bdao\b)',
  caseSensitive: false,
);

void main() {
  group('ItemOptionsEditor read-only options screen', () {
    testWidgets('shows no save button and no edit actions', (tester) async {
      await _pumpEditor(tester);

      expect(find.text('GUARDAR CAMBIOS'), findsNothing);
      expect(find.byIcon(Icons.save), findsNothing);
      expect(find.byIcon(Icons.delete), findsNothing);
      expect(find.byIcon(Icons.add), findsNothing);
      expect(find.text('AGREGAR VARIANTE'), findsNothing);
      expect(find.text('AGREGAR MODIFICADOR'), findsNothing);
      expect(find.byType(TextField), findsNothing);
      expect(find.byType(ElevatedButton), findsNothing);
    });

    testWidgets('VARIANTES tab renders variants as plain read-only rows', (
      tester,
    ) async {
      await _pumpEditor(tester);

      await _openTab(tester, 'VARIANTES (Tallas/Tipos)');

      expect(find.text('Grande'), findsOneWidget);
      expect(find.text('Ajuste de precio: +C\$ 25'), findsOneWidget);
    });

    testWidgets(
      'VARIANTES tab shows a friendly empty state when there are no variants',
      (tester) async {
        await _pumpEditor(tester, product: _productWithoutOptions);

        await _openTab(tester, 'VARIANTES (Tallas/Tipos)');

        expect(find.text('Este producto no tiene variantes.'), findsOneWidget);
      },
    );

    testWidgets(
      'MODIFICADORES tab renders modifier groups read-only with the web banner',
      (tester) async {
        await _pumpEditor(tester);

        await _openTab(tester, 'MODIFICADORES (Extras)');

        expect(
          find.text(
            'Los modificadores se administran desde el panel web, en Gestión → Modificadores.',
          ),
          findsOneWidget,
        );
        expect(find.text('Extras'), findsOneWidget);
        expect(find.text('Extra Queso'), findsOneWidget);
        expect(find.text('Tocino'), findsOneWidget);
        expect(find.text('+C\$ 15'), findsOneWidget);
        expect(find.text('+C\$ 20.5'), findsOneWidget);
        // Legacy flat modifier data must not be rendered.
        expect(find.text('Lechuga'), findsNothing);
        // Nothing editable: no switches, checkboxes or steppers.
        expect(find.byType(Switch), findsNothing);
        expect(find.byType(Checkbox), findsNothing);
        expect(find.byType(IconButton), findsNothing);
      },
    );

    testWidgets(
      'MODIFICADORES tab shows a friendly empty state when there are no groups',
      (tester) async {
        await _pumpEditor(tester, product: _productWithoutOptions);

        await _openTab(tester, 'MODIFICADORES (Extras)');

        expect(
          find.text('Este producto todavía no tiene modificadores.'),
          findsOneWidget,
        );
      },
    );

    testWidgets('copy guard: only plain Spanish business language is visible', (
      tester,
    ) async {
      await _pumpEditor(tester);

      Future<void> assertCopyClean() async {
        final texts = tester
            .widgetList<Text>(find.byType(Text))
            .map((t) => t.data ?? '')
            .toList();
        for (final text in texts) {
          expect(
            _forbiddenCopy.hasMatch(text),
            isFalse,
            reason: 'Texto con lenguaje no permitido: "$text"',
          );
        }
      }

      await assertCopyClean();

      await _openTab(tester, 'VARIANTES (Tallas/Tipos)');
      await assertCopyClean();

      await _openTab(tester, 'MODIFICADORES (Extras)');
      await assertCopyClean();

      await _pumpEditor(tester, product: _productWithoutOptions);
      await assertCopyClean();
      await _openTab(tester, 'VARIANTES (Tallas/Tipos)');
      await assertCopyClean();
      await _openTab(tester, 'MODIFICADORES (Extras)');
      await assertCopyClean();
    });
  });
}
