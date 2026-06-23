import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/catalog/catalog_value_entity.dart';

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

  group('CatalogValueDao (offline master catalog cache)', () {
    test('findActiveByType returns active rows ordered by sort_order then name', () async {
      await database.catalogValueDao.insertCatalogValues([
        CatalogValueEntity(id: '1', catalogType: 'UOM', code: 'gal', name: 'Galón', sortOrder: 6),
        CatalogValueEntity(id: '2', catalogType: 'UOM', code: 'kg', name: 'Kilogramo', sortOrder: 0),
        CatalogValueEntity(id: '3', catalogType: 'UOM', code: 'g', name: 'Gramo', sortOrder: 1),
        CatalogValueEntity(id: '4', catalogType: 'UOM', code: 'oz', name: 'Onza', sortOrder: 3, isActive: false),
      ]);

      final active = await database.catalogValueDao.findActiveByType('UOM');
      expect(active.map((e) => e.code).toList(), ['kg', 'g', 'gal']);
      expect(active.every((e) => e.isActive), isTrue);
    });

    test('findAllByType includes inactive rows', () async {
      await database.catalogValueDao.insertCatalogValues([
        CatalogValueEntity(id: '1', catalogType: 'INVENTORY_TYPE', code: 'MATERIA_PRIMA', name: 'Materia prima', sortOrder: 0),
        CatalogValueEntity(id: '2', catalogType: 'INVENTORY_TYPE', code: 'OLD', name: 'Old', sortOrder: 9, isActive: false),
      ]);

      final all = await database.catalogValueDao.findAllByType('INVENTORY_TYPE');
      expect(all.length, 2);
    });

    test('findByTypeAndCode resolves a single value scoped by type+code', () async {
      await database.catalogValueDao.insertCatalogValues([
        CatalogValueEntity(id: '1', catalogType: 'UOM', code: 'kg', name: 'Kilogramo'),
        CatalogValueEntity(id: '2', catalogType: 'SALES_PRODUCT_TYPE', code: 'PREPARADO', name: 'Preparado'),
      ]);

      final found = await database.catalogValueDao.findByTypeAndCode('UOM', 'kg');
      expect(found?.name, 'Kilogramo');

      final none = await database.catalogValueDao.findByTypeAndCode('UOM', 'PREPARADO');
      expect(none, isNull);
    });

    test('setActive soft-deactivates a value (preserves historical references)', () async {
      await database.catalogValueDao.insertCatalogValues([
        CatalogValueEntity(id: '1', catalogType: 'UOM', code: 'oz', name: 'Onza'),
      ]);

      await database.catalogValueDao.setActive('1', false);
      final active = await database.catalogValueDao.findActiveByType('UOM');
      expect(active, isEmpty);

      final all = await database.catalogValueDao.findAllByType('UOM');
      expect(all.single.isActive, isFalse);
    });

    test('countAll reports total cached catalog rows', () async {
      await database.catalogValueDao.insertCatalogValues([
        CatalogValueEntity(id: '1', catalogType: 'UOM', code: 'kg', name: 'Kilogramo'),
        CatalogValueEntity(id: '2', catalogType: 'UOM', code: 'g', name: 'Gramo'),
      ]);
      expect(await database.catalogValueDao.countAll(), 2);
    });

    test('replace on conflict upserts (sync re-download updates names)', () async {
      await database.catalogValueDao.insertCatalogValues([
        CatalogValueEntity(id: '1', catalogType: 'UOM', code: 'kg', name: 'Kilogramo'),
      ]);
      await database.catalogValueDao.insertCatalogValues([
        CatalogValueEntity(id: '1', catalogType: 'UOM', code: 'kg', name: 'Kilo', sortOrder: 5),
      ]);

      final rows = await database.catalogValueDao.findActiveByType('UOM');
      expect(rows.single.name, 'Kilo');
      expect(rows.single.sortOrder, 5);
    });
  });
}
