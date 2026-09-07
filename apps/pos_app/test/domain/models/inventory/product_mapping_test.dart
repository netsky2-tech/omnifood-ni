import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/mappers/inventory_mapper.dart';
import 'package:pos_app/data/models/inventory/product_entity.dart';

void main() {
  test(
    'preserves authoritative SIMPLE mapping identity without product-id inference',
    () {
      final product = InventoryMapper.toProductDomain(
        ProductEntity(
          id: 'prod-uuid-1',
          name: 'Coca Cola 500ml',
          uom: 'UND',
          stock: 12,
          averageCost: 15,
          sellPrice: 25,
          isPrepared: false,
          productType: 'SIMPLE',
          mappingVersionId: 'map-uuid-99',
          insumoId: 'insumo-uuid-42',
        ),
      );
      expect(product.productType, 'SIMPLE');
      expect(product.isPrepared, isFalse);
      expect(product.mappingVersionId, 'map-uuid-99');
      expect(product.insumoId, 'insumo-uuid-42');
      // Prohibits ID-equality fallback
      expect(product.insumoId, isNot(equals(product.id)));

      final entityRoundTrip = InventoryMapper.toProductEntity(product);
      expect(entityRoundTrip.productType, 'SIMPLE');
      expect(entityRoundTrip.isPrepared, isFalse);
      expect(entityRoundTrip.mappingVersionId, 'map-uuid-99');
      expect(entityRoundTrip.insumoId, 'insumo-uuid-42');
    },
  );

  test(
    'preserves PREPARED and COMPOUND catalog classifications as isPrepared true',
    () {
      for (final type in ['PREPARED', 'COMPOUND']) {
        final product = InventoryMapper.toProductDomain(
          ProductEntity(
            id: 'prod-$type',
            name: 'Item $type',
            uom: 'UND',
            stock: 5,
            averageCost: 20,
            sellPrice: 50,
            isPrepared: true,
            productType: type,
          ),
        );
        expect(product.productType, type);
        expect(product.isPrepared, isTrue);
        expect(product.mappingVersionId, isNull);
        expect(product.insumoId, isNull);

        final entity = InventoryMapper.toProductEntity(product);
        expect(entity.productType, type);
        expect(entity.isPrepared, isTrue);
      }
    },
  );
}
