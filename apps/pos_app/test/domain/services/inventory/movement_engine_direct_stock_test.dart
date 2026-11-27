import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:pos_app/data/mappers/inventory_mapper.dart';
import 'package:pos_app/data/models/inventory/product_entity.dart';
import 'package:pos_app/domain/models/fulfillment/fulfillment_contracts.dart';
import 'package:pos_app/domain/models/inventory/insumo.dart';
import 'package:pos_app/domain/models/inventory/inventory_movement.dart';
import 'package:pos_app/domain/models/inventory/product.dart';
import 'package:pos_app/domain/services/inventory/movement_engine_impl.dart';

import 'movement_engine_test.mocks.dart';

void main() {
  late MockInventoryRepository mockRepo;
  late MockAlertService mockAlerts;
  late MovementEngineImpl engine;

  setUp(() {
    mockRepo = MockInventoryRepository();
    mockAlerts = MockAlertService();
    engine = MovementEngineImpl(mockRepo, mockAlerts);
  });

  group('MovementEngineImpl directStock & notTracked resolution (D2)', () {
    test(
      'directStock prefers canonical product.insumoId over deprecated directStockInsumoId',
      () async {
        const product = Product(
          id: 'prod-coca',
          name: 'Coca-Cola 600ml',
          uom: 'UND',
          stock: 12,
          averageCost: 15,
          sellPrice: 25,
          productType: 'SIMPLE',
          inventoryPolicy: InventoryPolicy.directStock,
          mappingVersionId: 'mv-coca-1',
          insumoId: 'insumo-canonical',
          directStockInsumoId: 'insumo-legacy-dead',
        );
        const canonicalInsumo = Insumo(
          id: 'insumo-canonical',
          name: 'Coca-Cola 600ml [Reventa]',
          consumptionUom: 'UND',
          stock: 12,
          averageCost: 15,
        );

        when(mockRepo.getProductById('prod-coca'))
            .thenAnswer((_) async => product);
        when(mockRepo.getInsumosByIds(['insumo-canonical']))
            .thenAnswer((_) async => [canonicalInsumo]);

        final movements = await engine.getSaleMovements('prod-coca', 3);

        expect(movements, hasLength(1));
        expect(movements.single.insumoId, 'insumo-canonical');
        expect(movements.single.type, MovementType.sale);
        expect(movements.single.quantity, -3.0);
        expect(movements.single.previousStock, 12.0);
        expect(movements.single.newStock, 9.0);
        verify(mockRepo.getInsumosByIds(['insumo-canonical'])).called(1);
        verifyNever(mockRepo.getInsumosByIds(['insumo-legacy-dead']));
      },
    );

    test(
      'directStock resolves via canonical insumoId when deprecated directStockInsumoId is null',
      () async {
        const product = Product(
          id: 'prod-agua',
          name: 'Agua Pura 500ml',
          uom: 'UND',
          stock: 20,
          averageCost: 8,
          sellPrice: 15,
          productType: 'SIMPLE',
          inventoryPolicy: InventoryPolicy.directStock,
          mappingVersionId: 'mv-agua-1',
          insumoId: 'insumo-agua',
        );
        const aguaInsumo = Insumo(
          id: 'insumo-agua',
          name: 'Agua Pura 500ml [Reventa]',
          consumptionUom: 'UND',
          stock: 20,
          averageCost: 8,
        );

        when(mockRepo.getProductById('prod-agua'))
            .thenAnswer((_) async => product);
        when(mockRepo.getInsumosByIds(['insumo-agua']))
            .thenAnswer((_) async => [aguaInsumo]);

        final movements = await engine.getSaleMovements('prod-agua', 2);

        expect(movements, hasLength(1));
        expect(movements.single.insumoId, 'insumo-agua');
        expect(movements.single.quantity, -2.0);
        expect(movements.single.newStock, 18.0);
      },
    );

    test(
      'directStock falls back to deprecated directStockInsumoId when canonical insumoId is null',
      () async {
        const product = Product(
          id: 'prod-legacy',
          name: 'Legacy Resale',
          uom: 'UND',
          stock: 5,
          averageCost: 10,
          sellPrice: 20,
          productType: 'SIMPLE',
          inventoryPolicy: InventoryPolicy.directStock,
          directStockInsumoId: 'insumo-legacy-only',
        );
        const legacyInsumo = Insumo(
          id: 'insumo-legacy-only',
          name: 'Legacy Insumo',
          consumptionUom: 'UND',
          stock: 5,
          averageCost: 10,
        );

        when(mockRepo.getProductById('prod-legacy'))
            .thenAnswer((_) async => product);
        when(mockRepo.getInsumosByIds(['insumo-legacy-only']))
            .thenAnswer((_) async => [legacyInsumo]);

        final movements = await engine.getSaleMovements('prod-legacy', 1);

        expect(movements, hasLength(1));
        expect(movements.single.insumoId, 'insumo-legacy-only');
        expect(movements.single.quantity, -1.0);
      },
    );

    test('notTracked emits 0 movements on sale and 0 on reversal', () async {
      const product = Product(
        id: 'prod-soho',
        name: 'Servicio Mesa',
        uom: 'UND',
        stock: 0,
        averageCost: 0,
        sellPrice: 50,
        productType: 'SIMPLE',
        inventoryPolicy: InventoryPolicy.notTracked,
      );

      when(mockRepo.getProductById('prod-soho'))
          .thenAnswer((_) async => product);

      final saleMovements = await engine.getSaleMovements('prod-soho', 4);
      final reversalMovements = await engine.getReversalMovements(
        'prod-soho',
        4,
        'SALE_CANCEL',
      );

      expect(saleMovements, isEmpty);
      expect(reversalMovements, isEmpty);
    });

    test(
      'directStock reversal emits symmetric +quantity movement preferring insumoId',
      () async {
        const product = Product(
          id: 'prod-coca',
          name: 'Coca-Cola 600ml',
          uom: 'UND',
          stock: 9,
          averageCost: 15,
          sellPrice: 25,
          productType: 'SIMPLE',
          inventoryPolicy: InventoryPolicy.directStock,
          mappingVersionId: 'mv-coca-1',
          insumoId: 'insumo-canonical',
          directStockInsumoId: 'insumo-legacy-dead',
        );
        const canonicalInsumo = Insumo(
          id: 'insumo-canonical',
          name: 'Coca-Cola 600ml [Reventa]',
          consumptionUom: 'UND',
          stock: 9,
          averageCost: 15,
        );

        when(mockRepo.getProductById('prod-coca'))
            .thenAnswer((_) async => product);
        when(mockRepo.getInsumosByIds(['insumo-canonical']))
            .thenAnswer((_) async => [canonicalInsumo]);

        final reversals = await engine.getReversalMovements(
          'prod-coca',
          3,
          'SALE_CANCEL',
        );

        expect(reversals, hasLength(1));
        expect(reversals.single.insumoId, 'insumo-canonical');
        expect(reversals.single.type, MovementType.reversal);
        expect(reversals.single.quantity, 3.0);
        expect(reversals.single.previousStock, 9.0);
        expect(reversals.single.newStock, 12.0);
      },
    );
  });

  group('InventoryMapper inventoryPolicy backend/POS round-trip', () {
    test('normalizes backend DIRECT_STOCK and NOT_TRACKED and round-trips', () {
      expect(
        InventoryMapper.normalizeInventoryPolicyStorage('DIRECT_STOCK'),
        'directStock',
      );
      expect(
        InventoryMapper.normalizeInventoryPolicyStorage('NOT_TRACKED'),
        'notTracked',
      );
      expect(
        InventoryMapper.normalizeInventoryPolicyStorage('RECIPE_BOM'),
        'recipeBom',
      );

      final directEntity = ProductEntity(
        id: 'p1',
        name: 'Coca',
        uom: 'UND',
        stock: 10,
        averageCost: 15,
        sellPrice: 25,
        inventoryPolicy: 'DIRECT_STOCK',
        insumoId: 'ins-1',
        mappingVersionId: 'mv-1',
      );
      final domain = InventoryMapper.toProductDomain(directEntity);
      expect(domain.inventoryPolicy, InventoryPolicy.directStock);

      final roundTripped = InventoryMapper.toProductEntity(domain);
      expect(roundTripped.inventoryPolicy, 'directStock');
      expect(
        InventoryMapper.toProductDomain(roundTripped).inventoryPolicy,
        InventoryPolicy.directStock,
      );
    });
  });
}
