import 'dart:convert';
import '../../domain/models/kitchen/kitchen_order.dart';
import '../../domain/models/kitchen/kitchen_order_item.dart';
import '../models/kitchen/kitchen_order_entity.dart';
import '../models/kitchen/kitchen_order_item_entity.dart';

class KitchenMapper {
  static KitchenOrder toDomain(
    KitchenOrderEntity entity,
    List<KitchenOrderItemEntity> itemEntities,
  ) {
    return KitchenOrder(
      id: entity.id,
      ticketId: entity.ticketId,
      tableNumber: entity.tableNumber,
      tableName: entity.tableName,
      waiterName: entity.waiterName,
      station: entity.station,
      status: entity.status,
      createdAt: DateTime.fromMillisecondsSinceEpoch(entity.createdAt),
      startedAt: entity.startedAt != null
          ? DateTime.fromMillisecondsSinceEpoch(entity.startedAt!)
          : null,
      readyAt: entity.readyAt != null
          ? DateTime.fromMillisecondsSinceEpoch(entity.readyAt!)
          : null,
      servedAt: entity.servedAt != null
          ? DateTime.fromMillisecondsSinceEpoch(entity.servedAt!)
          : null,
      notes: entity.notes,
      items: itemEntities.map((item) => toItemDomain(item)).toList(),
    );
  }

  static KitchenOrderItem toItemDomain(KitchenOrderItemEntity entity) {
    List<String> modifiers = [];
    if (entity.modifiersJson != null && entity.modifiersJson!.isNotEmpty) {
      try {
        final decoded = jsonDecode(entity.modifiersJson!);
        if (decoded is List) {
          modifiers = decoded.map((e) {
            if (e is Map && e.containsKey('name')) {
              return e['name'].toString();
            }
            return e.toString();
          }).toList();
        }
      } catch (_) {
        modifiers = [];
      }
    }

    return KitchenOrderItem(
      id: entity.id,
      kitchenOrderId: entity.kitchenOrderId,
      productId: entity.productId,
      productName: entity.productName,
      quantity: entity.quantity,
      status: entity.status,
      notes: entity.notes,
      modifiers: modifiers,
    );
  }

  static KitchenOrderEntity toEntity(KitchenOrder domain) {
    return KitchenOrderEntity(
      id: domain.id,
      ticketId: domain.ticketId,
      tableNumber: domain.tableNumber,
      tableName: domain.tableName,
      waiterName: domain.waiterName,
      station: domain.station,
      status: domain.status,
      createdAt: domain.createdAt.millisecondsSinceEpoch,
      startedAt: domain.startedAt?.millisecondsSinceEpoch,
      readyAt: domain.readyAt?.millisecondsSinceEpoch,
      servedAt: domain.servedAt?.millisecondsSinceEpoch,
      notes: domain.notes,
    );
  }

  static List<KitchenOrderItemEntity> toItemEntities(KitchenOrder domain) {
    return domain.items.map((item) {
      String? modJson;
      if (item.modifiers.isNotEmpty) {
        modJson = jsonEncode(item.modifiers);
      }
      return KitchenOrderItemEntity(
        id: item.id,
        kitchenOrderId: domain.id,
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        status: item.status,
        notes: item.notes,
        modifiersJson: modJson,
      );
    }).toList();
  }
}
