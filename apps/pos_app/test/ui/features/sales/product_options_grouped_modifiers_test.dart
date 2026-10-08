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

  testWidgets('checkbox group starts empty, allows multiple selections and never exceeds its limit', (tester) async {
    final product = Product(
      id: 'p-1',
      name: 'Capuccino',
      uom: 'UND',
      stock: 5,
      averageCost: 0,
      sellPrice: 60,
      availableModifierGroups: [
        group('grp-1', 'Extras', maxSelected: 2, options: [
          option('opt-1', 'Crema', 10),
          option('opt-2', 'Canela', 3),
          option('opt-3', 'Nuez', 4),
        ]),
      ],
    );

    final viewModel = await _pumpDialog(tester, product);

    // Starts EMPTY: opt-in, never silently adds price (checkboxes unchecked).
    expect(find.byType(CheckboxListTile), findsNWidgets(3));
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
    await tester.tap(find.text('Nuez (+C\$ 4)'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Crema (+C\$ 10)'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Nuez (+C\$ 4)'));
    await tester.pumpAndSettle();
    bool checked(String name) => tester
        .widgetList<CheckboxListTile>(find.byType(CheckboxListTile))
        .firstWhere((tile) => (tile.title as Text?)!.data!.startsWith(name))
        .value!;
    expect(checked('Crema'), false);
    expect(checked('Canela'), true);
    expect(checked('Nuez'), true);
    await tester.tap(find.text('Nuez (+C\$ 4)'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Crema (+C\$ 10)'));
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

  testWidgets('AGREGAR bridges quantities as PER-UNIT price plus explicit quantity (2 × 15)', (tester) async {
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

    // Semantic change vs the first bridge: extraPrice is PER UNIT and the
    // quantity rides on its own field, so the kitchen can print '2x Leche: Entera'
    // and the totals stay quantity-aware end to end. The option name carries
    // its group context (Issue #795): 'Leche: Entera'.
    final modifiers = viewModel.addedModifiers.single;
    expect(modifiers, hasLength(1));
    expect(modifiers.first.id, 'opt-1');
    expect(modifiers.first.name, 'Leche: Entera');
    expect(modifiers.first.extraPrice, 15.0);
    expect(modifiers.first.quantity, 2);
    expect(viewModel.addedProducts.single.id, 'p-1');
  });

  Product productWith(
    List<EffectiveModifierGroup> groups, {
    List<Modifier> legacy = const [],
  }) =>
      Product(
        id: 'p-1',
        name: 'Capuccino',
        uom: 'UND',
        stock: 5,
        averageCost: 0,
        sellPrice: 60,
        availableModifiers: legacy,
        availableModifierGroups: groups,
      );

  testWidgets('legacy modifiers coexist with the grouped selector, both ride to the cart', (tester) async {
    final legacy = const [Modifier(id: 'legacy-1', name: 'Viejo', extraPrice: 1)];
    final viewModel = await _pumpDialog(
      tester,
      productWith([
        group('grp-1', 'Leche', maxSelected: 1, options: [option('opt-1', 'Entera', 5)]),
      ], legacy: legacy),
    );
    await tester.tap(find.textContaining('Viejo'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Entera (+C\$ 5)'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('AGREGAR'));
    await tester.pumpAndSettle();
    // The bridge carries BOTH selections, no silent sink, no cross-talk.
    expect(
      viewModel.addedModifiers.single.map((m) => m.id).toSet(),
      {'legacy-1', 'opt-1'},
    );
  });

  testWidgets('required groups block AGREGAR until satisfied; optional ones never do', (tester) async {
    final viewModel = await _pumpDialog(
      tester,
      productWith([
        group('grp-1', 'Leche', minSelected: 1, maxSelected: 1, options: [option('opt-1', 'Entera', 5)]),
        group('grp-2', 'Extras', minSelected: 0, maxSelected: 3, options: [option('opt-2', 'Crema', 10)]),
      ]),
    );

    await tester.tap(find.text('AGREGAR'));
    await tester.pumpAndSettle();
    expect(viewModel.addedProducts, isEmpty);
    expect(find.text('Falta elegir una opción en «Leche»'), findsOneWidget);

    // Satisfying the group clears the error and the add goes through.
    await tester.tap(find.text('Entera (+C\$ 5)'));
    await tester.pumpAndSettle();
    expect(find.text('Falta elegir una opción en «Leche»'), findsNothing);
    await tester.tap(find.text('AGREGAR'));
    await tester.pumpAndSettle();
    expect(viewModel.addedProducts, hasLength(1));
    expect(viewModel.addedModifiers.last.map((m) => m.id), ['opt-1']);
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
        // Required group WITHOUT default: AGREGAR surfaces the inline error
        // so the guard covers the error copy too.
        group('grp-radio', 'Leche', minSelected: 1, maxSelected: 1, options: [option('opt-1', 'Entera', 5)]),
        group('grp-check', 'Extras', maxSelected: 3, options: [
          option('opt-2', 'Crema', 10),
        ]),
        group('grp-qty', 'Endulzante', maxSelected: 2, allowQuantities: true, options: [
          option('opt-3', 'Azúcar', 4),
        ]),
      ],
    );

    await _pumpDialog(tester, product);

    // Surface the inline error state too: a required group satisfied only
    // AFTER the guard has seen the error text.
    await tester.tap(find.text('AGREGAR'));
    await tester.pumpAndSettle();

    // Every visible Text (labels, hints, buttons, error included).
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

    // The error itself is business copy naming the group.
    expect(find.textContaining('Falta elegir'), findsOneWidget);
  });
}
