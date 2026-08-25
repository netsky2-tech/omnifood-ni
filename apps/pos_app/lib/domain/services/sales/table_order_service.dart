import 'package:uuid/uuid.dart';
import '../../../data/database/app_database.dart';
import '../../../data/mappers/sales_mapper.dart';
import '../../models/sales/cart_item.dart';
import '../../models/sales/hold_ticket.dart';

class OptimisticLockException implements Exception {
  final String message;
  OptimisticLockException([this.message = 'La comanda ha sido modificada por otra terminal. Por favor recárguela.']);

  @override
  String toString() => 'OptimisticLockException: $message';
}

class SplitOrderResult {
  final HoldTicket updatedSourceTicket;
  final HoldTicket newTicket;

  const SplitOrderResult({
    required this.updatedSourceTicket,
    required this.newTicket,
  });
}

class TableOrderService {
  final AppDatabase _database;
  final Uuid _uuid;

  TableOrderService(this._database, [Uuid? uuid]) : _uuid = uuid ?? const Uuid();

  Future<HoldTicket> parkOrder({
    String? id,
    String? tableId,
    String? areaId,
    required String name,
    String? waiterId,
    String? waiterName,
    int guestCount = 1,
    bool isGlobalTaxExempt = false,
    required List<CartItem> items,
  }) async {
    final ticketId = id ?? _uuid.v4();
    final now = DateTime.now();

    final domain = HoldTicket(
      id: ticketId,
      name: name,
      tableId: tableId,
      areaId: areaId,
      waiterId: waiterId,
      waiterName: waiterName,
      guestCount: guestCount,
      isGlobalTaxExempt: isGlobalTaxExempt,
      createdAt: now,
      updatedAt: now,
      version: 1,
      items: items,
    );

    final entity = SalesMapper.toHoldTicketEntity(domain);
    final itemEntities = SalesMapper.toHoldTicketItemEntities(domain);

    await _database.holdTicketDao.saveHoldTicket(entity, itemEntities);

    if (tableId != null) {
      await _database.restaurantTableDao.occupyTable(
        tableId,
        'OCUPADA',
        ticketId,
        guestCount,
        now.millisecondsSinceEpoch,
      );
    }

    return domain;
  }

  Future<HoldTicket?> getOrderById(String id) async {
    final entity = await _database.holdTicketDao.getHoldTicketById(id);
    if (entity == null) return null;

    final itemEntities = await _database.holdTicketDao.getItemsByHoldTicketId(id);
    return SalesMapper.toHoldTicketDomain(entity, itemEntities);
  }

  Future<HoldTicket?> getOrderByTableId(String tableId) async {
    final entity = await _database.holdTicketDao.getHoldTicketByTableId(tableId);
    if (entity == null) return null;

    final itemEntities = await _database.holdTicketDao.getItemsByHoldTicketId(entity.id);
    return SalesMapper.toHoldTicketDomain(entity, itemEntities);
  }

  Future<List<HoldTicket>> getAllOpenOrders() async {
    final entities = await _database.holdTicketDao.getAllHoldTickets();
    final List<HoldTicket> orders = [];

    for (final entity in entities) {
      final items = await _database.holdTicketDao.getItemsByHoldTicketId(entity.id);
      orders.add(SalesMapper.toHoldTicketDomain(entity, items));
    }

    return orders;
  }

  Future<HoldTicket> appendItemsToOrder({
    required String ticketId,
    required List<CartItem> newItems,
    required int expectedVersion,
  }) async {
    final entity = await _database.holdTicketDao.getHoldTicketById(ticketId);
    if (entity == null) {
      throw StateError('La comanda $ticketId no existe.');
    }

    if (entity.version != expectedVersion) {
      throw OptimisticLockException();
    }

    final currentItemEntities = await _database.holdTicketDao.getItemsByHoldTicketId(ticketId);
    final currentDomain = SalesMapper.toHoldTicketDomain(entity, currentItemEntities);

    final combinedItems = List<CartItem>.from(currentDomain.items)..addAll(newItems);
    final now = DateTime.now();

    final updatedDomain = currentDomain.copyWith(
      items: combinedItems,
      version: entity.version + 1,
      updatedAt: now,
    );

    final updatedEntity = SalesMapper.toHoldTicketEntity(updatedDomain);
    final updatedItemEntities = SalesMapper.toHoldTicketItemEntities(updatedDomain);

    await _database.holdTicketDao.saveHoldTicket(updatedEntity, updatedItemEntities);

    return updatedDomain;
  }

  Future<HoldTicket> mergeOrders({
    required String sourceTicketId,
    required String targetTicketId,
    required int targetExpectedVersion,
  }) async {
    final sourceTicket = await getOrderById(sourceTicketId);
    final targetTicket = await getOrderById(targetTicketId);

    if (sourceTicket == null || targetTicket == null) {
      throw StateError('Una de las comandas a fusionar no existe.');
    }

    if (targetTicket.version != targetExpectedVersion) {
      throw OptimisticLockException();
    }

    final combinedItems = List<CartItem>.from(targetTicket.items)..addAll(sourceTicket.items);
    final now = DateTime.now();

    final mergedTargetDomain = targetTicket.copyWith(
      items: combinedItems,
      version: targetTicket.version + 1,
      updatedAt: now,
    );

    final mergedEntity = SalesMapper.toHoldTicketEntity(mergedTargetDomain);
    final mergedItemEntities = SalesMapper.toHoldTicketItemEntities(mergedTargetDomain);

    await _database.holdTicketDao.saveHoldTicket(mergedEntity, mergedItemEntities);

    // Release source table if applicable
    if (sourceTicket.tableId != null) {
      await _database.restaurantTableDao.releaseTable(sourceTicket.tableId!);
    }

    // Delete source ticket
    await _database.holdTicketDao.deleteHoldTicketWithItems(sourceTicketId);

    return mergedTargetDomain;
  }

  Future<HoldTicket> transferOrder({
    required String ticketId,
    required String sourceTableId,
    required String targetTableId,
  }) async {
    final ticket = await getOrderById(ticketId);
    if (ticket == null) {
      throw StateError('La comanda $ticketId no existe.');
    }

    final now = DateTime.now();
    final updatedDomain = ticket.copyWith(
      tableId: targetTableId,
      updatedAt: now,
    );

    final updatedEntity = SalesMapper.toHoldTicketEntity(updatedDomain);
    final updatedItemEntities = SalesMapper.toHoldTicketItemEntities(updatedDomain);
    await _database.holdTicketDao.saveHoldTicket(updatedEntity, updatedItemEntities);

    await _database.restaurantTableDao.releaseTable(sourceTableId);
    await _database.restaurantTableDao.occupyTable(
      targetTableId,
      'OCUPADA',
      ticket.id,
      ticket.guestCount,
      now.millisecondsSinceEpoch,
    );

    return updatedDomain;
  }

  Future<SplitOrderResult> splitOrderItems({
    required String sourceTicketId,
    required List<CartItem> itemsToMove,
    String? targetTableId,
    String? targetAreaId,
    required String targetName,
    required int sourceExpectedVersion,
    String? targetWaiterId,
    String? targetWaiterName,
    int targetGuestCount = 1,
  }) async {
    final sourceTicket = await getOrderById(sourceTicketId);
    if (sourceTicket == null) {
      throw StateError('La comanda origen $sourceTicketId no existe.');
    }

    if (sourceTicket.version != sourceExpectedVersion) {
      throw OptimisticLockException();
    }

    // Filter out moved items from source
    final remainingItems = List<CartItem>.from(sourceTicket.items);
    for (final item in itemsToMove) {
      final index = remainingItems.indexWhere((it) =>
          it.productId == item.productId &&
          it.variantId == item.variantId &&
          it.notes == item.notes);
      if (index != -1) {
        remainingItems.removeAt(index);
      }
    }

    final now = DateTime.now();

    // 1. Update source ticket
    final updatedSourceDomain = sourceTicket.copyWith(
      items: remainingItems,
      version: sourceTicket.version + 1,
      updatedAt: now,
    );

    final updatedSourceEntity = SalesMapper.toHoldTicketEntity(updatedSourceDomain);
    final updatedSourceItems = SalesMapper.toHoldTicketItemEntities(updatedSourceDomain);
    await _database.holdTicketDao.saveHoldTicket(updatedSourceEntity, updatedSourceItems);

    // 2. Create new target ticket
    final newTicketId = _uuid.v4();
    final newTicketDomain = HoldTicket(
      id: newTicketId,
      name: targetName,
      tableId: targetTableId,
      areaId: targetAreaId ?? sourceTicket.areaId,
      waiterId: targetWaiterId ?? sourceTicket.waiterId,
      waiterName: targetWaiterName ?? sourceTicket.waiterName,
      guestCount: targetGuestCount,
      isGlobalTaxExempt: sourceTicket.isGlobalTaxExempt,
      createdAt: now,
      updatedAt: now,
      version: 1,
      items: itemsToMove,
    );

    final newTicketEntity = SalesMapper.toHoldTicketEntity(newTicketDomain);
    final newTicketItems = SalesMapper.toHoldTicketItemEntities(newTicketDomain);
    await _database.holdTicketDao.saveHoldTicket(newTicketEntity, newTicketItems);

    if (targetTableId != null) {
      await _database.restaurantTableDao.occupyTable(
        targetTableId,
        'OCUPADA',
        newTicketId,
        targetGuestCount,
        now.millisecondsSinceEpoch,
      );
    }

    return SplitOrderResult(
      updatedSourceTicket: updatedSourceDomain,
      newTicket: newTicketDomain,
    );
  }

  Future<void> liquidateOrder(String ticketId) async {
    final ticket = await getOrderById(ticketId);
    if (ticket?.tableId != null) {
      await _database.restaurantTableDao.releaseTable(ticket!.tableId!);
    }
    await _database.holdTicketDao.deleteHoldTicketWithItems(ticketId);
  }
}
