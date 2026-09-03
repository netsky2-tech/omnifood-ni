import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/mappers/inventory_mapper.dart';
import 'package:pos_app/data/models/inventory/movement_entity.dart';
import 'package:pos_app/data/models/inventory/product_entity.dart';
import 'package:pos_app/domain/models/fulfillment/fulfillment_contracts.dart';
import 'package:pos_app/domain/models/inventory/inventory_movement.dart';
import 'package:pos_app/domain/models/inventory/batch_deduction.dart';
import 'package:pos_app/domain/models/inventory/product.dart';

void main() {
  group('InventoryMapper', () {
    test('toMovementDomain should map batch_deductions from JSON string', () {
      final entity = MovementEntity(
        id: 'mv-1',
        insumoId: 'ins-1',
        type: 'sale',
        quantity: -2.0,
        previousStock: 10.0,
        newStock: 8.0,
        timestamp: DateTime.now().toIso8601String(),
        batch_deductions: '[{"batchId":"b1","quantity":2.0}]',
      );

      final domain = InventoryMapper.toMovementDomain(entity);

      expect(domain.batchDeductions, isNotNull);
      expect(domain.batchDeductions!.length, 1);
      expect(domain.batchDeductions![0].batchId, 'b1');
    });

    test('toMovementEntity should map batchDeductions to JSON string', () {
      final domain = InventoryMovement(
        id: 'mv-1',
        insumoId: 'ins-1',
        type: MovementType.sale,
        quantity: -2.0,
        previousStock: 10.0,
        newStock: 8.0,
        timestamp: DateTime.now(),
        batchDeductions: [const BatchDeduction(batchId: 'b1', quantity: 2.0)],
      );

      final entity = InventoryMapper.toMovementEntity(domain);

      expect(entity.batch_deductions, contains('"batchId":"b1"'));
      expect(entity.batch_deductions, contains('"quantity":2.0'));
    });

    test(
      'maps explicitly provisioned product inventory policy and stock link',
      () {
        final product = Product(
          id: 'resale',
          name: 'Resale',
          uom: 'unit',
          stock: 0,
          averageCost: 0,
          sellPrice: 10,
          inventoryPolicy: InventoryPolicy.directStock,
          directStockInsumoId: 'stock-resale',
        );

        final entity = InventoryMapper.toProductEntity(product);
        final roundTrip = InventoryMapper.toProductDomain(entity);

        expect(entity.inventoryPolicy, 'directStock');
        expect(roundTrip.inventoryPolicy, InventoryPolicy.directStock);
        expect(roundTrip.directStockInsumoId, 'stock-resale');
      },
    );

    test(
      'keeps unprovisioned product policy fields null for compatibility',
      () {
        final entity = ProductEntity(
          id: 'legacy',
          name: 'Legacy',
          uom: 'unit',
          stock: 0,
          averageCost: 0,
          sellPrice: 10,
        );

        final product = InventoryMapper.toProductDomain(entity);

        expect(product.inventoryPolicy, isNull);
        expect(product.directStockInsumoId, isNull);
      },
    );
  });
}
