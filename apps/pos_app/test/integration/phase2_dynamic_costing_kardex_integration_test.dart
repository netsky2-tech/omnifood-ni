import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:dio/dio.dart';
import 'package:mockito/mockito.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/repositories/inventory/inventory_repository_impl.dart';
import 'package:pos_app/domain/models/inventory/insumo.dart';
import 'package:pos_app/domain/models/inventory/inventory_movement.dart';
import 'package:pos_app/domain/models/inventory/product.dart';
import 'package:pos_app/domain/models/inventory/recipe.dart';
import 'package:pos_app/domain/services/alerts/alert_service.dart';
import 'package:pos_app/domain/services/inventory/movement_engine_impl.dart';

class MockDio extends Mock implements Dio {}

class MockAlertService extends Mock implements AlertService {
  @override
  Future<void> createStockAlert(Insumo? insumo, double? currentStock) =>
      super.noSuchMethod(
        Invocation.method(#createStockAlert, [insumo, currentStock]),
        returnValue: Future<void>.value(),
        returnValueForMissingStub: Future<void>.value(),
      );
}

void main() {
  late AppDatabase database;
  late InventoryRepositoryImpl repository;
  late MovementEngineImpl movementEngine;
  late MockDio mockDio;
  late MockAlertService mockAlertService;

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  setUp(() async {
    database = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();
    mockDio = MockDio();
    mockAlertService = MockAlertService();

    repository = InventoryRepositoryImpl(
      insumoDao: database.insumoDao,
      recipeDao: database.recipeDao,
      movementDao: database.movementDao,
      movementSyncStateDao: database.movementSyncStateDao,
      supplierDao: database.supplierDao,
      warehouseDao: database.warehouseDao,
      countSessionDao: database.countSessionDao,
      countLineDao: database.countLineDao,
      forensicAlertDao: database.forensicAlertDao,
      uomConversionDao: database.uomConversionDao,
      batchDao: database.batchDao,
      purchaseDao: database.purchaseDao,
      recipeVersionDocumentDao: database.recipeVersionDocumentDao,
      productionOrderDocumentDao: database.productionOrderDocumentDao,
      dio: mockDio,
      database: database,
    );

    movementEngine = MovementEngineImpl(repository, mockAlertService);
  });

  tearDown(() async {
    await database.close();
  });

  group('Fase 2: Costeo Dinámico y Ajustes de Inventario (Kardex CPP & COGS)', () {
    test('Ciclo completo: Compra 1 + Compra 2 -> Recálculo CPP -> Merma -> Deducción Receta COGS', () async {
      // Setup Insumo inicial: Café Grano con stock 0 y costo inicial 0
      const cafeGranoId = 'insumo-cafe-grano-01';
      final initialInsumo = Insumo(
        id: cafeGranoId,
        name: 'Café Grano',
        consumptionUom: 'kg',
        stock: 0.0,
        averageCost: 0.0,
      );
      await repository.saveInsumo(initialInsumo);

      // 1. Compra 1: 5 kg a C$ 350.00 / kg
      // Validación Esperada: Stock = 5 kg, CPP = C$ 350.00
      await movementEngine.recordPurchase(
        cafeGranoId,
        5.0,
        350.0,
        reason: 'Compra 1 - Proveedor Matagalpa',
      );

      final insumoAfterPurchase1 = await repository.getInsumoById(cafeGranoId);
      expect(insumoAfterPurchase1, isNotNull);
      expect(insumoAfterPurchase1!.stock, equals(5.0));
      expect(insumoAfterPurchase1.averageCost, equals(350.0));

      // 2. Compra 2: 5 kg a C$ 400.00 / kg
      // Validación Esperada: Stock = 10 kg, CPP Recalculado = (5*350 + 5*400) / 10 = (1750 + 2000) / 10 = C$ 375.00
      await movementEngine.recordPurchase(
        cafeGranoId,
        5.0,
        400.0,
        reason: 'Compra 2 - Proveedor Jinotega',
      );

      final insumoAfterPurchase2 = await repository.getInsumoById(cafeGranoId);
      expect(insumoAfterPurchase2, isNotNull);
      expect(insumoAfterPurchase2!.stock, equals(10.0));
      expect(insumoAfterPurchase2.averageCost, equals(375.0));

      // 3. Ajuste Manual: Café Grano -0.5 kg (Merma/Derrame)
      // Validación Esperada: Stock = 9.5 kg, Movimiento OUT_SHRINKAGE con costo C$ 187.50 (0.5 * 375.00)
      await movementEngine.recordShrinkage(
        cafeGranoId,
        0.5,
        'Merma/Derrame de grano en tolva',
      );

      final insumoAfterShrinkage = await repository.getInsumoById(cafeGranoId);
      expect(insumoAfterShrinkage, isNotNull);
      expect(insumoAfterShrinkage!.stock, equals(9.5));
      // El CPP se mantiene inalterado tras la merma según normativa contable estándar
      expect(insumoAfterShrinkage.averageCost, equals(375.0));

      // Validar el registro del movimiento de merma en el Kardex
      final allMovements = await repository.getAllMovements();
      final shrinkageMovement = allMovements.firstWhere(
        (m) => m.type == MovementType.shrinkage && m.insumoId == cafeGranoId,
      );
      expect(shrinkageMovement.quantity, equals(-0.5));
      expect(shrinkageMovement.previousStock, equals(10.0));
      expect(shrinkageMovement.newStock, equals(9.5));
      expect(shrinkageMovement.unitCostNio, equals(375.0));

      final totalShrinkageValuation = shrinkageMovement.quantity.abs() * (shrinkageMovement.unitCostNio ?? 0.0);
      expect(totalShrinkageValuation, equals(187.50));

      // 4. Prueba de Receta: Café Latte (requiere 0.02 kg de Café Grano)
      const cafeLatteProductId = 'prod-cafe-latte-01';
      final product = const Product(
        id: cafeLatteProductId,
        name: 'Café Latte',
        uom: 'unit',
        stock: 100.0,
        averageCost: 7.5,
        sellPrice: 80.0,
        isPrepared: true,
      );
      await repository.saveProduct(product);

      final recipe = Recipe(
        id: 'recipe-latte-01',
        productId: cafeLatteProductId,
        ingredientId: cafeGranoId,
        ingredientType: IngredientType.insumo,
        quantity: 0.02,
      );
      await repository.saveRecipe(recipe);

      // Vender 1 Café Latte
      await movementEngine.recordSale(
        cafeLatteProductId,
        1,
      );

      final insumoAfterSale = await repository.getInsumoById(cafeGranoId);
      expect(insumoAfterSale, isNotNull);
      expect(insumoAfterSale!.stock, closeTo(9.48, 0.0001));

      // Validar que se registró el movimiento de venta asociado a la receta
      final saleMovements = await repository.getAllMovements();
      final saleDeduction = saleMovements.firstWhere(
        (m) => m.type == MovementType.sale && m.insumoId == cafeGranoId,
      );
      expect(saleDeduction.quantity, closeTo(-0.02, 0.0001));
      expect(saleDeduction.previousStock, equals(9.5));
      expect(saleDeduction.newStock, closeTo(9.48, 0.0001));

      // 5. Validación del Costo de Venta (COGS)
      // COGS = 0.02 kg * C$ 375.00 = C$ 7.50 (no con C$ 350.00)
      final cogsInsumo = 0.02 * insumoAfterShrinkage.averageCost;
      expect(cogsInsumo, equals(7.50));

      const precioVentaLatteNio = 80.0;
      final margenBrutoNio = precioVentaLatteNio - cogsInsumo;
      expect(margenBrutoNio, equals(72.50));
      final margenBrutoPorcentaje = (margenBrutoNio / precioVentaLatteNio) * 100;
      expect(margenBrutoPorcentaje, equals(90.625));

      final finalInsumo = await repository.getInsumoById(cafeGranoId);
      expect(finalInsumo!.stock, closeTo(9.48, 0.0001));
      expect(finalInsumo.averageCost, equals(375.0));
    });
  });
}
