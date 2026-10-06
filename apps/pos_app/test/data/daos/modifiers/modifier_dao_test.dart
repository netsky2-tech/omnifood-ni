import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/modifiers/modifier_group_entity.dart';
import 'package:pos_app/data/models/modifiers/modifier_option_entity.dart';
import 'package:pos_app/data/models/modifiers/category_modifier_group_entity.dart';
import 'package:pos_app/data/models/modifiers/product_modifier_group_entity.dart';

void main() {
  late AppDatabase database;

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  setUp(() async {
    database = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();
  });

  tearDown(() async {
    await database.close();
  });

  ModifierGroupEntity groupRow(
    String id, {
    String name = 'Leche',
    int minSelected = 0,
    int maxSelected = 1,
    bool allowQuantities = false,
    int sortOrder = 0,
    bool isActive = true,
  }) =>
      ModifierGroupEntity(
        id: id,
        name: name,
        minSelected: minSelected,
        maxSelected: maxSelected,
        allowQuantities: allowQuantities,
        sortOrder: sortOrder,
        isActive: isActive,
      );

  ModifierOptionEntity optionRow(
    String id,
    String groupId, {
    String name = 'Entera',
    double priceDelta = 0.0,
    bool isDefault = false,
    int sortOrder = 0,
    bool isActive = true,
  }) =>
      ModifierOptionEntity(
        id: id,
        groupId: groupId,
        name: name,
        priceDelta: priceDelta,
        isDefault: isDefault,
        sortOrder: sortOrder,
        isActive: isActive,
      );

  group('ModifierDao - full-snapshot replace-all (T2.2)', () {
    test('replace-all removes rows absent from the snapshot (hard-delete propagation)', () async {
      final dao = database.modifierDao;
      await dao.replaceAllModifierData(
        [groupRow('grp-1'), groupRow('grp-2', name: 'Endulzante')],
        [optionRow('opt-1', 'grp-1'), optionRow('opt-2', 'grp-2', name: 'Azúcar')],
        [],
        [],
      );

      // New snapshot drops grp-2 and its option: the replace-all must make
      // them GONE, not just upsert the survivors.
      await dao.replaceAllModifierData(
        [groupRow('grp-1')],
        [optionRow('opt-1', 'grp-1')],
        [],
        [],
      );

      final groups = await dao.getAllModifierGroups();
      expect(groups.map((g) => g.id), ['grp-1']);
      final options = await dao.getAllModifierOptions();
      expect(options.map((o) => o.id), ['opt-1']);
    });

    test('inactive tombstones persist through the snapshot', () async {
      final dao = database.modifierDao;
      await dao.replaceAllModifierData(
        [
          groupRow('grp-1'),
          groupRow('grp-gone', name: 'Eliminado', isActive: false),
        ],
        [
          optionRow('opt-1', 'grp-1'),
          optionRow('opt-gone', 'grp-1', name: 'Vieja', isActive: false),
        ],
        [],
        [],
      );

      final groups = await dao.getAllModifierGroups();
      expect(groups.map((g) => g.id), contains('grp-gone'));
      expect(
        groups.firstWhere((g) => g.id == 'grp-gone').isActive,
        false,
      );
      final options = await dao.getAllModifierOptions();
      expect(
        options.firstWhere((o) => o.id == 'opt-gone').isActive,
        false,
      );
    });

    test('options replace together with their groups and a group with no options reads empty', () async {
      final dao = database.modifierDao;
      await dao.replaceAllModifierData(
        [groupRow('grp-1')],
        [
          optionRow('opt-1', 'grp-1', name: 'Vieja'),
          optionRow('opt-stale', 'grp-1', name: 'Huérfana'),
        ],
        [],
        [],
      );

      await dao.replaceAllModifierData(
        [groupRow('grp-1', name: 'Leche Nueva')],
        [optionRow('opt-2', 'grp-1', name: 'Nueva', priceDelta: 5.5, isDefault: true)],
        [],
        [],
      );

      final options = await dao.getAllModifierOptions();
      expect(options.map((o) => o.id), ['opt-2']);
      expect(options.first.priceDelta, 5.5);
      expect(options.first.isDefault, true);

      // A group with no options: the mirror keeps it, with zero options.
      await dao.replaceAllModifierData(
        [groupRow('grp-1'), groupRow('grp-empty', name: 'Vacío')],
        [],
        [],
        [],
      );
      final groups = await dao.getAllModifierGroups();
      expect(groups.map((g) => g.id), contains('grp-empty'));
      expect(await dao.getAllModifierOptions(), isEmpty);
    });

    test('category and product attachments replace independently and read by their keys', () async {
      final dao = database.modifierDao;
      await dao.replaceAllModifierData(
        [groupRow('grp-1'), groupRow('grp-2', name: 'Extras')],
        [],
        [
          CategoryModifierGroupEntity(
            id: 'catt-1',
            catalogValueId: 'cat-bebidas',
            catalogCode: 'BEBIDAS',
            groupId: 'grp-1',
            sortOrder: 0,
          ),
        ],
        [
          ProductModifierGroupEntity(
            id: 'patt-1',
            productId: 'prod-1',
            groupId: 'grp-2',
            sortOrder: 1,
          ),
        ],
      );

      final byCategory =
          await dao.getCategoryAttachmentsByCatalogValue('cat-bebidas');
      expect(byCategory, hasLength(1));
      expect(byCategory.first.catalogCode, 'BEBIDAS');
      expect(byCategory.first.groupId, 'grp-1');

      final byProduct = await dao.getProductAttachmentsByProduct('prod-1');
      expect(byProduct, hasLength(1));
      expect(byProduct.first.groupId, 'grp-2');

      // A new snapshot detaches the category attachment (hard delete on the
      // backend): replace-all makes it disappear while the product
      // attachment survives.
      await dao.replaceAllModifierData(
        [groupRow('grp-1'), groupRow('grp-2', name: 'Extras')],
        [],
        [],
        [
          ProductModifierGroupEntity(
            id: 'patt-1',
            productId: 'prod-1',
            groupId: 'grp-2',
            sortOrder: 1,
          ),
        ],
      );
      expect(
        await dao.getCategoryAttachmentsByCatalogValue('cat-bebidas'),
        isEmpty,
      );
      expect(await dao.getProductAttachmentsByProduct('prod-1'), hasLength(1));
    });

    test('reads are ordered deterministically (sort_order, name, id)', () async {
      final dao = database.modifierDao;
      await dao.replaceAllModifierData(
        [
          groupRow('grp-b', name: 'B', sortOrder: 1),
          groupRow('grp-c', name: 'A', sortOrder: 1),
          groupRow('grp-a', name: 'Z', sortOrder: 0),
        ],
        [
          optionRow('opt-b', 'grp-b', name: 'B', sortOrder: 1),
          optionRow('opt-a', 'grp-b', name: 'A', sortOrder: 1),
          optionRow('opt-c', 'grp-b', name: 'C', sortOrder: 0),
        ],
        [],
        [],
      );

      final groups = await dao.getAllModifierGroups();
      expect(groups.map((g) => g.id).toList(), [
        'grp-a',
        'grp-c',
        'grp-b',
      ]);
      final options = await dao.getAllModifierOptions();
      expect(options.map((o) => o.id).toList(), [
        'opt-c',
        'opt-a',
        'opt-b',
      ]);
    });
  });
}
