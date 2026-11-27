import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/mappers/inventory_mapper.dart';
import 'package:pos_app/data/models/inventory/authority_projection_entities.dart';
import 'package:pos_app/data/models/inventory/insumo_entity.dart';
import 'package:pos_app/data/models/inventory/product_entity.dart';
import 'package:pos_app/domain/models/fulfillment/fulfillment_contracts.dart';
import 'package:pos_app/domain/models/inventory/insumo.dart';
import 'package:pos_app/domain/models/inventory/inventory_movement.dart';
import 'package:pos_app/domain/models/inventory/product.dart';
import 'package:pos_app/domain/models/inventory/recipe.dart';
import 'package:pos_app/domain/models/inventory/recipe_version_document.dart';
import 'package:pos_app/domain/models/sales/invoice.dart';
import 'package:pos_app/domain/models/sales/invoice_item.dart';
import 'package:pos_app/domain/models/sales/sale_time_inventory_snapshot.dart';
import 'package:pos_app/domain/services/inventory/movement_engine_impl.dart';
import 'package:pos_app/domain/usecases/inventory/checkout_inventory_preparation_service.dart';
import 'package:pos_app/domain/usecases/inventory/frozen_sale_inventory_movement_boundary.dart';
import 'package:pos_app/domain/usecases/inventory/reverse_sale_inventory_use_case.dart';

import '../../services/inventory/movement_engine_test.mocks.dart';

void main() {
  late AppDatabase database;
  late CheckoutInventoryPreparationService preparationService;

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  setUp(() async {
    database = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();
    preparationService = CheckoutInventoryPreparationService(database);
  });

  tearDown(() async {
    await database.close();
  });

  test(
    '6-product-type coexistence: mixed cart checkout (SALE_TIME_V1) + boundary + symmetric SALE_CANCEL void',
    () async {
      const tenantId = 'tenant-coexist';
      final dao = database.authorityProjectionDao;

      // Seed authority insumos
      for (final insumo in const [
        AuthorityInsumoEntity(
          tenantId: tenantId,
          id: 'ins-coca',
          name: 'Coca-Cola 600ml [Reventa]',
          uom: 'UND',
        ),
        AuthorityInsumoEntity(
          tenantId: tenantId,
          id: 'ins-legacy-agua',
          name: 'Agua Pura [Legacy]',
          uom: 'UND',
        ),
        AuthorityInsumoEntity(
          tenantId: tenantId,
          id: 'ins-beef',
          name: 'Carne Molida',
          uom: 'KG',
        ),
        AuthorityInsumoEntity(
          tenantId: tenantId,
          id: 'ins-bacon',
          name: 'Tocineta Extra',
          uom: 'UND',
        ),
        AuthorityInsumoEntity(
          tenantId: tenantId,
          id: 'ins-tortilla',
          name: 'Tortilla',
          uom: 'UND',
        ),
        AuthorityInsumoEntity(
          tenantId: tenantId,
          id: 'ins-pollo',
          name: 'Pollo Desmenuzado',
          uom: 'KG',
        ),
      ]) {
        await dao.insertInsumo(insumo);
      }

      await database.insumoDao.insertInsumos([
        InsumoEntity(
          id: 'ins-coca',
          name: 'Coca-Cola 600ml [Reventa]',
          consumptionUom: 'UND',
          stock: 24,
          averageCost: 15,
        ),
        InsumoEntity(
          id: 'ins-legacy-agua',
          name: 'Agua Pura [Legacy]',
          consumptionUom: 'UND',
          stock: 15,
          averageCost: 8,
        ),
        InsumoEntity(
          id: 'ins-beef',
          name: 'Carne Molida',
          consumptionUom: 'KG',
          stock: 10,
          averageCost: 180,
        ),
        InsumoEntity(
          id: 'ins-bacon',
          name: 'Tocineta Extra',
          consumptionUom: 'UND',
          stock: 30,
          averageCost: 12,
        ),
        InsumoEntity(
          id: 'ins-tortilla',
          name: 'Tortilla',
          consumptionUom: 'UND',
          stock: 100,
          averageCost: 2,
        ),
        InsumoEntity(
          id: 'ins-pollo',
          name: 'Pollo Desmenuzado',
          consumptionUom: 'KG',
          stock: 8,
          averageCost: 140,
        ),
      ]);

      await database.productDao.insertProducts([
        // 1. SIMPLE + NOT_TRACKED (SOHO invariance)
        ProductEntity(
          id: 'prod-soho',
          name: 'Propina / Servicio',
          uom: 'UND',
          stock: 0,
          averageCost: 0,
          sellPrice: 20,
          productType: 'SIMPLE',
          isPrepared: false,
          inventoryPolicy: 'notTracked',
          tenantId: tenantId,
        ),
        // 2. SIMPLE + DIRECT_STOCK (DEC-8 with mappingVersionId + insumoId)
        ProductEntity(
          id: 'prod-coca',
          name: 'Coca-Cola 600ml',
          uom: 'UND',
          stock: 24,
          averageCost: 15,
          sellPrice: 30,
          productType: 'SIMPLE',
          isPrepared: false,
          inventoryPolicy: 'directStock',
          mappingVersionId: 'mv-coca-1',
          insumoId: 'ins-coca',
          tenantId: tenantId,
        ),
        // 3. SIMPLE + explicit legacy mapping (direct 1:1 without DEC-8 policy)
        ProductEntity(
          id: 'prod-agua-legacy',
          name: 'Agua Pura 500ml',
          uom: 'UND',
          stock: 15,
          averageCost: 8,
          sellPrice: 20,
          productType: 'SIMPLE',
          isPrepared: false,
          mappingVersionId: 'mv-agua-legacy',
          insumoId: 'ins-legacy-agua',
          tenantId: tenantId,
        ),
        // 4. COMPOUND + direct recipe + modifier ADD
        ProductEntity(
          id: 'prod-burger',
          name: 'Hamburguesa Clásica',
          uom: 'UND',
          stock: 0,
          averageCost: 0,
          sellPrice: 180,
          productType: 'COMPOUND',
          isPrepared: true,
          tenantId: tenantId,
        ),
      ]);
      await dao.insertRecipeVersion(
        const AuthorityRecipeVersionEntity(
          tenantId: tenantId,
          id: 'rv-burger-1',
          productId: 'prod-burger',
          versionNumber: 1,
          isActive: true,
          publicationState: 'PUBLISHED',
          effectiveFrom: '2026-01-01T00:00:00Z',
          yieldQuantity: 1.0,
          technicalShrinkPct: 0.0,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        ),
      );
      await dao.insertComponent(
        const AuthorityRecipeVersionComponentEntity(
          tenantId: tenantId,
          id: 'comp-burger-beef',
          versionId: 'rv-burger-1',
          ordinal: 0,
          insumoId: 'ins-beef',
          grossQuantity: 0.2,
          technicalShrinkPct: 0.0,
          ingredientType: 'DIRECT',
          componentName: 'Carne',
        ),
      );

      // 5. COMPOUND + nested SUB_RECIPE (2-level BOM with yieldQuantity + technicalShrinkPct)
      // Sub-recipe: yieldQuantity = 2.0, component ins-pollo gross = 0.50, shrink = 10%
      // Note: SubRecipeBomExplosion uses component grossQuantity / parent yield or
      // technicalShrinkPct depending on authority components; let's verify exact 4dp output.
      await database.productDao.insertProducts([
        ProductEntity(
          id: 'prod-sub-relleno',
          name: 'Relleno de Pollo (Sub-receta)',
          uom: 'PORCION',
          stock: 0,
          averageCost: 0,
          sellPrice: 0,
          productType: 'COMPOUND',
          isPrepared: true,
          tenantId: tenantId,
        ),
      ]);
      await dao.insertRecipeVersion(
        const AuthorityRecipeVersionEntity(
          tenantId: tenantId,
          id: 'rv-sub-relleno',
          productId: 'prod-sub-relleno',
          versionNumber: 1,
          isActive: true,
          publicationState: 'PUBLISHED',
          effectiveFrom: '2026-01-01T00:00:00Z',
          yieldQuantity: 2.0,
          technicalShrinkPct: 10.0,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        ),
      );
      await dao.insertComponent(
        const AuthorityRecipeVersionComponentEntity(
          tenantId: tenantId,
          id: 'comp-sub-pollo',
          versionId: 'rv-sub-relleno',
          ordinal: 0,
          insumoId: 'ins-pollo',
          grossQuantity: 0.5,
          technicalShrinkPct: 10.0,
          ingredientType: 'DIRECT',
          componentName: 'Pollo',
        ),
      );

      await database.productDao.insertProducts([
        ProductEntity(
          id: 'prod-tacos',
          name: 'Orden de Tacos',
          uom: 'UND',
          stock: 0,
          averageCost: 0,
          sellPrice: 120,
          productType: 'COMPOUND',
          isPrepared: true,
          tenantId: tenantId,
        ),
        // 6. COMPOUND without published recipe (PENDING_RECIPE, must never block checkout)
        ProductEntity(
          id: 'prod-nuevo-plato',
          name: 'Plato Especial Sin Receta',
          uom: 'UND',
          stock: 0,
          averageCost: 0,
          sellPrice: 220,
          productType: 'COMPOUND',
          isPrepared: true,
          tenantId: tenantId,
        ),
      ]);
      await dao.insertRecipeVersion(
        const AuthorityRecipeVersionEntity(
          tenantId: tenantId,
          id: 'rv-tacos-1',
          productId: 'prod-tacos',
          versionNumber: 1,
          isActive: true,
          publicationState: 'PUBLISHED',
          effectiveFrom: '2026-01-01T00:00:00Z',
          yieldQuantity: 1.0,
          technicalShrinkPct: 0.0,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        ),
      );
      await dao.insertComponent(
        const AuthorityRecipeVersionComponentEntity(
          tenantId: tenantId,
          id: 'comp-tacos-tortilla',
          versionId: 'rv-tacos-1',
          ordinal: 0,
          insumoId: 'ins-tortilla',
          grossQuantity: 3.0,
          technicalShrinkPct: 0.0,
          ingredientType: 'DIRECT',
          componentName: 'Tortillas',
        ),
      );
      await dao.insertComponent(
        const AuthorityRecipeVersionComponentEntity(
          tenantId: tenantId,
          id: 'comp-tacos-relleno',
          versionId: 'rv-tacos-1',
          ordinal: 1,
          insumoId: 'prod-sub-relleno',
          grossQuantity: 1.0,
          technicalShrinkPct: 0.0,
          ingredientType: 'SUB_RECIPE',
          componentName: 'Relleno',
        ),
      );

      // (prod-nuevo-plato inserted above)

      final invoice = Invoice(
        id: 'inv-coexist-1',
        number: 'F-0001',
        createdAt: DateTime.parse('2026-10-01T15:00:00Z'),
        userId: 'user-1',
        subtotal: 590.0,
        totalTax: 0.0,
        total: 590.0,
        terminalId: 'term-1',
      );

      final items = <InvoiceItem>[
        const InvoiceItem(
          id: 'line-1-soho',
          invoiceId: 'inv-coexist-1',
          productId: 'prod-soho',
          productName: 'Propina / Servicio',
          quantity: 1,
          unitPrice: 20,
          originalTaxRate: 0,
          appliedTaxRate: 0,
          taxAmount: 0,
          total: 20,
        ),
        const InvoiceItem(
          id: 'line-2-coca',
          invoiceId: 'inv-coexist-1',
          productId: 'prod-coca',
          productName: 'Coca-Cola 600ml',
          quantity: 2,
          unitPrice: 30,
          originalTaxRate: 0,
          appliedTaxRate: 0,
          taxAmount: 0,
          total: 60,
        ),
        const InvoiceItem(
          id: 'line-3-legacy',
          invoiceId: 'inv-coexist-1',
          productId: 'prod-agua-legacy',
          productName: 'Agua Pura 500ml',
          quantity: 1,
          unitPrice: 20,
          originalTaxRate: 0,
          appliedTaxRate: 0,
          taxAmount: 0,
          total: 20,
        ),
        const InvoiceItem(
          id: 'line-4-burger',
          invoiceId: 'inv-coexist-1',
          productId: 'prod-burger',
          productName: 'Hamburguesa Clásica',
          quantity: 1,
          unitPrice: 180,
          originalTaxRate: 0,
          appliedTaxRate: 0,
          taxAmount: 0,
          total: 180,
          selectedModifiers: [
            Modifier(
              id: 'mod-bacon',
              name: 'Extra: Tocineta',
              extraPrice: 25,
              quantity: 1,
              optionId: 'opt-bacon',
              groupId: 'grp-extras',
              inventoryEffect: 'ADD',
              effectInsumoId: 'ins-bacon',
              effectQuantity: 2.0,
            ),
          ],
        ),
        const InvoiceItem(
          id: 'line-5-tacos',
          invoiceId: 'inv-coexist-1',
          productId: 'prod-tacos',
          productName: 'Orden de Tacos',
          quantity: 2,
          unitPrice: 120,
          originalTaxRate: 0,
          appliedTaxRate: 0,
          taxAmount: 0,
          total: 240,
        ),
        const InvoiceItem(
          id: 'line-6-pending',
          invoiceId: 'inv-coexist-1',
          productId: 'prod-nuevo-plato',
          productName: 'Plato Especial Sin Receta',
          quantity: 1,
          unitPrice: 220,
          originalTaxRate: 0,
          appliedTaxRate: 0,
          taxAmount: 0,
          total: 220,
        ),
      ];

      final prepared = await preparationService.prepare(
        invoice: invoice,
        items: items,
        offlineUserId: 'user-1',
        tenantId: tenantId,
        terminalId: 'term-1',
      );

      expect(prepared.items, hasLength(6));
      final snapByLine = {
        for (final item in prepared.items) item.id: item.inventorySnapshot!,
      };

      // 1. SIMPLE + NOT_TRACKED -> noImpact
      expect(
        snapByLine['line-1-soho']!.disposition,
        SaleInventoryDisposition.noImpact,
      );
      expect(snapByLine['line-1-soho']!.bindings, isEmpty);

      // 2. SIMPLE + DIRECT_STOCK -> direct 1:1
      expect(
        snapByLine['line-2-coca']!.disposition,
        SaleInventoryDisposition.direct,
      );
      expect(snapByLine['line-2-coca']!.bindings, hasLength(1));
      expect(snapByLine['line-2-coca']!.bindings.single.insumoId, 'ins-coca');
      expect(
        snapByLine['line-2-coca']!.bindings.single.quantityPerSaleUnit,
        1.0,
      );

      // 3. SIMPLE + explicit legacy mapping -> direct 1:1
      expect(
        snapByLine['line-3-legacy']!.disposition,
        SaleInventoryDisposition.direct,
      );
      expect(
        snapByLine['line-3-legacy']!.bindings.single.insumoId,
        'ins-legacy-agua',
      );
      expect(
        snapByLine['line-3-legacy']!.bindings.single.quantityPerSaleUnit,
        1.0,
      );

      // 4. COMPOUND + direct recipe + modifier ADD -> recipe (beef + bacon)
      expect(
        snapByLine['line-4-burger']!.disposition,
        SaleInventoryDisposition.recipe,
      );
      final burgerInsumos = {
        for (final b in snapByLine['line-4-burger']!.bindings)
          b.insumoId: b.quantityPerSaleUnit,
      };
      expect(burgerInsumos['ins-beef'], 0.2);
      expect(burgerInsumos['ins-bacon'], 2.0);

      // 5. COMPOUND + nested SUB_RECIPE -> recipe (tortillas + pollo 4dp)
      expect(
        snapByLine['line-5-tacos']!.disposition,
        SaleInventoryDisposition.recipe,
      );
      final tacosInsumos = {
        for (final b in snapByLine['line-5-tacos']!.bindings)
          b.insumoId: b.quantityPerSaleUnit,
      };
      expect(tacosInsumos['ins-tortilla'], 3.0);
      expect(tacosInsumos['ins-pollo'], closeTo(0.225, 0.0001));

      // 6. COMPOUND without published recipe -> pendingRecipe (never blocks checkout)
      expect(
        snapByLine['line-6-pending']!.disposition,
        SaleInventoryDisposition.pendingRecipe,
      );

      // FrozenSaleInventoryMovementBoundary on lines 1..5 -> applied
      final boundary = FrozenSaleInventoryMovementBoundary();
      final resolvedBoundary = boundary.derive([
        for (final item in prepared.items.take(5))
          FrozenSaleInventoryMovementLine(
            invoiceItemId: item.id,
            quantity: item.quantity,
            snapshot: item.inventorySnapshot!,
          ),
      ]);
      expect(resolvedBoundary.outcome, LocalSaleMovementOutcome.applied);

      final qtyByInsumo = <String, double>{};
      for (final m in resolvedBoundary.movements) {
        qtyByInsumo[m.insumoId] = (qtyByInsumo[m.insumoId] ?? 0) + m.quantity;
      }
      expect(qtyByInsumo['ins-coca'], 2.0);
      expect(qtyByInsumo['ins-legacy-agua'], 1.0);
      expect(qtyByInsumo['ins-beef'], closeTo(0.2, 0.0001));
      expect(qtyByInsumo['ins-bacon'], 2.0);
      expect(qtyByInsumo['ins-tortilla'], 6.0);
      expect(qtyByInsumo['ins-pollo'], closeTo(0.45, 0.0001));

      // Including pendingRecipe line in boundary suppresses cleanly without throwing
      final withPendingBoundary = boundary.derive([
        for (final item in prepared.items)
          FrozenSaleInventoryMovementLine(
            invoiceItemId: item.id,
            quantity: item.quantity,
            snapshot: item.inventorySnapshot!,
          ),
      ]);
      expect(
        withPendingBoundary.outcome,
        LocalSaleMovementOutcome.suppressedInventoryPending,
      );

      // Symmetric void (SALE_CANCEL) via ReverseSaleInventoryUseCase
      final mockRepo = MockInventoryRepository();
      final mockAlerts = MockAlertService();
      final movementEngine = MovementEngineImpl(mockRepo, mockAlerts);
      final reverseUseCase = ReverseSaleInventoryUseCase(movementEngine);

      final productsById = <String, Product>{
        'prod-soho': const Product(
          id: 'prod-soho',
          name: 'Propina / Servicio',
          uom: 'UND',
          stock: 0,
          averageCost: 0,
          sellPrice: 20,
          productType: 'SIMPLE',
          inventoryPolicy: InventoryPolicy.notTracked,
        ),
        'prod-coca': const Product(
          id: 'prod-coca',
          name: 'Coca-Cola 600ml',
          uom: 'UND',
          stock: 22,
          averageCost: 15,
          sellPrice: 30,
          productType: 'SIMPLE',
          inventoryPolicy: InventoryPolicy.directStock,
          mappingVersionId: 'mv-coca-1',
          insumoId: 'ins-coca',
        ),
        'prod-agua-legacy': const Product(
          id: 'prod-agua-legacy',
          name: 'Agua Pura 500ml',
          uom: 'UND',
          stock: 14,
          averageCost: 8,
          sellPrice: 20,
          productType: 'SIMPLE',
          inventoryPolicy: InventoryPolicy.directStock,
          mappingVersionId: 'mv-agua-legacy',
          insumoId: 'ins-legacy-agua',
        ),
        'prod-burger': const Product(
          id: 'prod-burger',
          name: 'Hamburguesa Clásica',
          uom: 'UND',
          stock: 0,
          averageCost: 0,
          sellPrice: 180,
          productType: 'COMPOUND',
          isPrepared: true,
        ),
        'prod-tacos': const Product(
          id: 'prod-tacos',
          name: 'Orden de Tacos',
          uom: 'UND',
          stock: 0,
          averageCost: 0,
          sellPrice: 120,
          productType: 'COMPOUND',
          isPrepared: true,
        ),
        'prod-nuevo-plato': const Product(
          id: 'prod-nuevo-plato',
          name: 'Plato Especial Sin Receta',
          uom: 'UND',
          stock: 0,
          averageCost: 0,
          sellPrice: 220,
          productType: 'COMPOUND',
          isPrepared: true,
        ),
      };

      final insumosById = <String, Insumo>{
        'ins-coca': const Insumo(
          id: 'ins-coca',
          name: 'Coca-Cola 600ml [Reventa]',
          consumptionUom: 'UND',
          stock: 22,
          averageCost: 15,
        ),
        'ins-legacy-agua': const Insumo(
          id: 'ins-legacy-agua',
          name: 'Agua Pura [Legacy]',
          consumptionUom: 'UND',
          stock: 14,
          averageCost: 8,
        ),
        'ins-beef': const Insumo(
          id: 'ins-beef',
          name: 'Carne Molida',
          consumptionUom: 'KG',
          stock: 9.8,
          averageCost: 180,
        ),
        'ins-tortilla': const Insumo(
          id: 'ins-tortilla',
          name: 'Tortilla',
          consumptionUom: 'UND',
          stock: 94,
          averageCost: 2,
        ),
        'ins-pollo': const Insumo(
          id: 'ins-pollo',
          name: 'Pollo Desmenuzado',
          consumptionUom: 'KG',
          stock: 7.5,
          averageCost: 140,
        ),
      };

      when(mockRepo.getProductById(any)).thenAnswer(
        (inv) async => productsById[inv.positionalArguments.first as String],
      );
      when(mockRepo.getInsumosByIds(any)).thenAnswer((inv) async {
        final ids = inv.positionalArguments.first as List<String>;
        return [
          for (final id in ids)
            if (insumosById.containsKey(id)) insumosById[id]!,
        ];
      });
      when(mockRepo.getRecipeVersionDocumentById(any))
          .thenAnswer((_) async => null);
      when(mockRepo.getRecipeByProductId('prod-burger')).thenAnswer(
        (_) async => const [
          Recipe(
            id: 'r-burger-beef',
            productId: 'prod-burger',
            ingredientId: 'ins-beef',
            ingredientType: IngredientType.insumo,
            quantity: 0.2,
          ),
        ],
      );
      when(mockRepo.getRecipeByProductId('prod-tacos')).thenAnswer(
        (_) async => const [
          Recipe(
            id: 'r-tacos-tortilla',
            productId: 'prod-tacos',
            ingredientId: 'ins-tortilla',
            ingredientType: IngredientType.insumo,
            quantity: 3.0,
          ),
          Recipe(
            id: 'r-tacos-sub',
            productId: 'prod-tacos',
            ingredientId: 'prod-sub-relleno',
            ingredientType: IngredientType.product,
            quantity: 1.0,
          ),
        ],
      );
      when(mockRepo.getRecipeByProductId('prod-sub-relleno')).thenAnswer(
        (_) async => const [
          Recipe(
            id: 'r-sub-pollo',
            productId: 'prod-sub-relleno',
            ingredientId: 'ins-pollo',
            ingredientType: IngredientType.insumo,
            quantity: 0.225,
          ),
        ],
      );
      when(mockRepo.getRecipeByProductId('prod-nuevo-plato'))
          .thenAnswer((_) async => const []);

      final reversalMovements =
          await reverseUseCase.execute(prepared.items, 'SALE_CANCEL');

      final reversedQtyByInsumo = <String, double>{};
      for (final m in reversalMovements) {
        expect(m.type, MovementType.reversal);
        expect(m.quantity, greaterThan(0));
        reversedQtyByInsumo[m.insumoId] =
            (reversedQtyByInsumo[m.insumoId] ?? 0) + m.quantity;
      }

      expect(reversedQtyByInsumo['ins-coca'], 2.0);
      expect(reversedQtyByInsumo['ins-legacy-agua'], 1.0);
      expect(reversedQtyByInsumo['ins-beef'], closeTo(0.2, 0.0001));
      expect(reversedQtyByInsumo['ins-tortilla'], 6.0);
      expect(reversedQtyByInsumo['ins-pollo'], closeTo(0.45, 0.0001));
    },
  );
}
