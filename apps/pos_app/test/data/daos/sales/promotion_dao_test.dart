import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/sales/promotion_entity.dart';
import 'package:pos_app/data/mappers/sales_mapper.dart';
import 'package:pos_app/domain/models/sales/promotion.dart';

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

  group('PromotionDao - Floor SQLite Integration Tests', () {
    test('inserta, recupera por prioridad y filtra promociones activas', () async {
      final p1 = PromotionEntity(
        id: 'p-1',
        name: 'Promo 10% Bebidas',
        type: 'percentageDiscount',
        targetCategoryId: 'Bebidas',
        discountValue: 10.0,
        priority: 5,
        isActive: true,
      );

      final p2 = PromotionEntity(
        id: 'p-2',
        name: '2x1 Cerveza',
        type: 'buyXGetYFree',
        targetProductId: 'prod-beer',
        buyQuantity: 1,
        getQuantity: 1,
        priority: 10, // Mayor prioridad
        isActive: true,
      );

      final pInactive = PromotionEntity(
        id: 'p-3',
        name: 'Promo Inactiva',
        type: 'fixedDiscount',
        targetProductId: 'prod-other',
        discountValue: 20.0,
        priority: 1,
        isActive: false,
      );

      await database.promotionDao.savePromotions([p1, p2, pInactive]);

      final activeList = await database.promotionDao.getActivePromotions();
      expect(activeList.length, equals(2));
      // Debe venir ordenado por prioridad DESC (primero p-2 con prioridad 10)
      expect(activeList.first.id, equals('p-2'));
      expect(activeList.last.id, equals('p-1'));
    });

    test('filtra promociones por target_product_id y target_category_id', () async {
      final pProduct = PromotionEntity(
        id: 'p-prod',
        name: 'Descuento Hamburguesa',
        type: 'fixedDiscount',
        targetProductId: 'prod-burger',
        discountValue: 25.0,
        isActive: true,
      );

      final pCat = PromotionEntity(
        id: 'p-cat',
        name: 'Descuento Comida',
        type: 'percentageDiscount',
        targetCategoryId: 'Comida',
        discountValue: 15.0,
        isActive: true,
      );

      await database.promotionDao.savePromotion(pProduct);
      await database.promotionDao.savePromotion(pCat);

      final byProduct = await database.promotionDao.getPromotionsByProduct('prod-burger');
      expect(byProduct.length, equals(1));
      expect(byProduct.first.name, equals('Descuento Hamburguesa'));

      final byCat = await database.promotionDao.getPromotionsByCategory('Comida');
      expect(byCat.length, equals(1));
      expect(byCat.first.name, equals('Descuento Comida'));
    });

    test('SalesMapper convierte bidireccionalmente todos los campos de Promotion', () {
      final domain = const Promotion(
        id: 'p-full',
        name: 'Happy Hour Viernes y Sábados',
        type: PromotionType.buyXGetYFree,
        targetProductId: 'prod-cocktail',
        targetCategoryId: 'Licores',
        buyQuantity: 1,
        getQuantity: 1,
        discountValue: 0.0,
        minOrderAmount: 200.0,
        daysOfWeek: [5, 6],
        startTime: '18:00',
        endTime: '21:00',
        startDate: 1760000000000,
        endDate: 1770000000000,
        priority: 8,
        isStackable: false,
        isActive: true,
      );

      final entity = SalesMapper.toPromotionEntity(domain);
      expect(entity.id, equals('p-full'));
      expect(entity.daysOfWeek, equals('5,6'));
      expect(entity.startTime, equals('18:00'));
      expect(entity.endTime, equals('21:00'));
      expect(entity.isStackable, isFalse);

      final roundtrip = SalesMapper.toPromotionDomain(entity);
      expect(roundtrip, equals(domain));
    });
  });
}
