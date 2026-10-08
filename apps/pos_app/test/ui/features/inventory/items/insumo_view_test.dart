import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:pos_app/domain/models/catalog/catalog_type.dart';
import 'package:pos_app/domain/models/fulfillment/fulfillment_contracts.dart';
import 'package:pos_app/domain/models/inventory/product.dart';
import 'package:pos_app/domain/repositories/inventory/inventory_repository.dart';
import 'package:pos_app/ui/design_system/design_system.dart';
import 'package:pos_app/ui/features/inventory/items/insumo_view.dart';
import 'package:pos_app/ui/features/inventory/items/insumo_view_model.dart';
import 'package:provider/provider.dart';

class _MockInventoryRepository extends Mock implements InventoryRepository {}

Product _product({
  required String id,
  required String name,
  required double stock,
  InventoryPolicy? inventoryPolicy,
}) {
  return Product(
    id: id,
    name: name,
    uom: 'UND',
    stock: stock,
    averageCost: 10,
    sellPrice: 25,
    isPrepared: false,
    inventoryPolicy: inventoryPolicy,
  );
}

/// Pumps [InsumoView] with a view model backed by a mocked repository that
/// returns [products], and navigates to the PRODUCTS (VENTA) tab.
Future<void> _pumpProductList(
  WidgetTester tester,
  List<Product> products,
) async {
  final repository = _MockInventoryRepository();
  when(() => repository.getActiveInsumos()).thenAnswer((_) async => const []);
  when(() => repository.getActiveProducts()).thenAnswer((_) async => products);
  when(() => repository.getActiveWarehouses()).thenAnswer((_) async => const []);
  when(() => repository.getActiveCatalog(any())).thenAnswer((_) async => const []);

  final viewModel = InsumoViewModel(repository);

  await tester.pumpWidget(
    ChangeNotifierProvider<InsumoViewModel>.value(
      value: viewModel,
      child: const MaterialApp(home: InsumoView()),
    ),
  );
  await tester.pumpAndSettle();

  await tester.tap(find.text('PRODUCTOS (VENTA)'));
  await tester.pumpAndSettle();
}

DsStatusChip _chipWithLabel(WidgetTester tester, String label) {
  final finder = find.byWidgetPredicate(
    (w) => w is DsStatusChip && w.label == label,
  );
  expect(finder, findsOneWidget, reason: 'Expected a "$label" chip');
  return tester.widget<DsStatusChip>(finder);
}

void main() {
  setUpAll(() {
    registerFallbackValue(CatalogType.uom);
  });

  group('BOH product list stock badge (issue #73)', () {
    testWidgets(
      'untracked product with 0 stock shows NO RASTREADO, never danger SIN STOCK',
      (tester) async {
        await _pumpProductList(tester, [
          _product(
            id: 'p-1',
            name: 'Gaseosa Importada',
            stock: 0,
            inventoryPolicy: InventoryPolicy.notTracked,
          ),
        ]);

        final chip = _chipWithLabel(tester, 'NO RASTREADO');
        expect(chip.tone, DsChipTone.neutral);
        expect(find.text('SIN STOCK'), findsNothing);
      },
    );

    testWidgets(
      'tracked product with 0 stock shows SIN STOCK with danger tone',
      (tester) async {
        await _pumpProductList(tester, [
          _product(
            id: 'p-2',
            name: 'Hamburguesa',
            stock: 0,
            inventoryPolicy: InventoryPolicy.recipeBom,
          ),
        ]);

        final chip = _chipWithLabel(tester, 'SIN STOCK');
        expect(chip.tone, DsChipTone.danger);
      },
    );

    testWidgets(
      'tracked product with positive stock shows ACTIVO with primary tone',
      (tester) async {
        await _pumpProductList(tester, [
          _product(
            id: 'p-3',
            name: 'Papas Fritas',
            stock: 12,
            inventoryPolicy: InventoryPolicy.recipeBom,
          ),
        ]);

        final chip = _chipWithLabel(tester, 'ACTIVO');
        expect(chip.tone, DsChipTone.primary);
      },
    );

    testWidgets(
      'product with null inventory policy and 0 stock still shows danger SIN STOCK (fail-closed)',
      (tester) async {
        await _pumpProductList(tester, [
          _product(id: 'p-4', name: 'Producto Legacy', stock: 0),
        ]);

        final chip = _chipWithLabel(tester, 'SIN STOCK');
        expect(chip.tone, DsChipTone.danger);
      },
    );
  });
}
