import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/sales/restaurant_area_entity.dart';
import 'package:pos_app/data/models/sales/restaurant_table_entity.dart';
import 'package:pos_app/data/models/sales/hold_ticket_entity.dart';

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

  group('RestaurantAreaDao & RestaurantTableDao (Slice 4.1)', () {
    test('inserts and retrieves active areas ordered by displayOrder', () async {
      final area1 = RestaurantAreaEntity(id: 'area-terraza', name: 'Terraza', displayOrder: 2, isActive: true);
      final area2 = RestaurantAreaEntity(id: 'area-salon', name: 'Salón Principal', displayOrder: 1, isActive: true);
      final area3 = RestaurantAreaEntity(id: 'area-inactiva', name: 'Bodega VIP', displayOrder: 3, isActive: false);

      await database.restaurantAreaDao.insertAreas([area1, area2, area3]);

      final activeAreas = await database.restaurantAreaDao.getActiveAreas();
      expect(activeAreas.length, 2);
      expect(activeAreas[0].name, 'Salón Principal');
      expect(activeAreas[1].name, 'Terraza');

      final allAreas = await database.restaurantAreaDao.getAllAreas();
      expect(allAreas.length, 3);
    });

    test('inserts tables linked to area and queries by area or status', () async {
      final area = RestaurantAreaEntity(id: 'area-salon', name: 'Salón Principal', displayOrder: 1);
      await database.restaurantAreaDao.insertArea(area);

      final t1 = RestaurantTableEntity(id: 'tbl-1', areaId: 'area-salon', tableNumber: 'Mesa 1', capacity: 4, status: 'DISPONIBLE');
      final t2 = RestaurantTableEntity(id: 'tbl-2', areaId: 'area-salon', tableNumber: 'Mesa 2', capacity: 6, status: 'DISPONIBLE');
      final t3 = RestaurantTableEntity(id: 'tbl-3', areaId: 'area-salon', tableNumber: 'Barra 1', capacity: 2, status: 'DISPONIBLE');

      await database.restaurantTableDao.insertTables([t1, t2, t3]);

      final salonTables = await database.restaurantTableDao.getTablesByArea('area-salon');
      expect(salonTables.length, 3);

      final availableTables = await database.restaurantTableDao.getTablesByStatus('DISPONIBLE');
      expect(availableTables.length, 3);
    });

    test('occupies and releases table lifecycle correctly', () async {
      final area = RestaurantAreaEntity(id: 'area-salon', name: 'Salón Principal', displayOrder: 1);
      await database.restaurantAreaDao.insertArea(area);

      final table = RestaurantTableEntity(id: 'tbl-10', areaId: 'area-salon', tableNumber: 'Mesa 10', capacity: 4);
      await database.restaurantTableDao.insertTable(table);

      final now = DateTime.now().millisecondsSinceEpoch;

      // Occupy table
      await database.restaurantTableDao.occupyTable('tbl-10', 'OCUPADA', 'ticket-hold-99', 3, now);

      var occupied = await database.restaurantTableDao.getTableById('tbl-10');
      expect(occupied, isNotNull);
      expect(occupied!.status, 'OCUPADA');
      expect(occupied.currentTicketId, 'ticket-hold-99');
      expect(occupied.activeGuests, 3);
      expect(occupied.openedAt, now);

      final byTicket = await database.restaurantTableDao.getTableByTicketId('ticket-hold-99');
      expect(byTicket?.id, 'tbl-10');

      // Release table
      await database.restaurantTableDao.releaseTable('tbl-10');

      var released = await database.restaurantTableDao.getTableById('tbl-10');
      expect(released, isNotNull);
      expect(released!.status, 'DISPONIBLE');
      expect(released.currentTicketId, isNull);
      expect(released.activeGuests, isNull);
      expect(released.openedAt, isNull);
    });
  });

  group('HoldTicketDao with Table, Waiter, Modifiers and Versioning (Slice 4.1)', () {
    test('saves and retrieves extended hold ticket with items and metadata', () async {
      final now = DateTime.now().millisecondsSinceEpoch;

      final ticket = HoldTicketEntity(
        id: 'hold-t-101',
        name: 'Mesa 4 - Familia Perez',
        createdAt: now,
        updatedAt: now,
        tableId: 'tbl-04',
        areaId: 'area-terraza',
        waiterId: 'usr-waiter-1',
        waiterName: 'Carlos M.',
        guestCount: 4,
        isGlobalTaxExempt: false,
        version: 1,
      );

      final item1 = HoldTicketItemEntity(
        id: 'item-1',
        holdTicketId: 'hold-t-101',
        productId: 'prod-burger',
        productName: 'Hamburguesa Doble',
        quantity: 2,
        unitPrice: 220.0,
        taxRate: 0.15,
        variantId: 'var-large',
        notes: 'Sin cebolla, bien cocida',
        modifiersJson: '[{"id":"mod-cheese","name":"Extra Queso","extraPrice":30.0}]',
      );

      final item2 = HoldTicketItemEntity(
        id: 'item-2',
        holdTicketId: 'hold-t-101',
        productId: 'prod-coke',
        productName: 'Coca Cola Zero',
        quantity: 2,
        unitPrice: 45.0,
        taxRate: 0.15,
        notes: 'Con hielo y limón',
      );

      await database.holdTicketDao.saveHoldTicket(ticket, [item1, item2]);

      final retrieved = await database.holdTicketDao.getHoldTicketById('hold-t-101');
      expect(retrieved, isNotNull);
      expect(retrieved!.name, 'Mesa 4 - Familia Perez');
      expect(retrieved.tableId, 'tbl-04');
      expect(retrieved.waiterName, 'Carlos M.');
      expect(retrieved.guestCount, 4);
      expect(retrieved.version, 1);

      final items = await database.holdTicketDao.getItemsByHoldTicketId('hold-t-101');
      expect(items.length, 2);
      expect(items[0].productName, 'Hamburguesa Doble');
      expect(items[0].notes, 'Sin cebolla, bien cocida');
      expect(items[0].modifiersJson, contains('Extra Queso'));

      // Test query by tableId
      final byTable = await database.holdTicketDao.getHoldTicketByTableId('tbl-04');
      expect(byTable?.id, 'hold-t-101');
    });

    test('deleteHoldTicketWithItems removes ticket and cascaded items', () async {
      final now = DateTime.now().millisecondsSinceEpoch;

      final ticket = HoldTicketEntity(
        id: 'hold-to-delete',
        name: 'Mesa 5',
        createdAt: now,
        tableId: 'tbl-05',
      );

      final item = HoldTicketItemEntity(
        id: 'item-del-1',
        holdTicketId: 'hold-to-delete',
        productId: 'prod-1',
        productName: 'Café Americano',
        quantity: 1,
        unitPrice: 60.0,
        taxRate: 0.15,
      );

      await database.holdTicketDao.saveHoldTicket(ticket, [item]);

      var itemsBefore = await database.holdTicketDao.getItemsByHoldTicketId('hold-to-delete');
      expect(itemsBefore.length, 1);

      await database.holdTicketDao.deleteHoldTicketWithItems('hold-to-delete');

      var ticketAfter = await database.holdTicketDao.getHoldTicketById('hold-to-delete');
      expect(ticketAfter, isNull);

      var itemsAfter = await database.holdTicketDao.getItemsByHoldTicketId('hold-to-delete');
      expect(itemsAfter, isEmpty);
    });
  });
}
