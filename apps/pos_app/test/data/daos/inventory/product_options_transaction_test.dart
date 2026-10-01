import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/inventory/product_entity.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

/// B4a (go-live plan G4): `replaceProductOptions` must run the variant and
/// modifier replacement inside ONE Floor `@transaction`.
///
/// The corruption it prevents: if the deletes commit and a later insert
/// throws (constraint, disk full, invalid data), the product's existing
/// options are silently emptied on a single terminal. With the transaction,
/// the deletes roll back and the previous options survive.
///
/// Note on Foreign Keys: SQLite ships with `foreign_keys=OFF` by default, so
/// the FK on `product_variants.product_id` would not fail the insert on its
/// own. The rollback test turns the pragma on for the connection (same
/// pattern as `identity_sales_migrations_test.dart`) to get a deterministic
/// mid-transaction failure: a variant referencing a nonexistent product.
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

  Future<void> seedProduct(String productId) async {
    await database.productDao.insertProducts([
      ProductEntity(
        id: productId,
        name: 'Latte',
        uom: 'unid',
        stock: 10,
        averageCost: 20,
        sellPrice: 55,
      ),
    ]);
  }

  List<ProductVariantEntity> seedVariants(String productId) => [
        ProductVariantEntity(
          id: 'var-old-1',
          productId: productId,
          name: 'Chico',
          priceAdjustment: 0,
        ),
        ProductVariantEntity(
          id: 'var-old-2',
          productId: productId,
          name: 'Grande',
          priceAdjustment: 15,
        ),
      ];

  List<ProductModifierEntity> seedModifiers(String productId) => [
        ProductModifierEntity(
          id: 'mod-old-1',
          productId: productId,
          name: 'Leche de almendra',
          extraPrice: 12,
        ),
      ];

  group('ProductDao.replaceProductOptions', () {
    test('replaces variants and modifiers atomically (happy path)',
        () async {
      const productId = 'prod-1';
      await seedProduct(productId);
      await database.productDao
          .insertVariants(seedVariants(productId));
      await database.productDao
          .insertModifiers(seedModifiers(productId));

      await database.productDao.replaceProductOptions(
        productId,
        [
          ProductVariantEntity(
            id: 'var-new-1',
            productId: productId,
            name: 'Doble',
            priceAdjustment: 20,
          ),
        ],
        [
          ProductModifierEntity(
            id: 'mod-new-1',
            productId: productId,
            name: 'Shot extra',
            extraPrice: 10,
          ),
        ],
      );

      final variants =
          await database.productDao.findVariantsByProductId(productId);
      final modifiers =
          await database.productDao.findModifiersByProductId(productId);

      expect(variants, hasLength(1));
      expect(variants.single.id, 'var-new-1');
      expect(variants.single.name, 'Doble');
      expect(modifiers, hasLength(1));
      expect(modifiers.single.id, 'mod-new-1');
      expect(modifiers.single.name, 'Shot extra');
    });

    test('empty variant/modifier lists clear the options deliberately',
        () async {
      const productId = 'prod-2';
      await seedProduct(productId);
      await database.productDao
          .insertVariants(seedVariants(productId));
      await database.productDao
          .insertModifiers(seedModifiers(productId));

      await database.productDao.replaceProductOptions(
        productId,
        const [],
        const [],
      );

      expect(
        await database.productDao.findVariantsByProductId(productId),
        isEmpty,
      );
      expect(
        await database.productDao.findModifiersByProductId(productId),
        isEmpty,
      );
    });

    test('rolls back: a failing insert PRESERVES previous options',
        () async {
      const productId = 'prod-3';
      await seedProduct(productId);
      await database.productDao
          .insertVariants(seedVariants(productId));
      await database.productDao
          .insertModifiers(seedModifiers(productId));

      // Deterministic mid-transaction failure: the new variant references a
      // product that does not exist, so the insert violates the FK.
      await database.database.execute('PRAGMA foreign_keys = ON');

      await expectLater(
        database.productDao.replaceProductOptions(
          productId,
          [
            ProductVariantEntity(
              id: 'var-orphan',
              productId: 'prod-does-not-exist',
              name: 'Fantasma',
              priceAdjustment: 0,
            ),
          ],
          [
            ProductModifierEntity(
              id: 'mod-new-3',
              productId: productId,
              name: 'Nunca debe sobrevivir',
              extraPrice: 5,
            ),
          ],
        ),
        throwsA(isA<Exception>()),
      );

      // Without the @transaction, the two deletes would already have
      // committed when the insert threw, and the original options would be
      // gone. The atomic rollback must restore BOTH tables.
      final variants =
          await database.productDao.findVariantsByProductId(productId);
      final modifiers =
          await database.productDao.findModifiersByProductId(productId);

      expect(
        variants.map((v) => v.id).toSet(),
        {'var-old-1', 'var-old-2'},
        reason:
            'the delete of variants must roll back when the insert fails',
      );
      expect(
        modifiers.map((m) => m.id).toSet(),
        {'mod-old-1'},
        reason:
            'the delete of modifiers must roll back when the insert fails',
      );
    });
  });
}
