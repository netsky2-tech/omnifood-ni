import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/sales/restaurant_area_entity.dart';
import 'package:pos_app/data/models/sales/restaurant_table_entity.dart';
import 'package:pos_app/domain/models/sales/cart_item.dart';
import 'package:pos_app/domain/services/sales/table_order_service.dart';

void main() {
  late AppDatabase database;
  late TableOrderService tableOrderService;

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  setUp(() async {
    database = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();
    tableOrderService = TableOrderService(database);

    // 1. Seed area first for foreign key integrity
    await database.restaurantAreaDao.insertAreas([
      RestaurantAreaEntity(
        id: 'area-main',
        name: 'Salón Principal',
        displayOrder: 1,
      ),
    ]);

    // 2. Seed tables
    await database.restaurantTableDao.insertTables([
      RestaurantTableEntity(
        id: 'tbl-1',
        areaId: 'area-main',
        tableNumber: 'Mesa 1',
        capacity: 4,
        status: 'DISPONIBLE',
      ),
      RestaurantTableEntity(
        id: 'tbl-2',
        areaId: 'area-main',
        tableNumber: 'Mesa 2',
        capacity: 6,
        status: 'DISPONIBLE',
      ),
      RestaurantTableEntity(
        id: 'tbl-3',
        areaId: 'area-main',
        tableNumber: 'Mesa 3',
        capacity: 4,
        status: 'DISPONIBLE',
      ),
    ]);
  });

  tearDown(() async {
    await database.close();
  });

  group('TableOrderService - Transfer, Merge & Concurrency Safeguards', () {
    const itemPizza = CartItem(
      productId: 'p-pizza',
      productName: 'Pizza Familiar',
      unitPrice: 300.0,
      quantity: 1,
      taxRate: 0.15,
    );

    const itemBeer = CartItem(
      productId: 'p-beer',
      productName: 'Toña 350ml',
      unitPrice: 60.0,
      quantity: 4,
      taxRate: 0.15,
    );

    test('Case 1: Transferring a table order releases source table and occupies target table', () async {
      // 1. Park order on Mesa 1
      final ticket1 = await tableOrderService.parkOrder(
        name: 'Mesa 1',
        tableId: 'tbl-1',
        areaId: 'area-main',
        waiterId: 'u-waiter-1',
        waiterName: 'Carlos Mesero',
        guestCount: 3,
        items: [itemPizza],
      );

      final tbl1Before = await database.restaurantTableDao.getTableById('tbl-1');
      expect(tbl1Before?.status, 'OCUPADA');
      expect(tbl1Before?.currentTicketId, ticket1.id);

      // 2. Transfer to Mesa 2
      final transferredTicket = await tableOrderService.transferOrder(
        ticketId: ticket1.id,
        sourceTableId: 'tbl-1',
        targetTableId: 'tbl-2',
      );

      expect(transferredTicket.tableId, 'tbl-2');

      // 3. Verify Table 1 is released and Table 2 is occupied
      final tbl1After = await database.restaurantTableDao.getTableById('tbl-1');
      final tbl2After = await database.restaurantTableDao.getTableById('tbl-2');

      expect(tbl1After?.status, 'DISPONIBLE');
      expect(tbl1After?.currentTicketId, isNull);

      expect(tbl2After?.status, 'OCUPADA');
      expect(tbl2After?.currentTicketId, ticket1.id);
    });

    test('Case 2: Merging Mesa 1 into Mesa 2 combines items and deletes source ticket', () async {
      // 1. Park order on Mesa 1
      final ticket1 = await tableOrderService.parkOrder(
        name: 'Mesa 1',
        tableId: 'tbl-1',
        areaId: 'area-main',
        items: [itemPizza],
      );

      // 2. Park order on Mesa 2
      final ticket2 = await tableOrderService.parkOrder(
        name: 'Mesa 2',
        tableId: 'tbl-2',
        areaId: 'area-main',
        items: [itemBeer],
      );

      // 3. Merge Mesa 1 into Mesa 2
      final mergedTicket = await tableOrderService.mergeOrders(
        sourceTicketId: ticket1.id,
        targetTicketId: ticket2.id,
        targetExpectedVersion: ticket2.version,
      );

      expect(mergedTicket.id, ticket2.id);
      expect(mergedTicket.items.length, 2);
      expect(mergedTicket.version, ticket2.version + 1);

      // Verify Table 1 is released and its hold ticket deleted
      final tbl1 = await database.restaurantTableDao.getTableById('tbl-1');
      expect(tbl1?.status, 'DISPONIBLE');

      final deletedTicket = await tableOrderService.getOrderById(ticket1.id);
      expect(deletedTicket, isNull);
    });

    test('Case 3: Optimistic lock triggers when merge target version does not match', () async {
      final ticket1 = await tableOrderService.parkOrder(
        name: 'Mesa 1',
        tableId: 'tbl-1',
        items: [itemPizza],
      );

      final ticket2 = await tableOrderService.parkOrder(
        name: 'Mesa 2',
        tableId: 'tbl-2',
        items: [itemBeer],
      );

      // Pass outdated version (e.g. version 99)
      expect(
        () => tableOrderService.mergeOrders(
          sourceTicketId: ticket1.id,
          targetTicketId: ticket2.id,
          targetExpectedVersion: 99,
        ),
        throwsA(isA<OptimisticLockException>()),
      );
    });
  });
}
