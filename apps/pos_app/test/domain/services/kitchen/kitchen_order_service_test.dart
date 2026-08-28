import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/domain/models/inventory/product.dart';
import 'package:pos_app/domain/models/sales/hold_ticket.dart';
import 'package:pos_app/domain/models/sales/cart_item.dart';
import 'package:pos_app/domain/services/kitchen/kitchen_order_service.dart';

void main() {
  late AppDatabase database;
  late KitchenOrderService kitchenService;

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  setUp(() async {
    database = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();
    kitchenService = KitchenOrderService(database);
  });

  tearDown(() async {
    await database.close();
  });

  group('KitchenOrderService Tests (Slice 5.2)', () {
    test('determines station correctly based on category and product names', () {
      final taco = const CartItem(productId: '1', productName: 'Tacos de Res', quantity: 1, unitPrice: 100, taxRate: 0.15);
      final burger = const CartItem(productId: '2', productName: 'Hamburguesa Doble', quantity: 1, unitPrice: 120, taxRate: 0.15);
      final soda = const CartItem(productId: '3', productName: 'Gaseosa Coca Cola 500ml', quantity: 1, unitPrice: 35, taxRate: 0.15);
      final beer = const CartItem(productId: '4', productName: 'Cerveza Toña', quantity: 1, unitPrice: 50, taxRate: 0.15);
      final coffee = const CartItem(productId: '5', productName: 'Café Expresso', quantity: 1, unitPrice: 40, taxRate: 0.15);

      expect(kitchenService.determineStation(taco), 'COCINA');
      expect(kitchenService.determineStation(burger), 'COCINA');
      expect(kitchenService.determineStation(soda), 'BARRA');
      expect(kitchenService.determineStation(beer), 'BARRA');
      expect(kitchenService.determineStation(coffee), 'BARRA');

      // With category hint
      expect(kitchenService.determineStation(taco, 'Bebidas Calientes'), 'BARRA');
      expect(kitchenService.determineStation(taco, 'Platos Fuertes'), 'COCINA');
    });

    test('calculates SLA timer and status correctly', () {
      final baseTime = DateTime(2026, 8, 25, 12, 0, 0);

      // 5 minutes later -> normal
      final time5m = baseTime.add(const Duration(minutes: 5));
      expect(kitchenService.getElapsedMinutes(baseTime, time5m), 5);
      expect(kitchenService.getSlaStatus(baseTime, time5m), KitchenSlaStatus.normal);

      // 12 minutes later -> warning
      final time12m = baseTime.add(const Duration(minutes: 12));
      expect(kitchenService.getElapsedMinutes(baseTime, time12m), 12);
      expect(kitchenService.getSlaStatus(baseTime, time12m), KitchenSlaStatus.warning);

      // 20 minutes later -> critical
      final time20m = baseTime.add(const Duration(minutes: 20));
      expect(kitchenService.getElapsedMinutes(baseTime, time20m), 20);
      expect(kitchenService.getSlaStatus(baseTime, time20m), KitchenSlaStatus.critical);
    });

    test('routes and persists HoldTicket comanda to separate stations (COCINA vs BARRA)', () async {
      final ticket = HoldTicket(
        id: 'tick-301',
        name: 'Mesa 4 - Almuerzo',
        tableId: 'tbl-4',
        waiterName: 'Carlos M.',
        guestCount: 4,
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
        items: const [
          CartItem(
            productId: 'p-tacos',
            productName: 'Tacos al Pastor',
            quantity: 2,
            unitPrice: 100,
            taxRate: 0.15,
            selectedModifiers: [Modifier(id: 'm-1', name: 'Sin Cilantro', extraPrice: 0)],
          ),
          CartItem(
            productId: 'p-ribeye',
            productName: 'Ribeye Steak',
            quantity: 1,
            unitPrice: 350,
            taxRate: 0.15,
          ),
          CartItem(
            productId: 'p-mojito',
            productName: 'Mojito Clásico',
            quantity: 2,
            unitPrice: 80,
            taxRate: 0.15,
          ),
          CartItem(
            productId: 'p-beer',
            productName: 'Cerveza Victoria Clásica',
            quantity: 2,
            unitPrice: 45,
            taxRate: 0.15,
          ),
        ],
      );

      final createdOrders = await kitchenService.sendTicketToKitchen(ticket: ticket);

      expect(createdOrders.length, 2);

      final cocinaOrder = createdOrders.firstWhere((o) => o.station == 'COCINA');
      final barraOrder = createdOrders.firstWhere((o) => o.station == 'BARRA');

      expect(cocinaOrder.items.length, 2);
      expect(cocinaOrder.tableNumber, 'tbl-4');
      expect(cocinaOrder.tableName, 'Mesa 4 - Almuerzo');
      expect(cocinaOrder.items.first.modifiers, contains('Sin Cilantro'));

      expect(barraOrder.items.length, 2);
      expect(barraOrder.station, 'BARRA');

      // Verify active queries from database
      final activeCocina = await kitchenService.getActiveOrders(station: 'COCINA');
      expect(activeCocina.length, 1);
      expect(activeCocina.first.id, cocinaOrder.id);

      final activeBarra = await kitchenService.getActiveOrders(station: 'BARRA');
      expect(activeBarra.length, 1);
      expect(activeBarra.first.id, barraOrder.id);

      final allActive = await kitchenService.getActiveOrders();
      expect(allActive.length, 2);
    });

    test('full preparation lifecycle: start -> item readiness -> auto order ready -> bump', () async {
      final ticket = HoldTicket(
        id: 'tick-302',
        name: 'Mesa 2 - Cena',
        tableId: 'tbl-2',
        waiterName: 'Ana M.',
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
        items: const [
          CartItem(productId: 'p-1', productName: 'Pizza Margarita', quantity: 1, unitPrice: 180, taxRate: 0.15),
          CartItem(productId: 'p-2', productName: 'Calzone Relleno', quantity: 1, unitPrice: 160, taxRate: 0.15),
        ],
      );

      final orders = await kitchenService.sendTicketToKitchen(ticket: ticket);
      final orderId = orders.first.id;

      // 1. Start preparation
      final inPrepOrder = await kitchenService.startPreparation(orderId);
      expect(inPrepOrder.status, 'EN_PREPARACION');
      expect(inPrepOrder.startedAt, isNotNull);

      // 2. Mark item 1 as LISTO
      final item1Id = inPrepOrder.items.first.id;
      final step1 = await kitchenService.markItemStatus(orderId: orderId, itemId: item1Id, status: 'LISTO');
      expect(step1.status, 'EN_PREPARACION'); // Still in prep because item 2 is PENDIENTE

      // 3. Mark item 2 as LISTO -> Order automatically becomes LISTO
      final item2Id = inPrepOrder.items.last.id;
      final step2 = await kitchenService.markItemStatus(orderId: orderId, itemId: item2Id, status: 'LISTO');
      expect(step2.status, 'LISTO');
      expect(step2.readyAt, isNotNull);

      // 4. Bump order (served/delivered)
      final bumpedOrder = await kitchenService.bumpOrder(orderId);
      expect(bumpedOrder.status, 'ENTREGADO');
      expect(bumpedOrder.servedAt, isNotNull);

      // Active orders list should be empty now
      final active = await kitchenService.getActiveOrders();
      expect(active, isEmpty);
    });

    test('markOrderReady immediately marks all items and order ready', () async {
      final ticket = HoldTicket(
        id: 'tick-303',
        name: 'Barra 1',
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
        items: const [
          CartItem(productId: 'p-soda', productName: 'Gaseosa 500ml', quantity: 2, unitPrice: 35, taxRate: 0.15),
        ],
      );

      final orders = await kitchenService.sendTicketToKitchen(ticket: ticket);
      final orderId = orders.first.id;

      final readyOrder = await kitchenService.markOrderReady(orderId);
      expect(readyOrder.status, 'LISTO');
      expect(readyOrder.readyAt, isNotNull);
      expect(readyOrder.items.first.status, 'LISTO');
    });

    test('appendTicketItemsToKitchen sends additional items to KDS', () async {
      final initialTicket = HoldTicket(
        id: 'tick-304',
        name: 'Mesa 1',
        tableId: 'tbl-1',
        waiterName: 'Carlos M.',
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
        items: const [
          CartItem(productId: 'p-tacos', productName: 'Tacos de Pollo', quantity: 2, unitPrice: 100, taxRate: 0.15),
        ],
      );

      await kitchenService.sendTicketToKitchen(ticket: initialTicket);

      // Customer orders desserts and drinks later
      final additionalOrders = await kitchenService.appendTicketItemsToKitchen(
        ticketId: 'tick-304',
        tableNumber: 'tbl-1',
        tableName: 'Mesa 1',
        waiterName: 'Carlos M.',
        newItems: const [
          CartItem(productId: 'p-flan', productName: 'Flan Casero', quantity: 1, unitPrice: 60, taxRate: 0.15),
          CartItem(productId: 'p-cerveza', productName: 'Cerveza Toña', quantity: 2, unitPrice: 50, taxRate: 0.15),
        ],
      );

      expect(additionalOrders.length, 2); // 1 for COCINA (Flan), 1 for BARRA (Cerveza)

      final active = await kitchenService.getActiveOrders();
      expect(active.length, 3); // 1 initial + 2 additional
    });

    test('cancelOrdersForTicket deletes kitchen orders when comanda is canceled', () async {
      final ticket = HoldTicket(
        id: 'tick-305',
        name: 'Mesa 5',
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
        items: const [
          CartItem(productId: 'p-burger', productName: 'Hamburguesa Sencilla', quantity: 1, unitPrice: 100, taxRate: 0.15),
        ],
      );

      await kitchenService.sendTicketToKitchen(ticket: ticket);
      var active = await kitchenService.getActiveOrders();
      expect(active.length, 1);

      await kitchenService.cancelOrdersForTicket('tick-305');
      active = await kitchenService.getActiveOrders();
      expect(active, isEmpty);
    });
  });
}
