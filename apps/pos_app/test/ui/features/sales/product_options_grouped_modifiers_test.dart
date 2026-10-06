import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:pos_app/domain/models/inventory/product.dart';
import 'package:pos_app/presentation/features/sales/view_models/sale_view_model.dart';
import 'package:pos_app/ui/features/sales/sale_view.dart';

/// Capturing stand-in for the view model: the dialog only reads
/// `addToCart` from it, and the test needs the exact bridge payload.
class _CapturingSaleViewModel extends ChangeNotifier
    implements SaleViewModel {
  final List<Product> addedProducts = [];
  final List<List<Modifier>> addedModifiers = [];

  @override
  void addToCart(
    Product product, {
    double quantity = 1.0,
    String? variantId,
    List<Modifier> modifiers = const [],
  }) {
    addedProducts.add(product);
    addedModifiers.add(List<Modifier>.from(modifiers));
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => null;
}

EffectiveModifierGroup group(
  String id,
  String name, {
  int minSelected = 0,
  required int maxSelected,
  bool allowQuantities = false,
  List<EffectiveModifierOption> options = const [],
}) =>
    EffectiveModifierGroup(
      id: id,
      name: name,
      minSelected: minSelected,
      maxSelected: maxSelected,
      allowQuantities: allowQuantities,
      source: 'category',
      options: options,
    );

EffectiveModifierOption option(
  String id,
  String name,
  double priceDelta, {
  bool isDefault = false,
}) =>
    EffectiveModifierOption(
      id: id,
      name: name,
      priceDelta: priceDelta,
      isDefault: isDefault,
    );

Future<_CapturingSaleViewModel> _pumpDialog(
  WidgetTester tester,
  Product product,
) async {
  final viewModel = _CapturingSaleViewModel();
  await tester.pumpWidget(
    ChangeNotifierProvider<SaleViewModel>.value(
      value: viewModel,
      child: MaterialApp(
        home: Scaffold(
          body: Center(child: ProductOptionsDialog(product: product)),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
  return viewModel;
}

void main() {
  testWidgets('radio group renders radios and preselects the default option', (tester) async {
    final product = Product(
      id: 'p-1',
      name: 'Capuccino',
      uom: 'UND',
      stock: 5,
      averageCost: 0,
      sellPrice: 60,
      availableModifierGroups: [
        group(
          'grp-1',
          'Leche',
          maxSelected: 1,
          options: [
            option('opt-1', 'Entera', 5, isDefault: true),
            option('opt-2', 'Deslactosada', 6),
          ],
        ),
      ],
    );

    final viewModel = await _pumpDialog(tester, product);

    // Radios are rendered (same widget family as the variants section).
    expect(find.byType(RadioListTile<String>), findsNWidgets(2));
    // The delta format matches the variant display idiom.
    expect(find.text('Entera (+C\$ 5)'), findsOneWidget);

    // AGREGAR without touching anything: the default option rides.
    await tester.tap(find.text('AGREGAR'));
    await tester.pumpAndSettle();

    expect(viewModel.addedModifiers.single, hasLength(1));
    expect(viewModel.addedModifiers.single.first.id, 'opt-1');
    expect(viewModel.addedModifiers.single.first.extraPrice, 5.0);
  });

  testWidgets('selecting a different radio option replaces the default', (tester) async {
    final product = Product(
      id: 'p-1',
      name: 'Capuccino',
      uom: 'UND',
      stock: 5,
      averageCost: 0,
      sellPrice: 60,
      availableModifierGroups: [
        group(
          'grp-1',
          'Leche',
          maxSelected: 1,
          options: [
            option('opt-1', 'Entera', 5, isDefault: true),
            option('opt-2', 'Deslactosada', 6),
          ],
        ),
      ],
    );

    final viewModel = await _pumpDialog(tester, product);

    await tester.tap(find.text('Deslactosada (+C\$ 6)'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('AGREGAR'));
    await tester.pumpAndSettle();

    expect(viewModel.addedModifiers.single, hasLength(1));
    expect(viewModel.addedModifiers.single.first.id, 'opt-2');
    expect(viewModel.addedModifiers.single.first.extraPrice, 6.0);
  });

  testWidgets('checkbox group starts empty and allows multiple selections', (tester) async {
    final product = Product(
      id: 'p-1',
      name: 'Capuccino',
      uom: 'UND',
      stock: 5,
      averageCost: 0,
      sellPrice: 60,
      availableModifierGroups: [
        group(
          'grp-1',
          'Extras',
          maxSelected: 3,
          options: [option('opt-1', 'Crema', 10), option('opt-2', 'Canela', 3)],
        ),
      ],
    );

    final viewModel = await _pumpDialog(tester, product);

    // Starts EMPTY: opt-in, never silently adds price (checkboxes unchecked).
    expect(find.byType(CheckboxListTile), findsNWidgets(2));
    expect(
      tester
          .widgetList<CheckboxListTile>(find.byType(CheckboxListTile))
          .every((tile) => tile.value == false),
      true,
    );

    // Multiple options can be selected together.
    await tester.tap(find.text('Crema (+C\$ 10)'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Canela (+C\$ 3)'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('AGREGAR'));
    await tester.pumpAndSettle();

    final modifiers = viewModel.addedModifiers.last;
    expect(modifiers.map((m) => m.id), ['opt-1', 'opt-2']);
  });

  testWidgets('quantity stepper increments, caps at the group total and floors at zero', (tester) async {
    final product = Product(
      id: 'p-1',
      name: 'Capuccino',
      uom: 'UND',
      stock: 5,
      averageCost: 0,
      sellPrice: 60,
      availableModifierGroups: [
        group(
          'grp-1',
          'Leche',
          maxSelected: 3,
          allowQuantities: true,
          options: [
            option('opt-1', 'Entera', 15),
            option('opt-2', 'Coco', 10),
          ],
        ),
      ],
    );

    final viewModel = await _pumpDialog(tester, product);

    // Starts at zero.
    expect(find.text('0'), findsNWidgets(2));

    // + twice on opt-1, + twice on opt-2: the TOTAL caps at 3, so opt-2
    // reaches only 1.
    await tester.tap(find.byKey(const Key('modifier_qty_plus_opt-1')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('modifier_qty_plus_opt-1')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('modifier_qty_plus_opt-2')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('modifier_qty_plus_opt-2')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('modifier_qty_plus_opt-2')));
    await tester.pumpAndSettle();

    expect(find.text('2'), findsOneWidget);
    expect(find.text('1'), findsOneWidget);

    // − floors at 0 and never goes negative, on both options.
    await tester.tap(find.byKey(const Key('modifier_qty_minus_opt-1')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('modifier_qty_minus_opt-1')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('modifier_qty_minus_opt-2')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('modifier_qty_minus_opt-2')));
    await tester.pumpAndSettle();
    expect(find.text('0'), findsNWidgets(2));

    // Everything back at zero: nothing rides to the cart.
    await tester.tap(find.text('AGREGAR'));
    await tester.pumpAndSettle();
    expect(viewModel.addedModifiers.last, isEmpty);
  });

  testWidgets('AGREGAR maps quantities into the flat modifier bridge (2 × 15 = 30)', (tester) async {
    final product = Product(
      id: 'p-1',
      name: 'Capuccino',
      uom: 'UND',
      stock: 5,
      averageCost: 0,
      sellPrice: 60,
      availableModifierGroups: [
        group(
          'grp-1',
          'Leche',
          maxSelected: 3,
          allowQuantities: true,
          options: [option('opt-1', 'Entera', 15)],
        ),
      ],
    );

    final viewModel = await _pumpDialog(tester, product);

    await tester.tap(find.byKey(const Key('modifier_qty_plus_opt-1')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('modifier_qty_plus_opt-1')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('AGREGAR'));
    await tester.pumpAndSettle();

    final modifiers = viewModel.addedModifiers.single;
    expect(modifiers, hasLength(1));
    expect(modifiers.first.id, 'opt-1');
    expect(modifiers.first.name, 'Entera');
    expect(modifiers.first.extraPrice, 30.0);
    expect(viewModel.addedProducts.single.id, 'p-1');
  });

  testWidgets('the legacy flat modifiers section is gone (dead data)', (tester) async {
    final product = Product(
      id: 'p-1',
      name: 'Capuccino',
      uom: 'UND',
      stock: 5,
      averageCost: 0,
      sellPrice: 60,
      availableModifiers: const [
        Modifier(id: 'legacy-1', name: 'Viejo', extraPrice: 1),
      ],
      availableModifierGroups: [
        group('grp-1', 'Leche', maxSelected: 1, options: [option('opt-1', 'Entera', 5)]),
      ],
    );

    await _pumpDialog(tester, product);

    // One modifier system on screen: the grouped selector, never the old
    // flat list.
    expect(find.text('Modificadores:'), findsNothing);
    expect(find.text('Viejo'), findsNothing);
  });

  testWidgets('copy guard: no internal or technical copy anywhere in the dialog', (tester) async {
    final product = Product(
      id: 'p-1',
      name: 'Capuccino',
      uom: 'UND',
      stock: 5,
      averageCost: 0,
      sellPrice: 60,
      availableModifierGroups: [
        group('grp-radio', 'Leche', maxSelected: 1, options: [
          option('opt-1', 'Entera', 5, isDefault: true),
        ]),
        group('grp-check', 'Extras', maxSelected: 3, options: [
          option('opt-2', 'Crema', 10),
        ]),
        group('grp-qty', 'Endulzante', maxSelected: 2, allowQuantities: true, options: [
          option('opt-3', 'Azúcar', 4),
        ]),
      ],
    );

    await _pumpDialog(tester, product);

    // Every visible Text (labels, hints, buttons) plus the dialog title.
    final combined = tester
        .widgetList<Text>(find.byType(Text))
        .map((text) => text.data ?? '')
        .join('\n');

    // Owner rule: Spanish business copy only — no plan/section references,
    // internal identifier prefixes, task codes, hashes or framework words.
    expect(combined, isNot(contains('§')));
    expect(combined, isNot(matches(RegExp(r'INV\.'))));
    expect(combined, isNot(matches(RegExp(r'\bT\d\.\d\b'))));
    expect(combined, isNot(matches(RegExp(r'\b[0-9a-f]{40}\b'))));
    expect(
      combined,
      isNot(matches(RegExp(r'\b(uuid|tenant|freezed|zod|snapshot)\b', caseSensitive: false))),
    );
  });
}
