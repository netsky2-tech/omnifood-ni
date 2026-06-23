import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:pos_app/domain/models/inventory/insumo.dart';
import 'package:pos_app/domain/models/inventory/product.dart';
import 'package:pos_app/domain/models/inventory/supplier.dart';
import 'package:pos_app/domain/models/inventory/warehouse.dart';
import 'package:pos_app/domain/models/inventory/uom_conversion.dart';
import 'package:pos_app/domain/models/catalog/catalog_value.dart';
import 'package:pos_app/domain/models/catalog/catalog_type.dart';
import 'package:pos_app/domain/repositories/inventory/inventory_repository.dart';
import 'package:pos_app/ui/features/inventory/items/insumo_view.dart';
import 'package:pos_app/ui/features/inventory/items/insumo_view_model.dart';
import 'package:pos_app/ui/features/inventory/suppliers/supplier_view.dart';
import 'package:pos_app/ui/features/inventory/suppliers/supplier_view_model.dart';
import 'package:pos_app/ui/features/inventory/warehouses/warehouse_view.dart';
import 'package:pos_app/ui/features/inventory/warehouses/warehouse_view_model.dart';
import 'package:provider/provider.dart';

class _MockInventoryRepository extends Mock implements InventoryRepository {}

// Seeded administrable catalogs (mirror of the migration default seed) used to
// drive the POS dropdowns instead of any hardcoded UI list.
const _seededUomCatalog = <CatalogValue>[
  CatalogValue(
    id: 'seed-uom-kg',
    catalogType: CatalogType.uom,
    code: 'kg',
    name: 'Kilogramo',
    sortOrder: 0,
  ),
  CatalogValue(
    id: 'seed-uom-g',
    catalogType: CatalogType.uom,
    code: 'g',
    name: 'Gramo',
    sortOrder: 1,
  ),
  CatalogValue(
    id: 'seed-uom-lb',
    catalogType: CatalogType.uom,
    code: 'lb',
    name: 'Libra',
    sortOrder: 2,
  ),
  CatalogValue(
    id: 'seed-uom-l',
    catalogType: CatalogType.uom,
    code: 'l',
    name: 'Litro',
    sortOrder: 4,
  ),
  CatalogValue(
    id: 'seed-uom-gal',
    catalogType: CatalogType.uom,
    code: 'gal',
    name: 'Galón',
    sortOrder: 6,
  ),
  CatalogValue(
    id: 'seed-uom-un',
    catalogType: CatalogType.uom,
    code: 'un',
    name: 'Unidad',
    sortOrder: 7,
  ),
];
const _seededProductCategories = <CatalogValue>[
  CatalogValue(
    id: 'seed-pcat-comida',
    catalogType: CatalogType.salesProductCategory,
    code: 'COMIDA',
    name: 'Comida',
    sortOrder: 0,
  ),
  CatalogValue(
    id: 'seed-pcat-bebida-caliente',
    catalogType: CatalogType.salesProductCategory,
    code: 'BEBIDA_CALIENTE',
    name: 'Bebida caliente',
    sortOrder: 1,
  ),
];
const _seededProductTypes = <CatalogValue>[
  CatalogValue(
    id: 'seed-ptype-preparado',
    catalogType: CatalogType.salesProductType,
    code: 'PREPARADO',
    name: 'Preparado (lleva receta/BOM)',
    sortOrder: 0,
  ),
  CatalogValue(
    id: 'seed-ptype-reventa',
    catalogType: CatalogType.salesProductType,
    code: 'REVENTA',
    name: 'Reventa directa',
    sortOrder: 1,
  ),
];

void main() {
  const item = Insumo(
    id: 'ins-1',
    name: 'Leche Entera',
    consumptionUom: 'L',
    stock: 12,
    averageCost: 42,
    parLevel: 8,
    warehouseId: 'wh-1',
    isPerishable: true,
  );
  const warehouse = Warehouse(id: 'wh-1', name: 'Bodega Central');
  const supplier = Supplier(id: 'sup-1', name: 'Lácteos del Norte');
  const defaultPresentation = UomConversion(
    id: 'conv-1',
    insumoId: 'ins-1',
    unitName: 'Galón',
    factor: 3.785,
    isDefault: true,
  );

  setUpAll(() {
    registerFallbackValue(item);
    registerFallbackValue(warehouse);
    registerFallbackValue(supplier);
    registerFallbackValue(defaultPresentation);
    registerFallbackValue(CatalogType.uom);
    registerFallbackValue(
      const CatalogValue(
        id: 'fb',
        catalogType: CatalogType.uom,
        code: 'kg',
        name: 'Kilogramo',
      ),
    );
  });

  group('inventory master-data closure coverage', () {
    late _MockInventoryRepository repository;

    setUp(() {
      repository = _MockInventoryRepository();
      when(
        () => repository.getActiveInsumos(),
      ).thenAnswer((_) async => const [item]);
      when(
        () => repository.getActiveProducts(),
      ).thenAnswer((_) async => const <Product>[]);
      when(
        () => repository.getActiveWarehouses(),
      ).thenAnswer((_) async => const [warehouse]);
      when(
        () => repository.getActiveSuppliers(),
      ).thenAnswer((_) async => const [supplier]);
      when(() => repository.saveInsumo(any())).thenAnswer((_) async {});
      when(() => repository.saveSupplier(any())).thenAnswer((_) async {});
      when(() => repository.saveWarehouse(any())).thenAnswer((_) async {});
      when(
        () => repository.getConversionsByInsumoId(any()),
      ).thenAnswer((_) async => const <UomConversion>[]);
      when(() => repository.saveConversion(any())).thenAnswer((_) async {});
      when(() => repository.deleteConversion(any())).thenAnswer((_) async {});
      // Administrable catalogs drive the POS dropdowns (no hardcoded UI lists).
      when(() => repository.getActiveCatalog(any())).thenAnswer((inv) async {
        final type = inv.positionalArguments.first as CatalogType;
        if (type == CatalogType.uom) return _seededUomCatalog;
        if (type == CatalogType.salesProductCategory) {
          return _seededProductCategories;
        }
        if (type == CatalogType.salesProductType) return _seededProductTypes;
        return const <CatalogValue>[];
      });
    });

    testWidgets(
      'shows item closure detail metadata and related workflow navigation',
      (tester) async {
        final viewModel = InsumoViewModel(repository);

        await tester.pumpWidget(
          MaterialApp(
            routes: {
              '/inventory/purchases': (_) =>
                  const Scaffold(body: Text('Purchases workspace')),
              '/inventory/kardex': (_) =>
                  const Scaffold(body: Text('Kardex workspace')),
              '/inventory/recipes': (_) =>
                  const Scaffold(body: Text('Recipes workspace')),
            },
            home: ChangeNotifierProvider<InsumoViewModel>.value(
              value: viewModel,
              child: const InsumoView(),
            ),
          ),
        );
        await tester.pumpAndSettle();

        await tester.tap(find.text('Leche Entera').first);
        await tester.pumpAndSettle();

        expect(find.text('Leche Entera'), findsWidgets);
        expect(find.text('PAR'), findsOneWidget);
        expect(find.text('Bodega Central'), findsNothing);
        expect(find.text('VER COMPRAS'), findsOneWidget);
        expect(find.text('VER KARDEX'), findsOneWidget);
        expect(find.text('VER RECETAS'), findsOneWidget);

        await tester.tap(find.text('VER COMPRAS'));
        await tester.pumpAndSettle();

        expect(find.text('Purchases workspace'), findsOneWidget);
      },
    );

    testWidgets('keeps supplier form labels visible during BOH editing', (
      tester,
    ) async {
      final viewModel = SupplierViewModel(repository);

      await tester.pumpWidget(
        MaterialApp(
          home: ChangeNotifierProvider<SupplierViewModel>.value(
            value: viewModel,
            child: const SupplierView(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('REGISTRAR PROVEEDOR'));
      await tester.pumpAndSettle();

      expect(find.text('Nombre'), findsOneWidget);
      expect(find.text('Teléfono'), findsOneWidget);
      expect(find.text('Contacto'), findsOneWidget);
      expect(find.text('Condiciones de Crédito'), findsOneWidget);
    });

    testWidgets('keeps warehouse form labels visible during BOH editing', (
      tester,
    ) async {
      final viewModel = WarehouseViewModel(repository);

      await tester.pumpWidget(
        MaterialApp(
          home: ChangeNotifierProvider<WarehouseViewModel>.value(
            value: viewModel,
            child: const WarehouseView(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('REGISTRAR ALMACÉN'));
      await tester.pumpAndSettle();

      expect(find.text('Nombre'), findsOneWidget);
      expect(find.text('Descripción'), findsOneWidget);
    });

    testWidgets(
      'insumo form exposes clear PAR label with helper and a UoM selector',
      (tester) async {
        final viewModel = InsumoViewModel(repository);

        await tester.pumpWidget(
          MaterialApp(
            home: ChangeNotifierProvider<InsumoViewModel>.value(
              value: viewModel,
              child: const InsumoView(),
            ),
          ),
        );
        await tester.pumpAndSettle();

        await tester.tap(find.text('REGISTRAR INSUMO'));
        await tester.pumpAndSettle();

        expect(find.text('Nivel de reorden (PAR)'), findsOneWidget);
        expect(
          find.text('Stock mínimo que dispara alerta de reposición.'),
          findsOneWidget,
        );
        expect(find.text('Unidad de medida'), findsOneWidget);
        expect(find.text('Stock mínimo'), findsOneWidget);
        expect(find.text('Stock máximo'), findsOneWidget);

        await tester.tap(find.byType(DropdownButtonFormField<String>).first);
        await tester.pumpAndSettle();

        expect(find.text('kg').hitTestable(), findsWidgets);
        expect(find.text('l').hitTestable(), findsWidgets);
        expect(find.text('gal').hitTestable(), findsWidgets);
      },
    );

    testWidgets(
      'insumo detail shows presentations section with add/edit/delete flow',
      (tester) async {
        when(
          () => repository.getConversionsByInsumoId('ins-1'),
        ).thenAnswer((_) async => const [defaultPresentation]);
        final viewModel = InsumoViewModel(repository);
        await viewModel.loadInitialData();
        await viewModel.loadConversions('ins-1');

        await tester.pumpWidget(
          MaterialApp(
            routes: {
              '/inventory/purchases': (_) =>
                  const Scaffold(body: Text('Purchases workspace')),
              '/inventory/kardex': (_) =>
                  const Scaffold(body: Text('Kardex workspace')),
              '/inventory/recipes': (_) =>
                  const Scaffold(body: Text('Recipes workspace')),
            },
            home: ChangeNotifierProvider<InsumoViewModel>.value(
              value: viewModel,
              child: const InsumoView(),
            ),
          ),
        );
        await tester.pumpAndSettle();

        await tester.tap(find.text('Leche Entera'));
        await tester.pumpAndSettle();

        expect(find.text('PRESENTACIONES'), findsOneWidget);
        expect(find.text('Galón'), findsOneWidget);
        expect(find.text('DEFAULT'), findsOneWidget);

        await tester.tap(find.text('AGREGAR'));
        await tester.pumpAndSettle();

        expect(find.text('Nueva presentación'), findsOneWidget);
        expect(find.text('Unidades base por unidad de compra'), findsOneWidget);
        expect(
          find.text(
            '1 unidad de compra = N unidades base de inventario. Ej: 1 lb = 0.4536 kg.',
          ),
          findsOneWidget,
        );
      },
    );
  });
}
