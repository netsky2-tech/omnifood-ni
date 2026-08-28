import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/kitchen/kitchen_order_entity.dart';
import 'package:pos_app/data/models/kitchen/kitchen_order_item_entity.dart';
import 'package:pos_app/data/mappers/kitchen_mapper.dart';
import 'package:pos_app/domain/models/kitchen/kitchen_order.dart';
import 'package:pos_app/domain/models/kitchen/kitchen_order_item.dart';

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

  group('KitchenOrderDao Tests (Slice 5.1)', () {
    test('inserts kitchen order with items and retrieves active orders by station', () async {
      final now = DateTime.now().millisecondsSinceEpoch;

      final kitchenOrder = KitchenOrderEntity(
        id: 'k-ord-1',
        ticketId: 'tick-101',
        tableNumber: 'Mesa 4',
        tableName: 'Mesa 4 - Salón',
        waiterName: 'Carlos M.',
        station: 'COCINA',
        status: 'PENDIENTE',
        createdAt: now,
        notes: 'Alérgico al maní',
      );

      final kitchenItems = [
        KitchenOrderItemEntity(
          id: 'k-item-1',
          kitchenOrderId: 'k-ord-1',
          productId: 'prod-tacos',
          productName: 'Tacos de Res',
          quantity: 2,
          status: 'PENDIENTE',
          modifiersJson: '["Extra Queso","Sin Cebolla"]',
        ),
        KitchenOrderItemEntity(
          id: 'k-item-2',
          kitchenOrderId: 'k-ord-1',
          productId: 'prod-quesadilla',
          productName: 'Quesadilla Mixta',
          quantity: 1,
          status: 'PENDIENTE',
        ),
      ];

      final barOrder = KitchenOrderEntity(
        id: 'k-ord-2',
        ticketId: 'tick-101',
        tableNumber: 'Mesa 4',
        tableName: 'Mesa 4 - Salón',
        waiterName: 'Carlos M.',
        station: 'BARRA',
        status: 'PENDIENTE',
        createdAt: now + 100,
      );

      final barItems = [
        KitchenOrderItemEntity(
          id: 'k-item-3',
          kitchenOrderId: 'k-ord-2',
          productId: 'prod-mojito',
          productName: 'Mojito Tradicional',
          quantity: 2,
          status: 'PENDIENTE',
        ),
      ];

      // Save using atomic transaction
      await database.kitchenOrderDao.saveKitchenOrder(kitchenOrder, kitchenItems);
      await database.kitchenOrderDao.saveKitchenOrder(barOrder, barItems);

      // Query by station
      final cocinaOrders = await database.kitchenOrderDao.getActiveOrdersByStation('COCINA', 'ENTREGADO');
      expect(cocinaOrders.length, 1);
      expect(cocinaOrders.first.id, 'k-ord-1');
      expect(cocinaOrders.first.tableNumber, 'Mesa 4');

      final cocinaItems = await database.kitchenOrderDao.getItemsForOrder('k-ord-1');
      expect(cocinaItems.length, 2);
      expect(cocinaItems.first.modifiersJson, contains('Extra Queso'));

      final barraOrders = await database.kitchenOrderDao.getActiveOrdersByStation('BARRA', 'ENTREGADO');
      expect(barraOrders.length, 1);
      expect(barraOrders.first.id, 'k-ord-2');

      // Query all active
      final allActive = await database.kitchenOrderDao.getActiveOrders('ENTREGADO');
      expect(allActive.length, 2);
    });

    test('lifecycle: PENDIENTE -> EN_PREPARACION -> LISTO -> ENTREGADO with timestamps', () async {
      final createdAt = DateTime.now().millisecondsSinceEpoch;

      final order = KitchenOrderEntity(
        id: 'k-ord-3',
        ticketId: 'tick-102',
        tableNumber: 'Mesa 1',
        station: 'COCINA',
        status: 'PENDIENTE',
        createdAt: createdAt,
      );

      final item = KitchenOrderItemEntity(
        id: 'k-item-4',
        kitchenOrderId: 'k-ord-3',
        productId: 'prod-hamb',
        productName: 'Hamburguesa Doble',
        quantity: 1,
        status: 'PENDIENTE',
      );

      await database.kitchenOrderDao.saveKitchenOrder(order, [item]);

      // 1. Start preparation
      final startedAt = createdAt + 5000;
      await database.kitchenOrderDao.startOrderPreparation('k-ord-3', 'EN_PREPARACION', startedAt);

      var updated = await database.kitchenOrderDao.getOrderById('k-ord-3');
      expect(updated?.status, 'EN_PREPARACION');
      expect(updated?.startedAt, startedAt);

      // 2. Mark item ready
      await database.kitchenOrderDao.updateItemStatus('k-item-4', 'LISTO');
      final items = await database.kitchenOrderDao.getItemsForOrder('k-ord-3');
      expect(items.first.status, 'LISTO');

      // 3. Mark order ready
      final readyAt = startedAt + 12000;
      await database.kitchenOrderDao.updateOrderStatus('k-ord-3', 'LISTO', readyAt);

      updated = await database.kitchenOrderDao.getOrderById('k-ord-3');
      expect(updated?.status, 'LISTO');
      expect(updated?.readyAt, readyAt);

      // 4. Mark order served (Bump)
      final servedAt = readyAt + 3000;
      await database.kitchenOrderDao.markOrderServed('k-ord-3', 'ENTREGADO', servedAt);

      updated = await database.kitchenOrderDao.getOrderById('k-ord-3');
      expect(updated?.status, 'ENTREGADO');
      expect(updated?.servedAt, servedAt);

      // Active orders must no longer return served orders
      final active = await database.kitchenOrderDao.getActiveOrders('ENTREGADO');
      expect(active.any((o) => o.id == 'k-ord-3'), isFalse);
    });

    test('cascade deletion removes order and associated items', () async {
      final now = DateTime.now().millisecondsSinceEpoch;

      final order = KitchenOrderEntity(
        id: 'k-ord-4',
        ticketId: 'tick-103',
        tableNumber: 'Mesa T1',
        station: 'BARRA',
        status: 'PENDIENTE',
        createdAt: now,
      );

      final item = KitchenOrderItemEntity(
        id: 'k-item-5',
        kitchenOrderId: 'k-ord-4',
        productId: 'prod-cerveza',
        productName: 'Cerveza Victoria',
        quantity: 3,
        status: 'PENDIENTE',
      );

      await database.kitchenOrderDao.saveKitchenOrder(order, [item]);

      var retrievedOrder = await database.kitchenOrderDao.getOrderById('k-ord-4');
      var retrievedItems = await database.kitchenOrderDao.getItemsForOrder('k-ord-4');
      expect(retrievedOrder, isNotNull);
      expect(retrievedItems.length, 1);

      // Delete by orderId
      await database.kitchenOrderDao.deleteKitchenOrderWithItems('k-ord-4');

      retrievedOrder = await database.kitchenOrderDao.getOrderById('k-ord-4');
      retrievedItems = await database.kitchenOrderDao.getItemsForOrder('k-ord-4');
      expect(retrievedOrder, isNull);
      expect(retrievedItems, isEmpty);
    });

    test('KitchenMapper converts between domain and entity seamlessly', () {
      final now = DateTime.now();

      final domainOrder = KitchenOrder(
        id: 'dom-1',
        ticketId: 'tick-200',
        tableNumber: 'Mesa 7',
        tableName: 'Mesa VIP',
        waiterName: 'Ana Mesera',
        station: 'COCINA',
        status: 'PENDIENTE',
        createdAt: now,
        startedAt: now.add(const Duration(minutes: 2)),
        readyAt: now.add(const Duration(minutes: 12)),
        notes: 'Término medio',
        items: const [
          KitchenOrderItem(
            id: 'item-dom-1',
            kitchenOrderId: 'dom-1',
            productId: 'p-ribeye',
            productName: 'Ribeye Steak 12oz',
            quantity: 1,
            status: 'PENDIENTE',
            notes: 'Sin sal extra',
            modifiers: ['Papas Fritas', 'Chimichurri'],
          ),
        ],
      );

      final entity = KitchenMapper.toEntity(domainOrder);
      final itemEntities = KitchenMapper.toItemEntities(domainOrder);

      expect(entity.id, 'dom-1');
      expect(entity.ticketId, 'tick-200');
      expect(entity.tableNumber, 'Mesa 7');
      expect(entity.station, 'COCINA');
      expect(itemEntities.length, 1);
      expect(itemEntities.first.modifiersJson, contains('Papas Fritas'));

      final reconstructedDomain = KitchenMapper.toDomain(entity, itemEntities);
      expect(reconstructedDomain.id, domainOrder.id);
      expect(reconstructedDomain.items.length, 1);
      expect(reconstructedDomain.items.first.modifiers, ['Papas Fritas', 'Chimichurri']);
      expect(reconstructedDomain.startedAt?.millisecondsSinceEpoch, domainOrder.startedAt?.millisecondsSinceEpoch);
    });
  });
}
