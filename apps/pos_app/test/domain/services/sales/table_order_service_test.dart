import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/sales/restaurant_area_entity.dart';
import 'package:pos_app/data/models/sales/restaurant_table_entity.dart';
import 'package:pos_app/domain/models/sales/cart_item.dart';
import 'package:pos_app/domain/models/sales/hold_ticket.dart';
import 'package:pos_app/domain/models/inventory/product.dart';
import 'package:pos_app/domain/services/sales/table_order_service.dart';

void main() {
  late AppDatabase database;
  late TableOrderService service;

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  setUp(() async {
    database = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();
    service = TableOrderService(database);

    // Seed area and tables
    await database.restaurantAreaDao.insertArea(
      RestaurantAreaEntity(id: 'area-1', name: 'Salón Principal', displayOrder: 1),
    );
    await database.restaurantTableDao.insertTables([
      RestaurantTableEntity(id: 'tbl-1', areaId: 'area-1', tableNumber: 'Mesa 1', capacity: 4),
      RestaurantTableEntity(id: 'tbl-2', areaId: 'area-1', tableNumber: 'Mesa 2', capacity: 6),
      RestaurantTableEntity(id: 'tbl-3', areaId: 'area-1', tableNumber: 'Mesa 3', capacity: 2),
    ]);
  });

  tearDown(() async {
    await database.close();
  });

  final burgerItem = CartItem(
    productId: 'prod-burger',
    productName: 'Hamburguesa Clásica',
    quantity: 2,
    unitPrice: 180.0,
    taxRate: 0.15,
    selectedModifiers: [
      Modifier(id: 'mod-bacon', name: 'Tocineta', extraPrice: 35.0),
    ],
  );

  final cokeItem = CartItem(
    productId: 'prod-coke',
    productName: 'Coca Cola 500ml',
    quantity: 2,
    unitPrice: 40.0,
    taxRate: 0.15,
  );

  group('TableOrderService - Hold & Resume (Slice 4.2)', () {
    test('parkOrder creates hold ticket and marks table as OCUPADA', () async {
      final ticket = await service.parkOrder(
        tableId: 'tbl-1',
        areaId: 'area-1',
        name: 'Mesa 1 - Juan',
        waiterId: 'usr-10',
        waiterName: 'Mesero Mario',
        guestCount: 3,
        items: [burgerItem, cokeItem],
      );

      expect(ticket.id, isNotEmpty);
      expect(ticket.version, 1);
      expect(ticket.items.length, 2);

      // Verify table state in SQLite
      final table = await database.restaurantTableDao.getTableById('tbl-1');
      expect(table?.status, 'OCUPADA');
      expect(table?.currentTicketId, ticket.id);
      expect(table?.activeGuests, 3);
      expect(table?.openedAt, isNotNull);

      // Resume order
      final resumed = await service.getOrderByTableId('tbl-1');
      expect(resumed, isNotNull);
      expect(resumed?.id, ticket.id);
      expect(resumed?.items.first.selectedModifiers.first.name, 'Tocineta');
    });

    test('parkOrder without table acts as normal named hold ticket', () async {
      final ticket = await service.parkOrder(
        name: 'Cliente Para Llevar - Ana',
        items: [burgerItem],
      );

      expect(ticket.tableId, isNull);
      expect(ticket.version, 1);

      final retrieved = await service.getOrderById(ticket.id);
      expect(retrieved?.name, 'Cliente Para Llevar - Ana');
    });
  });

  group('TableOrderService - Optimistic Locking & Append Items (Slice 4.2)', () {
    test('appendItems increases version and updates total items', () async {
      final initialTicket = await service.parkOrder(
        tableId: 'tbl-2',
        name: 'Mesa 2',
        items: [burgerItem],
      );

      final updatedTicket = await service.appendItemsToOrder(
        ticketId: initialTicket.id,
        newItems: [cokeItem],
        expectedVersion: 1,
      );

      expect(updatedTicket.version, 2);
      expect(updatedTicket.items.length, 2);

      final reloaded = await service.getOrderById(initialTicket.id);
      expect(reloaded?.version, 2);
      expect(reloaded?.items.length, 2);
    });

    test('throws OptimisticLockException when expectedVersion does not match', () async {
      final initialTicket = await service.parkOrder(
        tableId: 'tbl-2',
        name: 'Mesa 2',
        items: [burgerItem],
      );

      // Simulate terminal A updating the ticket to version 2
      await service.appendItemsToOrder(
        ticketId: initialTicket.id,
        newItems: [cokeItem],
        expectedVersion: 1,
      );

      // Terminal B attempts to update using stale version 1
      expect(
        () => service.appendItemsToOrder(
          ticketId: initialTicket.id,
          newItems: [burgerItem],
          expectedVersion: 1,
        ),
        throwsA(isA<OptimisticLockException>()),
      );
    });
  });

  group('TableOrderService - Merge Orders (Slice 4.2)', () {
    test('mergeOrders combines items from source to target and releases source table', () async {
      final ticketMesa1 = await service.parkOrder(
        tableId: 'tbl-1',
        name: 'Mesa 1',
        items: [burgerItem],
      );

      final ticketMesa2 = await service.parkOrder(
        tableId: 'tbl-2',
        name: 'Mesa 2',
        items: [cokeItem],
      );

      final mergedTicket = await service.mergeOrders(
        sourceTicketId: ticketMesa1.id,
        targetTicketId: ticketMesa2.id,
        targetExpectedVersion: 1,
      );

      expect(mergedTicket.id, ticketMesa2.id);
      expect(mergedTicket.items.length, 2);
      expect(mergedTicket.version, 2);

      // Source ticket should be deleted
      final sourceCheck = await service.getOrderById(ticketMesa1.id);
      expect(sourceCheck, isNull);

      // Table 1 should be released to DISPONIBLE
      final table1 = await database.restaurantTableDao.getTableById('tbl-1');
      expect(table1?.status, 'DISPONIBLE');
      expect(table1?.currentTicketId, isNull);

      // Table 2 remains OCUPADA with ticketMesa2
      final table2 = await database.restaurantTableDao.getTableById('tbl-2');
      expect(table2?.status, 'OCUPADA');
      expect(table2?.currentTicketId, ticketMesa2.id);
    });
  });

  group('TableOrderService - Split Order (Slice 4.2)', () {
    test('splitOrderItems moves selected items to new table and updates source ticket', () async {
      final originalTicket = await service.parkOrder(
        tableId: 'tbl-1',
        name: 'Mesa 1',
        items: [burgerItem, cokeItem],
      );

      final splitResult = await service.splitOrderItems(
        sourceTicketId: originalTicket.id,
        itemsToMove: [cokeItem],
        targetTableId: 'tbl-3',
        targetName: 'Mesa 3 (Split de Mesa 1)',
        sourceExpectedVersion: 1,
      );

      // New ticket created on Table 3
      expect(splitResult.newTicket.tableId, 'tbl-3');
      expect(splitResult.newTicket.items.length, 1);
      expect(splitResult.newTicket.items.first.productName, 'Coca Cola 500ml');

      // Table 3 is now OCUPADA
      final table3 = await database.restaurantTableDao.getTableById('tbl-3');
      expect(table3?.status, 'OCUPADA');
      expect(table3?.currentTicketId, splitResult.newTicket.id);

      // Source ticket on Table 1 is updated (version 2, only burger remaining)
      expect(splitResult.updatedSourceTicket.version, 2);
      expect(splitResult.updatedSourceTicket.items.length, 1);
      expect(splitResult.updatedSourceTicket.items.first.productName, 'Hamburguesa Clásica');

      final reloadedSource = await service.getOrderById(originalTicket.id);
      expect(reloadedSource?.items.length, 1);
    });
  });

  group('TableOrderService - Liquidate & Release Order (Slice 4.2)', () {
    test('liquidateOrder removes hold ticket and releases associated table', () async {
      final ticket = await service.parkOrder(
        tableId: 'tbl-1',
        name: 'Mesa 1',
        items: [burgerItem],
      );

      await service.liquidateOrder(ticket.id);

      final checkTicket = await service.getOrderById(ticket.id);
      expect(checkTicket, isNull);

      final table = await database.restaurantTableDao.getTableById('tbl-1');
      expect(table?.status, 'DISPONIBLE');
      expect(table?.currentTicketId, isNull);
    });
  });
}
