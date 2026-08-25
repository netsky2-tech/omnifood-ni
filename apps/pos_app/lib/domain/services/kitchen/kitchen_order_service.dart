import 'package:uuid/uuid.dart';
import '../../models/kitchen/kitchen_order.dart';
import '../../models/kitchen/kitchen_order_item.dart';
import '../../models/sales/hold_ticket.dart';
import '../../models/sales/cart_item.dart';
import '../../../data/database/app_database.dart';
import '../../../data/mappers/kitchen_mapper.dart';

enum KitchenSlaStatus {
  normal,   // < 10 mins (Green)
  warning,  // 10 - 15 mins (Yellow)
  critical, // > 15 mins (Red)
}

class KitchenOrderService {
  final AppDatabase _database;
  final Uuid _uuid;

  KitchenOrderService(this._database, [Uuid? uuid]) : _uuid = uuid ?? const Uuid();

  /// Calculates elapsed minutes since an order was created
  int getElapsedMinutes(DateTime createdAt, [DateTime? now]) {
    final currentTime = now ?? DateTime.now();
    final difference = currentTime.difference(createdAt);
    return difference.inMinutes < 0 ? 0 : difference.inMinutes;
  }

  /// Evaluates the SLA urgency status based on elapsed minutes
  KitchenSlaStatus getSlaStatus(DateTime createdAt, [DateTime? now]) {
    final elapsedMinutes = getElapsedMinutes(createdAt, now);
    if (elapsedMinutes < 10) {
      return KitchenSlaStatus.normal;
    } else if (elapsedMinutes <= 15) {
      return KitchenSlaStatus.warning;
    } else {
      return KitchenSlaStatus.critical;
    }
  }

  String _normalizeText(String text) {
    return text
        .toLowerCase()
        .replaceAll('á', 'a')
        .replaceAll('é', 'e')
        .replaceAll('í', 'i')
        .replaceAll('ó', 'o')
        .replaceAll('ú', 'u')
        .replaceAll('ñ', 'n');
  }

  /// Determines station ('BARRA' vs 'COCINA') from product category or name
  String determineStation(CartItem item, [String? category]) {
    final cat = _normalizeText(category ?? '').trim();
    final name = _normalizeText(item.productName).trim();

    // 1. Explicit Category Rules
    if (cat.isNotEmpty) {
      final barCategories = [
        'bebida',
        'bar',
        'barra',
        'coctel',
        'cocktail',
        'cerveza',
        'trago',
        'licor',
        'cafeteria',
        'cafe',
        'jugo',
        'refresco',
        'soda',
      ];
      for (final bc in barCategories) {
        if (cat.contains(bc)) return 'BARRA';
      }

      final kitchenCategories = [
        'comida',
        'cocina',
        'plato',
        'platos fuertes',
        'entrada',
        'postre',
        'guarnicion',
        'snack',
        'reposteria',
      ];
      for (final kc in kitchenCategories) {
        if (cat.contains(kc)) return 'COCINA';
      }
    }

    final tokens = name.split(RegExp(r'[^a-z0-9]+')).toSet();

    // 2. High-priority Food Keywords by token (e.g. Pizza Margarita is food, not cocktail)
    final foodKeywords = {
      'pizza',
      'pizzas',
      'taco',
      'tacos',
      'hamburguesa',
      'hamburguesas',
      'burger',
      'burgers',
      'steak',
      'steaks',
      'carne',
      'carnes',
      'pollo',
      'res',
      'cerdo',
      'pescado',
      'pescados',
      'marisco',
      'mariscos',
      'calzone',
      'pasta',
      'pastas',
      'ensalada',
      'ensaladas',
      'sopa',
      'sopas',
      'postre',
      'postres',
      'flan',
      'torta',
      'tortas',
      'quesadilla',
      'quesadillas',
      'nacho',
      'nachos',
      'alita',
      'alitas',
      'wing',
      'wings',
      'burrito',
      'burritos',
      'sandwich',
      'sandwiches',
      'papa',
      'papas',
      'arroz',
    };

    for (final token in tokens) {
      if (foodKeywords.contains(token)) {
        return 'COCINA';
      }
    }

    // 3. Bar Keywords by token matching
    final barKeywords = {
      'bebida',
      'bebidas',
      'coctel',
      'cocteles',
      'cocktail',
      'cocktails',
      'cerveza',
      'cervezas',
      'trago',
      'tragos',
      'licor',
      'licores',
      'cafeteria',
      'cafe',
      'cafes',
      'jugo',
      'jugos',
      'gaseosa',
      'gaseosas',
      'refresco',
      'refrescos',
      'soda',
      'sodas',
      'mojito',
      'margarita',
      'daiquiri',
      'ron',
      'whisky',
      'whiskey',
      'vodka',
      'tequila',
      'gin',
      'vino',
      'vinos',
      'smoothie',
      'batido',
      'limonada',
      'naranjada',
      'agua',
    };

    for (final token in tokens) {
      if (barKeywords.contains(token)) {
        return 'BARRA';
      }
    }

    return 'COCINA';
  }

  /// Routes and sends a HoldTicket comanda to KDS stations
  Future<List<KitchenOrder>> sendTicketToKitchen({
    required HoldTicket ticket,
    Map<String, String>? productCategories,
  }) async {
    final now = DateTime.now();

    // 1. Group items by station
    final Map<String, List<CartItem>> itemsByStation = {};
    for (final item in ticket.items) {
      final category = productCategories?[item.productId];
      final station = determineStation(item, category);
      itemsByStation.putIfAbsent(station, () => []).add(item);
    }

    final List<KitchenOrder> createdOrders = [];

    // 2. Create and persist a KitchenOrder for each station
    for (final entry in itemsByStation.entries) {
      final station = entry.key;
      final items = entry.value;

      final orderId = _uuid.v4();

      final kitchenOrderItems = items.map((cartItem) {
        final modifierNames = cartItem.selectedModifiers.map((m) => m.name).toList();
        return KitchenOrderItem(
          id: _uuid.v4(),
          kitchenOrderId: orderId,
          productId: cartItem.productId,
          productName: cartItem.productName,
          quantity: cartItem.quantity,
          status: 'PENDIENTE',
          notes: cartItem.notes,
          modifiers: modifierNames,
        );
      }).toList();

      final kitchenOrder = KitchenOrder(
        id: orderId,
        ticketId: ticket.id,
        tableNumber: ticket.tableId,
        tableName: ticket.name,
        waiterName: ticket.waiterName,
        station: station,
        status: 'PENDIENTE',
        createdAt: now,
        items: kitchenOrderItems,
      );

      final orderEntity = KitchenMapper.toEntity(kitchenOrder);
      final itemEntities = KitchenMapper.toItemEntities(kitchenOrder);

      await _database.kitchenOrderDao.saveKitchenOrder(orderEntity, itemEntities);
      createdOrders.add(kitchenOrder);
    }

    return createdOrders;
  }

  /// Appends newly added items from an updated comanda to KDS stations
  Future<List<KitchenOrder>> appendTicketItemsToKitchen({
    required String ticketId,
    required List<CartItem> newItems,
    String? tableNumber,
    String? tableName,
    String? waiterName,
    Map<String, String>? productCategories,
  }) async {
    if (newItems.isEmpty) return [];

    final now = DateTime.now();

    // Group new items by station
    final Map<String, List<CartItem>> itemsByStation = {};
    for (final item in newItems) {
      final category = productCategories?[item.productId];
      final station = determineStation(item, category);
      itemsByStation.putIfAbsent(station, () => []).add(item);
    }

    final List<KitchenOrder> createdOrUpdatedOrders = [];

    for (final entry in itemsByStation.entries) {
      final station = entry.key;
      final items = entry.value;

      final orderId = _uuid.v4();
      final kitchenOrderItems = items.map((cartItem) {
        final modifierNames = cartItem.selectedModifiers.map((m) => m.name).toList();
        return KitchenOrderItem(
          id: _uuid.v4(),
          kitchenOrderId: orderId,
          productId: cartItem.productId,
          productName: cartItem.productName,
          quantity: cartItem.quantity,
          status: 'PENDIENTE',
          notes: cartItem.notes,
          modifiers: modifierNames,
        );
      }).toList();

      final kitchenOrder = KitchenOrder(
        id: orderId,
        ticketId: ticketId,
        tableNumber: tableNumber,
        tableName: tableName,
        waiterName: waiterName,
        station: station,
        status: 'PENDIENTE',
        createdAt: now,
        items: kitchenOrderItems,
      );

      final orderEntity = KitchenMapper.toEntity(kitchenOrder);
      final itemEntities = KitchenMapper.toItemEntities(kitchenOrder);

      await _database.kitchenOrderDao.saveKitchenOrder(orderEntity, itemEntities);
      createdOrUpdatedOrders.add(kitchenOrder);
    }

    return createdOrUpdatedOrders;
  }

  /// Starts preparation on an order
  Future<KitchenOrder> startPreparation(String orderId) async {
    final now = DateTime.now();
    await _database.kitchenOrderDao.startOrderPreparation(
      orderId,
      'EN_PREPARACION',
      now.millisecondsSinceEpoch,
    );

    final order = await getOrderById(orderId);
    if (order == null) {
      throw StateError('La orden de cocina $orderId no existe.');
    }
    return order;
  }

  /// Marks a single item status in an order
  Future<KitchenOrder> markItemStatus({
    required String orderId,
    required String itemId,
    required String status,
  }) async {
    await _database.kitchenOrderDao.updateItemStatus(itemId, status);

    // Check if all items are now LISTO
    final items = await _database.kitchenOrderDao.getItemsForOrder(orderId);
    final allReady = items.isNotEmpty && items.every((i) => i.status == 'LISTO');

    if (allReady) {
      final now = DateTime.now();
      await _database.kitchenOrderDao.updateOrderStatus(
        orderId,
        'LISTO',
        now.millisecondsSinceEpoch,
      );
    }

    final order = await getOrderById(orderId);
    if (order == null) {
      throw StateError('La orden de cocina $orderId no existe.');
    }
    return order;
  }

  /// Marks entire order and all its items as ready
  Future<KitchenOrder> markOrderReady(String orderId) async {
    final now = DateTime.now();
    final items = await _database.kitchenOrderDao.getItemsForOrder(orderId);
    for (final item in items) {
      await _database.kitchenOrderDao.updateItemStatus(item.id, 'LISTO');
    }

    await _database.kitchenOrderDao.updateOrderStatus(
      orderId,
      'LISTO',
      now.millisecondsSinceEpoch,
    );

    final order = await getOrderById(orderId);
    if (order == null) {
      throw StateError('La orden de cocina $orderId no existe.');
    }
    return order;
  }

  /// Bumps/serves the order
  Future<KitchenOrder> bumpOrder(String orderId) async {
    final now = DateTime.now();
    await _database.kitchenOrderDao.markOrderServed(
      orderId,
      'ENTREGADO',
      now.millisecondsSinceEpoch,
    );

    final order = await getOrderById(orderId);
    if (order == null) {
      throw StateError('La orden de cocina $orderId no existe.');
    }
    return order;
  }

  /// Cancels / deletes kitchen orders linked to a canceled ticket
  Future<void> cancelOrdersForTicket(String ticketId) async {
    await _database.kitchenOrderDao.deleteOrdersByTicketId(ticketId);
  }

  /// Retrieves an order by its ID
  Future<KitchenOrder?> getOrderById(String orderId) async {
    final entity = await _database.kitchenOrderDao.getOrderById(orderId);
    if (entity == null) return null;

    final itemEntities = await _database.kitchenOrderDao.getItemsForOrder(orderId);
    return KitchenMapper.toDomain(entity, itemEntities);
  }

  /// Retrieves active kitchen orders (optional station filter)
  Future<List<KitchenOrder>> getActiveOrders({String? station}) async {
    final List<dynamic> entities;
    if (station != null && station.isNotEmpty && station != 'TODAS') {
      entities = await _database.kitchenOrderDao.getActiveOrdersByStation(station, 'ENTREGADO');
    } else {
      entities = await _database.kitchenOrderDao.getActiveOrders('ENTREGADO');
    }

    final List<KitchenOrder> orders = [];
    for (final entity in entities) {
      final itemEntities = await _database.kitchenOrderDao.getItemsForOrder(entity.id);
      orders.add(KitchenMapper.toDomain(entity, itemEntities));
    }
    return orders;
  }
}
