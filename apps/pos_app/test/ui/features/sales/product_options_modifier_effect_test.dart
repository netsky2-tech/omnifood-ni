import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/inventory/authority_projection_entities.dart';
import 'package:pos_app/data/models/local_config_entity.dart';
import 'package:pos_app/domain/models/inventory/product.dart';
import 'package:pos_app/presentation/features/sales/view_models/sale_view_model.dart';
import 'package:pos_app/ui/features/sales/sale_view.dart';

/// R28 — the modifiers dialog tells the cashier what the option takes out
/// of the stock, in the operator's own words, with the quantity the option
/// INHERITS from the recipe (D2).
///
/// Two properties are load-bearing:
///  1. The copy names the component that leaves and the substitute that
///     enters, with the inherited quantity and its unit — the operator must
///     not have to guess what the extra takes.
///  2. The dialog LAYS OUT without overflowing: a flexible child inside a
///     `MainAxisSize.min` row has no bounded space to flex into, and the
///     dialog painted the yellow/black overflow stripe over the option
///     ("RIGHT OVERFLOWED BY 21 PIXELS") whenever the inherited quantity
///     was on screen.
class _CapturingSaleViewModel extends ChangeNotifier
    implements SaleViewModel {
  @override
  dynamic noSuchMethod(Invocation invocation) => null;
}

void main() {
  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  late AppDatabase database;

  setUp(() async {
    database = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();
    final dao = database.authorityProjectionDao;

    await dao.insertInsumo(
      const AuthorityInsumoEntity(
        tenantId: 'tenant-1',
        id: 'insumo-leche',
        name: 'R23 Leche entera',
        uom: 'ml',
      ),
    );
    await dao.insertInsumo(
      const AuthorityInsumoEntity(
        tenantId: 'tenant-1',
        id: 'insumo-almendras',
        name: 'Leche de Almondras',
        uom: 'ml',
      ),
    );
    await dao.insertInsumo(
      const AuthorityInsumoEntity(
        tenantId: 'tenant-1',
        id: 'insumo-cafe',
        name: 'R23 Cafe en grano',
        uom: 'g',
      ),
    );
    await dao.insertRecipeVersion(
      const AuthorityRecipeVersionEntity(
        tenantId: 'tenant-1',
        id: 'ver-1',
        productId: 'p-1',
        versionNumber: 1,
        isActive: true,
        publicationState: 'PUBLISHED',
        effectiveFrom: '2026-01-01T00:00:00Z',
        yieldQuantity: 1.0,
        technicalShrinkPct: 0.0,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      ),
    );
    await dao.insertComponent(
      const AuthorityRecipeVersionComponentEntity(
        tenantId: 'tenant-1',
        id: 'comp-1',
        versionId: 'ver-1',
        ordinal: 0,
        insumoId: 'insumo-leche',
        grossQuantity: 150,
        technicalShrinkPct: 0,
        ingredientType: 'INSUMO',
        componentName: 'R23 Leche entera',
        componentUom: 'ml',
      ),
    );
    await database.localConfigDao.saveConfig(
      LocalConfigEntity(key: 'tenant_id', value: 'tenant-1'),
    );
  });

  tearDown(() async {
    await database.close();
  });

  Product productWithSwap() => Product(
        id: 'p-1',
        name: 'R28 Capuccino',
        uom: 'UND',
        stock: 5,
        averageCost: 0,
        sellPrice: 60,
        availableModifierGroups: [
          EffectiveModifierGroup(
            id: 'grp-leche',
            name: 'Leche',
            minSelected: 0,
            maxSelected: 1,
            allowQuantities: false,
            source: 'category',
            options: [
              EffectiveModifierOption(
                id: 'opt-almendras',
                name: 'Almendras',
                priceDelta: 20,
                isDefault: false,
                inventoryEffect: 'SWAP',
                effectInsumoId: 'insumo-almendras',
                effectTargetInsumoId: 'insumo-leche',
              ),
            ],
          ),
        ],
      );

  /// The rig's V9 shape: an option that ADDS almond milk (ml) but inherits
  /// from the coffee component (g). The resolver refuses the inherited
  /// number (UNIT_MISMATCH), so the dialog must not announce it.
  Product productWithMismatchedUnits() => Product(
        id: 'p-2',
        name: 'R28 Subreceta',
        uom: 'UND',
        stock: 5,
        averageCost: 0,
        sellPrice: 50,
        availableModifierGroups: [
          EffectiveModifierGroup(
            id: 'grp-extras',
            name: 'Extras',
            minSelected: 0,
            maxSelected: 3,
            allowQuantities: true,
            source: 'product',
            options: [
              EffectiveModifierOption(
                id: 'opt-almendra-extra',
                name: 'Leche de almendra extra',
                priceDelta: 20,
                isDefault: false,
                inventoryEffect: 'ADD',
                effectInsumoId: 'insumo-almendras',
                effectTargetInsumoId: 'insumo-cafe',
              ),
            ],
          ),
        ],
      );

  Future<void> pumpDialog(
    WidgetTester tester, {
    Product? product,
    DateTime? now,
  }) async {
    await tester.pumpWidget(
      ChangeNotifierProvider<SaleViewModel>.value(
        value: _CapturingSaleViewModel(),
        child: Provider<AppDatabase>.value(
          value: database,
          child: MaterialApp(
            home: Scaffold(
              body: Center(
                child: ProductOptionsDialog(
                  product: product ?? productWithSwap(),
                  now: now,
                ),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    // The dialog reads the authority projection asynchronously (a real
    // SQLite read); the fake clock does not advance it, so let the real
    // work run and paint again.
    await tester.runAsync(() async {
      await Future<void>.delayed(const Duration(milliseconds: 400));
    });
    await tester.pumpAndSettle();
  }

  testWidgets(
    'the SWAP copy names what leaves, what enters and the inherited quantity',
    (tester) async {
      await pumpDialog(tester);

      expect(
        find.text(
          'No se consume R23 Leche entera; '
          'entran 150 ml de Leche de Almondras en su lugar.',
        ),
        findsOneWidget,
      );
      expect(find.text('150 ml (heredada de la receta)'), findsOneWidget);
    },
  );

  testWidgets(
    'the quantity field starts on the inherited quantity',
    (tester) async {
      await pumpDialog(tester);

      final field = tester.widget<TextField>(
        find.byKey(const Key('modifier_effect_quantity_opt-almendras')),
      );
      expect(
        (field.decoration?.hintText),
        '150',
      );
    },
  );

  testWidgets(
    'the dialog lays out without overflowing (the inherited quantity on '
    'screen used to overflow the option row)',
    (tester) async {
      await pumpDialog(tester);

      // A RenderFlex overflow is reported as a test failure; this test
      // simply proves the dialog paints clean with the facts on screen.
      expect(tester.takeException(), isNull);
      expect(find.text('Almendras (+C\$ 20)'), findsOneWidget);
    },
  );

  testWidgets(
    'the quantity field carries an accessible name (Nhilos POS §46)',
    (tester) async {
      await pumpDialog(tester);

      final semantics = tester.getSemantics(
        find.byKey(const Key('modifier_effect_quantity_opt-almendras')),
      );
      expect(semantics.label, contains('Cantidad a aplicar'));
    },
  );

  testWidgets(
    'the dialog shows the inherited quantity of a version published minutes '
    'ago (the authority is read in UTC)',
    (tester) async {
      // The rig's shape: the version became effective at 03:46:35Z and the
      // terminal read it at 04:00:00Z. Compared in the LOCAL frame the
      // version looked "not yet in force" and the operator lost the
      // inherited quantity AND the insumo's name.
      final dao = database.authorityProjectionDao;
      // The real SQLite read must run in the REAL async zone: inside the
      // test's fake clock it would never complete.
      await tester.runAsync(() async {
        await dao.insertRecipeVersion(
        const AuthorityRecipeVersionEntity(
          tenantId: 'tenant-1',
          id: 'ver-2',
          productId: 'p-1',
          versionNumber: 2,
          isActive: true,
          publicationState: 'PUBLISHED',
          effectiveFrom: '2026-10-20T03:46:35.999Z',
          yieldQuantity: 1.0,
          technicalShrinkPct: 0.0,
          createdAt: '2026-10-20T03:46:35.999Z',
          updatedAt: '2026-10-20T03:46:35.999Z',
        ),
        );
        await dao.insertComponent(
          const AuthorityRecipeVersionComponentEntity(
            tenantId: 'tenant-1',
            id: 'comp-2',
            versionId: 'ver-2',
            ordinal: 0,
            insumoId: 'insumo-leche',
            grossQuantity: 150,
            technicalShrinkPct: 0,
            ingredientType: 'INSUMO',
            componentName: 'R23 Leche entera',
            componentUom: 'ml',
          ),
        );
      });

      await pumpDialog(tester, now: DateTime.utc(2026, 10, 20, 4));

      expect(find.text('150 ml (heredada de la receta)'), findsOneWidget);
    },
  );

  testWidgets(
    'mismatched units ask for the quantity instead of announcing a number '
    'that will not be applied',
    (tester) async {
      // The rig's V9: the option adds almond milk (ml) but the component
      // it targets is coffee (g). The resolver refuses the inherited
      // number, so the copy must not announce "18 g".
      final dao = database.authorityProjectionDao;
      await tester.runAsync(() async {
        await dao.insertRecipeVersion(
        const AuthorityRecipeVersionEntity(
          tenantId: 'tenant-1',
          id: 'ver-3',
          productId: 'p-2',
          versionNumber: 1,
          isActive: true,
          publicationState: 'PUBLISHED',
          effectiveFrom: '2026-01-01T00:00:00Z',
          yieldQuantity: 1.0,
          technicalShrinkPct: 0.0,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        ),
        );
        await dao.insertComponent(
          const AuthorityRecipeVersionComponentEntity(
            tenantId: 'tenant-1',
            id: 'comp-3',
            versionId: 'ver-3',
            ordinal: 0,
            insumoId: 'insumo-cafe',
            grossQuantity: 18,
            technicalShrinkPct: 0,
            ingredientType: 'INSUMO',
            componentName: 'R23 Cafe en grano',
            componentUom: 'g',
          ),
        );
      });

      await pumpDialog(tester, product: productWithMismatchedUnits());

      expect(
        find.text(
          'No se puede heredar la cantidad: Leche de Almondras se mide en ml '
          'y el componente de la receta en g. Marque la cantidad a aplicar.',
        ),
        findsOneWidget,
      );
      final field = tester.widget<TextField>(
        find.byKey(const Key('modifier_effect_quantity_opt-almendra-extra')),
      );
      expect(field.decoration?.hintText, 'ml');
    },
  );
}
