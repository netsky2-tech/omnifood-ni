import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/mappers/kitchen_mapper.dart';
import 'package:pos_app/data/models/kitchen/kitchen_order_entity.dart';
import 'package:pos_app/data/models/kitchen/kitchen_order_item_entity.dart';

void main() {
  KitchenOrderEntity orderEntity() => KitchenOrderEntity(
        id: 'ko-1',
        ticketId: 'T-1',
        tableNumber: '5',
        tableName: 'Mesa 5',
        waiterName: 'Ana',
        station: 'COCINA',
        status: 'PENDING',
        createdAt: 1753300000000,
      );

  KitchenOrderItemEntity itemEntity({String? modifiersJson}) =>
      KitchenOrderItemEntity(
        id: 'ki-1',
        kitchenOrderId: 'ko-1',
        productId: 'p-1',
        productName: 'Burger',
        quantity: 1,
        status: 'PENDING',
        notes: null,
        modifiersJson: modifiersJson,
      );

  group('KitchenMapper.toItemDomain modifiers parsing (M7)', () {
    test('parses a well-formed modifiers JSON list of named maps', () {
      final item = KitchenMapper.toItemDomain(
        itemEntity(
          modifiersJson:
              '[{"name":"Sin cebolla"},{"name":"Extra queso"}]',
        ),
      );

      expect(item.modifiers, ['Sin cebolla', 'Extra queso']);
    });

    test('parses a well-formed modifiers JSON list of plain strings', () {
      final item = KitchenMapper.toItemDomain(
        itemEntity(modifiersJson: '["sin mayo","para llevar"]'),
      );

      expect(item.modifiers, ['sin mayo', 'para llevar']);
    });

    test('null or empty modifiersJson keeps an empty modifier list', () {
      expect(KitchenMapper.toItemDomain(itemEntity()).modifiers, isEmpty);
      expect(
        KitchenMapper.toItemDomain(itemEntity(modifiersJson: '')).modifiers,
        isEmpty,
      );
    });

    test('corrupted JSON keeps empty modifiers without throwing', () {
      // M7 (Batch 3): the parse failure is logged (with the raw payload as
      // evidence) instead of being silently swallowed; the defensive empty
      // list must stay so the kitchen display never crashes.
      final item = KitchenMapper.toItemDomain(
        itemEntity(modifiersJson: '{not-valid-json'),
      );

      expect(item.modifiers, isEmpty);
    });

    test('non-list JSON payload keeps empty modifiers without throwing', () {
      final item = KitchenMapper.toItemDomain(
        itemEntity(modifiersJson: '{"unexpected":"shape"}'),
      );

      expect(item.modifiers, isEmpty);
    });
  });

  group('KitchenMapper.toDomain / toEntity roundtrip', () {
    test('maps order and items both ways', () {
      final domain = KitchenMapper.toDomain(orderEntity(), [
        itemEntity(modifiersJson: '["extra queso"]'),
      ]);

      expect(domain.id, 'ko-1');
      expect(domain.ticketId, 'T-1');
      expect(domain.items.single.modifiers, ['extra queso']);

      final entityBack = KitchenMapper.toEntity(domain);
      expect(entityBack.id, 'ko-1');
      expect(entityBack.createdAt, 1753300000000);

      final itemEntitiesBack = KitchenMapper.toItemEntities(domain);
      expect(itemEntitiesBack.single.modifiersJson, contains('extra queso'));
    });
  });
}
