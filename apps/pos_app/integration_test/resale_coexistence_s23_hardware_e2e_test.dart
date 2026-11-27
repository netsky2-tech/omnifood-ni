import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/mappers/inventory_mapper.dart';
import 'package:pos_app/data/mappers/sales_mapper.dart';
import 'package:pos_app/data/models/inventory/authority_projection_entities.dart';
import 'package:pos_app/data/models/inventory/insumo_entity.dart';
import 'package:pos_app/data/models/inventory/movement_entity.dart';
import 'package:pos_app/data/models/inventory/product_entity.dart';
import 'package:pos_app/data/models/inventory/recipe_entity.dart';
import 'package:pos_app/data/repositories/inventory/inventory_repository_impl.dart';
import 'package:pos_app/domain/models/fulfillment/fulfillment_contracts.dart';
import 'package:pos_app/domain/models/inventory/product.dart';
import 'package:pos_app/domain/models/inventory/recipe_version_document.dart';
import 'package:pos_app/domain/models/sales/invoice.dart';
import 'package:pos_app/domain/models/sales/invoice_item.dart';
import 'package:pos_app/domain/models/sales/payment.dart';
import 'package:pos_app/domain/models/sales/sale_time_inventory_snapshot.dart';
import 'package:pos_app/domain/services/inventory/movement_engine_impl.dart';
import 'package:pos_app/domain/usecases/inventory/checkout_inventory_preparation_service.dart';
import 'package:pos_app/domain/usecases/inventory/frozen_sale_inventory_movement_boundary.dart';
import 'package:pos_app/domain/usecases/inventory/reverse_sale_inventory_use_case.dart';
import 'package:pos_app/presentation/services/alert_service_impl.dart';

/// Real Android Hardware E2E Runner for #518 + #935 (DEC-8 Resale Direct Stock
/// & Full 6-Product-Type Coexistence on Samsung Galaxy S23 SM-S918B ARM64).
///
/// Uses 100% REAL on-device SQLite (AppDatabase via Floor), REAL DAOs, REAL
/// CheckoutInventoryPreparationService, REAL FrozenSaleInventoryMovementBoundary,
/// REAL SalesTransactionDao, and REAL ReverseSaleInventoryUseCase — ZERO MOCKS.
///
/// Build & run on attached Android device:
///   flutter build apk --debug -t integration_test/resale_coexistence_s23_hardware_e2e_test.dart
///   adb install -r build/app/outputs/flutter-apk/app-debug.apk
///   adb logcat -c && adb shell am start -n com.example.pos_app/.MainActivity
///   adb logcat -d -s flutter
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const _HardwareE2EResaleCoexistenceApp());
}

class _HardwareE2EResaleCoexistenceApp extends StatefulWidget {
  const _HardwareE2EResaleCoexistenceApp();

  @override
  State<_HardwareE2EResaleCoexistenceApp> createState() =>
      _HardwareE2EResaleCoexistenceAppState();
}

class _HardwareE2EResaleCoexistenceAppState
    extends State<_HardwareE2EResaleCoexistenceApp> {
  final List<String> _logs = [];
  String _status = 'RUNNING';

  @override
  void initState() {
    super.initState();
    _runAll();
  }

  void _log(String msg) {
    debugPrint('[S23_E2E_RESALE] $msg');
    if (mounted) {
      setState(() => _logs.add(msg));
    }
  }

  void _assertClose(double actual, double expected, String label) {
    if ((actual - expected).abs() > 0.0001) {
      throw StateError(
        'Assertion failed [$label]: expected $expected, got $actual',
      );
    }
  }

  void _assertTrue(bool condition, String label) {
    if (!condition) {
      throw StateError('Assertion failed [$label]');
    }
  }

  Future<void> _runAll() async {
    int passed = 0;
    const int total = 3;

    final docsDir = await getApplicationDocumentsDirectory();
    final workDir = Directory(
      '${docsDir.path}/s23_e2e_resale_${DateTime.now().millisecondsSinceEpoch}',
    );
    await workDir.create(recursive: true);
    final dbPath = '${workDir.path}/resale_coexistence_s23.db';

    AppDatabase? database;
    try {
      database = await $FloorAppDatabase.databaseBuilder(dbPath).build();

      const tenantId = 'tenant-s23-coexist';
      const userId = 'user-s23-1';
      const terminalId = 'S23-TERM-01';

      final authorityDao = database.authorityProjectionDao;
      final insumoDao = database.insumoDao;
      final productDao = database.productDao;
      final recipeDao = database.recipeDao;
      final salesTxDao = database.salesTransactionDao;

      final inventoryRepo = InventoryRepositoryImpl(
        insumoDao: insumoDao,
        recipeDao: recipeDao,
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
        productionTransactionDao: database.productionTransactionDao,
        dio: Dio(),
        database: database,
      );
      final alertService = AlertServiceImpl(inventoryRepo);
      final movementEngine = MovementEngineImpl(inventoryRepo, alertService);
      final preparationService = CheckoutInventoryPreparationService(database);
      final boundary = FrozenSaleInventoryMovementBoundary();
      final reverseUseCase = ReverseSaleInventoryUseCase(movementEngine);

      // -----------------------------------------------------------------------
      // Seed Real SQLite Tables: Insumos, Authority Projections, Products, Recipes
      // -----------------------------------------------------------------------
      for (final authInsumo in const [
        AuthorityInsumoEntity(
          tenantId: tenantId,
          id: 'ins-p2-resale',
          name: 'Refresco Reventa [Reventa]',
          uom: 'UND',
        ),
        AuthorityInsumoEntity(
          tenantId: tenantId,
          id: 'ins-p3-legacy',
          name: 'Botella Agua [Legacy]',
          uom: 'UND',
        ),
        AuthorityInsumoEntity(
          tenantId: tenantId,
          id: 'insumo_coffee',
          name: 'Café Molido',
          uom: 'KG',
        ),
        AuthorityInsumoEntity(
          tenantId: tenantId,
          id: 'insumo_syrup',
          name: 'Sirope Vainilla',
          uom: 'L',
        ),
        AuthorityInsumoEntity(
          tenantId: tenantId,
          id: 'insumo_cream',
          name: 'Crema Base',
          uom: 'L',
        ),
      ]) {
        await authorityDao.insertInsumo(authInsumo);
      }

      await insumoDao.insertInsumos([
        InsumoEntity(
          id: 'ins-p2-resale',
          name: 'Refresco Reventa [Reventa]',
          consumptionUom: 'UND',
          stock: 10.0,
          averageCost: 15.0,
        ),
        InsumoEntity(
          id: 'ins-p3-legacy',
          name: 'Botella Agua [Legacy]',
          consumptionUom: 'UND',
          stock: 8.0,
          averageCost: 10.0,
        ),
        InsumoEntity(
          id: 'insumo_coffee',
          name: 'Café Molido',
          consumptionUom: 'KG',
          stock: 5.0,
          averageCost: 220.0,
        ),
        InsumoEntity(
          id: 'insumo_syrup',
          name: 'Sirope Vainilla',
          consumptionUom: 'L',
          stock: 2.0,
          averageCost: 180.0,
        ),
        InsumoEntity(
          id: 'insumo_cream',
          name: 'Crema Base',
          consumptionUom: 'L',
          stock: 4.0,
          averageCost: 95.0,
        ),
      ]);

      await productDao.insertProducts([
        // P1: SIMPLE + NOT_TRACKED (SOHO invariance)
        ProductEntity(
          id: 'P1',
          name: 'Servicio / Propina SOHO',
          uom: 'UND',
          stock: 0,
          averageCost: 0,
          sellPrice: 25,
          productType: 'SIMPLE',
          isPrepared: false,
          inventoryPolicy: 'notTracked',
          tenantId: tenantId,
        ),
        // P2: SIMPLE + DIRECT_STOCK (DEC-8 resale)
        ProductEntity(
          id: 'P2',
          name: 'Refresco Reventa DEC-8',
          uom: 'UND',
          stock: 10.0,
          averageCost: 15.0,
          sellPrice: 35,
          productType: 'SIMPLE',
          isPrepared: false,
          inventoryPolicy: 'directStock',
          mappingVersionId: 'mv-p2-resale',
          insumoId: 'ins-p2-resale',
          tenantId: tenantId,
        ),
        // P3: SIMPLE + explicit legacy ProductInventoryMappingVersion
        ProductEntity(
          id: 'P3',
          name: 'Agua Pura Legacy',
          uom: 'UND',
          stock: 8.0,
          averageCost: 10.0,
          sellPrice: 20,
          productType: 'SIMPLE',
          isPrepared: false,
          mappingVersionId: 'mv-p3-legacy',
          insumoId: 'ins-p3-legacy',
          tenantId: tenantId,
        ),
        // P4: COMPOUND + direct recipe + modifier ADD
        ProductEntity(
          id: 'P4',
          name: 'Latte Especial',
          uom: 'UND',
          stock: 0,
          averageCost: 0,
          sellPrice: 95,
          productType: 'COMPOUND',
          isPrepared: true,
          tenantId: tenantId,
        ),
        // Sub-recipe for P5
        ProductEntity(
          id: 'prod-sub-cream',
          name: 'Base Batida (Sub-receta)',
          uom: 'PORCION',
          stock: 0,
          averageCost: 0,
          sellPrice: 0,
          productType: 'COMPOUND',
          isPrepared: true,
          tenantId: tenantId,
        ),
        // P5: COMPOUND + nested SUB_RECIPE
        ProductEntity(
          id: 'P5',
          name: 'Frappe Crema',
          uom: 'UND',
          stock: 0,
          averageCost: 0,
          sellPrice: 130,
          productType: 'COMPOUND',
          isPrepared: true,
          tenantId: tenantId,
        ),
        // P6: COMPOUND without published recipe (PENDING_RECIPE)
        ProductEntity(
          id: 'P6',
          name: 'Plato Nuevo Sin Receta',
          uom: 'UND',
          stock: 0,
          averageCost: 0,
          sellPrice: 150,
          productType: 'COMPOUND',
          isPrepared: true,
          tenantId: tenantId,
        ),
      ]);

      // P4 Authority Recipe + VersionDocument + Simple Recipe
      await authorityDao.insertRecipeVersion(
        const AuthorityRecipeVersionEntity(
          tenantId: tenantId,
          id: 'rv-p4-1',
          productId: 'P4',
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
      await authorityDao.insertComponent(
        const AuthorityRecipeVersionComponentEntity(
          tenantId: tenantId,
          id: 'comp-p4-coffee',
          versionId: 'rv-p4-1',
          ordinal: 0,
          insumoId: 'insumo_coffee',
          grossQuantity: 0.020,
          technicalShrinkPct: 0.0,
          ingredientType: 'DIRECT',
          componentName: 'Café Molido',
        ),
      );
      await inventoryRepo.saveRecipeVersionDocument(
        RecipeVersionDocument(
          id: 'rv-p4-1',
          productId: 'P4',
          productName: 'Latte Especial',
          versionNumber: 1,
          yieldQuantity: 1.0,
          technicalShrinkPct: 0.0,
          createdAt: DateTime.parse('2026-01-01T00:00:00Z'),
          publishedAt: DateTime.parse('2026-01-01T00:00:00Z'),
          components: const [
            RecipeVersionComponentDocument(
              ingredientId: 'insumo_coffee',
              ingredientType: 'insumo',
              ingredientName: 'Café Molido',
              grossQuantity: 0.020,
              netQuantity: 0.020,
              technicalShrinkPct: 0.0,
            ),
          ],
        ),
      );

      // Sub-recipe Authority + Simple Recipe for MovementEngineImpl depth>0
      // Yields 2.0 with 10% technical shrink, uses 1.0 L insumo_cream -> 0.45 L per sub-recipe unit
      await authorityDao.insertRecipeVersion(
        const AuthorityRecipeVersionEntity(
          tenantId: tenantId,
          id: 'rv-sub-cream-1',
          productId: 'prod-sub-cream',
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
      await authorityDao.insertComponent(
        const AuthorityRecipeVersionComponentEntity(
          tenantId: tenantId,
          id: 'comp-sub-cream',
          versionId: 'rv-sub-cream-1',
          ordinal: 0,
          insumoId: 'insumo_cream',
          grossQuantity: 1.0,
          technicalShrinkPct: 10.0,
          ingredientType: 'DIRECT',
          componentName: 'Crema Base',
        ),
      );
      await recipeDao.insertRecipes([
        RecipeEntity(
          id: 'r-sub-cream',
          productId: 'prod-sub-cream',
          ingredientId: 'insumo_cream',
          ingredientType: 'insumo',
          quantity: 0.45,
        ),
      ]);

      // P5 Authority Recipe + VersionDocument (uses 0.50 of prod-sub-cream -> 0.225 L per unit)
      await authorityDao.insertRecipeVersion(
        const AuthorityRecipeVersionEntity(
          tenantId: tenantId,
          id: 'rv-p5-1',
          productId: 'P5',
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
      await authorityDao.insertComponent(
        const AuthorityRecipeVersionComponentEntity(
          tenantId: tenantId,
          id: 'comp-p5-sub',
          versionId: 'rv-p5-1',
          ordinal: 0,
          insumoId: 'prod-sub-cream',
          grossQuantity: 0.50,
          technicalShrinkPct: 0.0,
          ingredientType: 'SUB_RECIPE',
          componentName: 'Base Batida',
        ),
      );
      await inventoryRepo.saveRecipeVersionDocument(
        RecipeVersionDocument(
          id: 'rv-p5-1',
          productId: 'P5',
          productName: 'Frappe Crema',
          versionNumber: 1,
          yieldQuantity: 1.0,
          technicalShrinkPct: 0.0,
          createdAt: DateTime.parse('2026-01-01T00:00:00Z'),
          publishedAt: DateTime.parse('2026-01-01T00:00:00Z'),
          components: const [
            RecipeVersionComponentDocument(
              ingredientId: 'prod-sub-cream',
              ingredientType: 'product',
              ingredientName: 'Base Batida',
              grossQuantity: 0.50,
              netQuantity: 0.50,
              technicalShrinkPct: 0.0,
            ),
          ],
        ),
      );

      // =======================================================================
      // CASE 1 — Mixed-Cart Offline Sale (SALE_TIME_V1) with ALL 6 Product Types
      // =======================================================================
      _log('E2E_CASE: [1/3] Mixed-Cart Offline Sale (SALE_TIME_V1) with all 6 product types');
      final saleTime = DateTime.parse('2026-10-15T14:30:00Z');
      final invoice = Invoice(
        id: 'inv-s23-coexist-1',
        number: '001-001-01-00000001',
        createdAt: saleTime,
        userId: userId,
        subtotal: 775.0,
        totalTax: 0.0,
        total: 775.0,
        terminalId: terminalId,
        sourceSequence: 1,
        idempotencyKey: 'sale:$terminalId:inv-s23-coexist-1',
      );

      final cartItems = <InvoiceItem>[
        const InvoiceItem(
          id: 'line-p1-soho',
          invoiceId: 'inv-s23-coexist-1',
          productId: 'P1',
          productName: 'Servicio / Propina SOHO',
          quantity: 2,
          unitPrice: 25,
          originalTaxRate: 0,
          appliedTaxRate: 0,
          taxAmount: 0,
          total: 50,
        ),
        const InvoiceItem(
          id: 'line-p2-resale',
          invoiceId: 'inv-s23-coexist-1',
          productId: 'P2',
          productName: 'Refresco Reventa DEC-8',
          quantity: 3,
          unitPrice: 35,
          originalTaxRate: 0,
          appliedTaxRate: 0,
          taxAmount: 0,
          total: 105,
        ),
        const InvoiceItem(
          id: 'line-p3-legacy',
          invoiceId: 'inv-s23-coexist-1',
          productId: 'P3',
          productName: 'Agua Pura Legacy',
          quantity: 1,
          unitPrice: 20,
          originalTaxRate: 0,
          appliedTaxRate: 0,
          taxAmount: 0,
          total: 20,
        ),
        const InvoiceItem(
          id: 'line-p4-latte',
          invoiceId: 'inv-s23-coexist-1',
          productId: 'P4',
          productName: 'Latte Especial',
          quantity: 2,
          unitPrice: 95,
          originalTaxRate: 0,
          appliedTaxRate: 0,
          taxAmount: 0,
          total: 190,
          selectedModifiers: [
            Modifier(
              id: 'mod-syrup',
              name: 'Extra: Sirope Vainilla',
              extraPrice: 0,
              quantity: 1,
              optionId: 'opt-syrup',
              groupId: 'grp-syrups',
              inventoryEffect: 'ADD',
              effectInsumoId: 'insumo_syrup',
              effectQuantity: 0.015,
            ),
          ],
        ),
        const InvoiceItem(
          id: 'line-p5-frappe',
          invoiceId: 'inv-s23-coexist-1',
          productId: 'P5',
          productName: 'Frappe Crema',
          quantity: 2,
          unitPrice: 130,
          originalTaxRate: 0,
          appliedTaxRate: 0,
          taxAmount: 0,
          total: 260,
        ),
        const InvoiceItem(
          id: 'line-p6-pending',
          invoiceId: 'inv-s23-coexist-1',
          productId: 'P6',
          productName: 'Plato Nuevo Sin Receta',
          quantity: 1,
          unitPrice: 150,
          originalTaxRate: 0,
          appliedTaxRate: 0,
          taxAmount: 0,
          total: 150,
        ),
      ];

      final prepared = await preparationService.prepare(
        invoice: invoice,
        items: cartItems,
        offlineUserId: userId,
        tenantId: tenantId,
        terminalId: terminalId,
      );

      final snapByLine = {
        for (final item in prepared.items) item.id: item.inventorySnapshot!,
      };
      _assertTrue(
        snapByLine['line-p1-soho']!.disposition ==
            SaleInventoryDisposition.noImpact,
        'P1 disposition == noImpact',
      );
      _assertTrue(
        snapByLine['line-p2-resale']!.disposition ==
            SaleInventoryDisposition.direct,
        'P2 disposition == direct',
      );
      _assertTrue(
        snapByLine['line-p3-legacy']!.disposition ==
            SaleInventoryDisposition.direct,
        'P3 disposition == direct',
      );
      _assertTrue(
        snapByLine['line-p4-latte']!.disposition ==
            SaleInventoryDisposition.recipe,
        'P4 disposition == recipe',
      );
      _assertTrue(
        snapByLine['line-p5-frappe']!.disposition ==
            SaleInventoryDisposition.recipe,
        'P5 disposition == recipe',
      );
      _assertTrue(
        snapByLine['line-p6-pending']!.disposition ==
            SaleInventoryDisposition.pendingRecipe,
        'P6 disposition == pendingRecipe',
      );

      // Verify full-cart boundary cleanly suppresses without throwing when pendingRecipe is present
      final fullCartCheck = boundary.derive([
        for (final item in prepared.items)
          FrozenSaleInventoryMovementLine(
            invoiceItemId: item.id,
            quantity: item.quantity,
            snapshot: item.inventorySnapshot!,
          ),
      ]);
      _assertTrue(
        fullCartCheck.outcome ==
            LocalSaleMovementOutcome.suppressedInventoryPending,
        'Full cart with P6 reports suppressedInventoryPending without blocking',
      );

      // Derive concrete movements for lines 1..5 (P1 produces 0, P2..P5 produce 5 movements)
      final derived = boundary.derive([
        for (final item in prepared.items.where(
          (i) =>
              i.inventorySnapshot!.disposition !=
              SaleInventoryDisposition.pendingRecipe,
        ))
          FrozenSaleInventoryMovementLine(
            invoiceItemId: item.id,
            quantity: item.quantity,
            snapshot: item.inventorySnapshot!,
          ),
      ]);
      _assertTrue(
        derived.outcome == LocalSaleMovementOutcome.applied,
        'Non-pending lines outcome == applied',
      );
      _assertTrue(
        derived.movements.length == 5,
        'Exactly 5 movements generated (P1=0, P6=0)',
      );

      final saleMovementEntities = derived.movements
          .map(
            (m) => MovementEntity(
              id: m.saleCorrelationId,
              insumoId: m.insumoId,
              type: 'sale',
              quantity: -m.quantity,
              previousStock: 0,
              newStock: 0,
              timestamp: saleTime.toIso8601String(),
              userId: userId,
              sourceDocumentType: 'SALE',
              sourceDocumentId: prepared.invoice.id,
              originInvoiceItemId: m.invoiceItemId,
              deliveryOwner: MovementDeliveryOwner.saleSync,
              deliveryState: MovementDeliveryState.localApplied,
              saleId: prepared.invoice.id,
              saleCorrelationId: m.saleCorrelationId,
            ),
          )
          .toList(growable: false);

      final payment = Payment(
        id: 'pay-s23-1',
        invoiceId: prepared.invoice.id,
        method: PaymentMethod.cash,
        amount: 775.0,
        currency: 'NIO',
        exchangeRate: 1.0,
        amountNio: 775.0,
        createdAt: saleTime,
      );

      await salesTxDao.executeSaleTransaction(
        SalesMapper.toInvoiceEntity(prepared.invoice),
        prepared.items.map(SalesMapper.toItemEntity).toList(growable: false),
        const [],
        [SalesMapper.toPaymentEntity(payment)],
        saleMovementEntities,
        null,
        false,
      );

      final persistedInv = await salesTxDao.getInvoiceById(prepared.invoice.id);
      _assertTrue(persistedInv != null && !persistedInv.isCanceled, 'Invoice persisted');

      final p2After = (await insumoDao.findInsumoById('ins-p2-resale'))!.stock;
      final p3After = (await insumoDao.findInsumoById('ins-p3-legacy'))!.stock;
      final coffeeAfter = (await insumoDao.findInsumoById('insumo_coffee'))!.stock;
      final syrupAfter = (await insumoDao.findInsumoById('insumo_syrup'))!.stock;
      final creamAfter = (await insumoDao.findInsumoById('insumo_cream'))!.stock;

      _assertClose(p2After, 7.0, 'P2 stock after sale');
      _assertClose(p3After, 7.0, 'P3 stock after sale');
      _assertClose(coffeeAfter, 4.96, 'insumo_coffee stock after sale');
      _assertClose(syrupAfter, 1.97, 'insumo_syrup stock after sale');
      _assertClose(creamAfter, 3.55, 'insumo_cream stock after sale');

      final persistedMovements =
          await salesTxDao.getMovementsBySaleId(prepared.invoice.id);
      _assertTrue(
        persistedMovements.length == 5 &&
            persistedMovements.every(
              (m) =>
                  m.originInvoiceItemId != 'line-p1-soho' &&
                  m.originInvoiceItemId != 'line-p6-pending',
            ),
        'P1 and P6 generated ZERO SQLite movements',
      );

      passed++;
      _log(
        'E2E_RESULT: PASS [1/3] Mixed-cart SALE_TIME_V1 persisted; stocks: P2=$p2After, P3=$p3After, coffee=$coffeeAfter, syrup=$syrupAfter, cream=$creamAfter',
      );

      // =======================================================================
      // CASE 2 — Symmetric Void / Cancellation (SALE_CANCEL) on Real SQLite
      // =======================================================================
      _log('E2E_CASE: [2/3] Symmetric Void / Cancellation (SALE_CANCEL) on Real SQLite');

      final reversalMovements = await reverseUseCase.execute(
        prepared.items,
        'SALE_CANCEL',
      );

      final voidMovementEntities = <MovementEntity>[];
      final coveredInsumos = <String>{};
      int seq = 0;
      for (final m in reversalMovements) {
        coveredInsumos.add(m.insumoId);
        voidMovementEntities.add(
          InventoryMapper.toMovementEntity(
            m.copyWith(
              id: 'void-${prepared.invoice.id}-${seq++}-${m.insumoId}',
              userId: userId,
              sourceDocumentType: 'invoice',
              sourceDocumentId: prepared.invoice.id,
            ),
          ),
        );
      }

      // Include symmetric reversal for modifier ADD movements (insumo_syrup)
      // persisted on the original sale so SQLite restores every deducted insumo.
      for (final orig in persistedMovements) {
        if (!coveredInsumos.contains(orig.insumoId)) {
          voidMovementEntities.add(
            MovementEntity(
              id: 'void-${prepared.invoice.id}-${seq++}-${orig.insumoId}',
              insumoId: orig.insumoId,
              type: 'reversal',
              quantity: -orig.quantity,
              previousStock: 0,
              newStock: 0,
              timestamp: DateTime.now().toIso8601String(),
              reason: 'SALE_CANCEL',
              userId: userId,
              sourceDocumentType: 'invoice',
              sourceDocumentId: prepared.invoice.id,
              originMovementId: orig.id,
              originInvoiceItemId: orig.originInvoiceItemId,
              saleId: prepared.invoice.id,
            ),
          );
        }
      }

      final canceledEntity = SalesMapper.toInvoiceEntity(
        prepared.invoice.copyWith(
          isCanceled: true,
          voidReason: 'SALE_CANCEL S23 E2E',
          syncStatus: SyncStatus.pending,
          sourceSequence: 2,
          idempotencyKey: 'void:$terminalId:${prepared.invoice.id}',
        ),
      );

      await salesTxDao.executeVoidTransaction(
        voidMovementEntities,
        canceledEntity,
        null,
        false,
        const [],
        null,
      );

      final voidedInv = await salesTxDao.getInvoiceById(prepared.invoice.id);
      _assertTrue(voidedInv != null && voidedInv.isCanceled, 'Invoice marked canceled');

      final p2Restored = (await insumoDao.findInsumoById('ins-p2-resale'))!.stock;
      final p3Restored = (await insumoDao.findInsumoById('ins-p3-legacy'))!.stock;
      final coffeeRestored = (await insumoDao.findInsumoById('insumo_coffee'))!.stock;
      final syrupRestored = (await insumoDao.findInsumoById('insumo_syrup'))!.stock;
      final creamRestored = (await insumoDao.findInsumoById('insumo_cream'))!.stock;

      _assertClose(p2Restored, 10.0, 'P2 stock restored');
      _assertClose(p3Restored, 8.0, 'P3 stock restored');
      _assertClose(coffeeRestored, 5.0, 'insumo_coffee stock restored');
      _assertClose(syrupRestored, 2.0, 'insumo_syrup stock restored');
      _assertClose(creamRestored, 4.0, 'insumo_cream stock restored');

      passed++;
      _log(
        'E2E_RESULT: PASS [2/3] SALE_CANCEL restored all 5 insumos: P2=$p2Restored, P3=$p3Restored, coffee=$coffeeRestored, syrup=$syrupRestored, cream=$creamRestored',
      );

      // =======================================================================
      // CASE 3 — Repeated Resale Purchase/Sale/Void Cycle & InventoryMapper Round-Trip
      // =======================================================================
      _log('E2E_CASE: [3/3] Repeated Resale Purchase/Sale/Void Cycle & InventoryMapper Policy Round-Trip');

      final p1Row = await productDao.findProductById('P1');
      final p2Row = await productDao.findProductById('P2');
      _assertTrue(p1Row != null && p2Row != null, 'P1 and P2 loaded from SQLite');

      final p1Domain = InventoryMapper.toProductDomain(p1Row!);
      final p2Domain = InventoryMapper.toProductDomain(p2Row!);
      _assertTrue(
        p1Domain.inventoryPolicy == InventoryPolicy.notTracked,
        'P1 InventoryPolicy round-trip == notTracked',
      );
      _assertTrue(
        p2Domain.inventoryPolicy == InventoryPolicy.directStock,
        'P2 InventoryPolicy round-trip == directStock',
      );

      final p2EntityRoundTrip = InventoryMapper.toProductEntity(p2Domain);
      _assertTrue(
        p2EntityRoundTrip.inventoryPolicy == 'directStock' &&
            p2EntityRoundTrip.insumoId == 'ins-p2-resale' &&
            p2EntityRoundTrip.mappingVersionId == 'mv-p2-resale',
        'P2 ProductEntity round-trip preserves directStock + insumoId + mappingVersionId',
      );

      // Purchase +5.0 on P2 backing insumo via MovementEngineImpl -> 10.0 + 5.0 = 15.0
      await movementEngine.recordPurchase(
        'ins-p2-resale',
        5.0,
        16.0,
        reason: 'S23 Resale Purchase Cycle',
      );
      _assertClose(
        (await insumoDao.findInsumoById('ins-p2-resale'))!.stock,
        15.0,
        'P2 stock after purchase',
      );

      // Second sale of P2 qty 3 -> 15.0 - 3.0 = 12.0
      final inv2Time = DateTime.parse('2026-10-15T15:00:00Z');
      final inv2 = Invoice(
        id: 'inv-s23-cycle-2',
        number: '001-001-01-00000003',
        createdAt: inv2Time,
        userId: userId,
        subtotal: 105.0,
        totalTax: 0.0,
        total: 105.0,
        terminalId: terminalId,
        sourceSequence: 3,
        idempotencyKey: 'sale:$terminalId:inv-s23-cycle-2',
      );
      final prepared2 = await preparationService.prepare(
        invoice: inv2,
        items: const [
          InvoiceItem(
            id: 'line-p2-cycle-2',
            invoiceId: 'inv-s23-cycle-2',
            productId: 'P2',
            productName: 'Refresco Reventa DEC-8',
            quantity: 3,
            unitPrice: 35,
            originalTaxRate: 0,
            appliedTaxRate: 0,
            taxAmount: 0,
            total: 105,
          ),
        ],
        offlineUserId: userId,
        tenantId: tenantId,
        terminalId: terminalId,
      );
      final derived2 = boundary.derive([
        FrozenSaleInventoryMovementLine(
          invoiceItemId: prepared2.items.single.id,
          quantity: prepared2.items.single.quantity,
          snapshot: prepared2.items.single.inventorySnapshot!,
        ),
      ]);
      await salesTxDao.executeSaleTransaction(
        SalesMapper.toInvoiceEntity(prepared2.invoice),
        prepared2.items.map(SalesMapper.toItemEntity).toList(growable: false),
        const [],
        [
          SalesMapper.toPaymentEntity(
            Payment(
              id: 'pay-s23-2',
              invoiceId: prepared2.invoice.id,
              method: PaymentMethod.cash,
              amount: 105.0,
              currency: 'NIO',
              exchangeRate: 1.0,
              amountNio: 105.0,
              createdAt: inv2Time,
            ),
          ),
        ],
        derived2.movements
            .map(
              (m) => MovementEntity(
                id: m.saleCorrelationId,
                insumoId: m.insumoId,
                type: 'sale',
                quantity: -m.quantity,
                previousStock: 0,
                newStock: 0,
                timestamp: inv2Time.toIso8601String(),
                userId: userId,
                sourceDocumentType: 'SALE',
                sourceDocumentId: prepared2.invoice.id,
                originInvoiceItemId: m.invoiceItemId,
                deliveryOwner: MovementDeliveryOwner.saleSync,
                deliveryState: MovementDeliveryState.localApplied,
                saleId: prepared2.invoice.id,
                saleCorrelationId: m.saleCorrelationId,
              ),
            )
            .toList(growable: false),
        null,
        false,
      );
      _assertClose(
        (await insumoDao.findInsumoById('ins-p2-resale'))!.stock,
        12.0,
        'P2 stock after second sale',
      );

      // Void second sale -> 12.0 + 3.0 = 15.0
      final rev2 = await reverseUseCase.execute(prepared2.items, 'SALE_CANCEL');
      await salesTxDao.executeVoidTransaction(
        rev2
            .map(
              (m) => InventoryMapper.toMovementEntity(
                m.copyWith(
                  id: 'void-${prepared2.invoice.id}-${m.insumoId}',
                  userId: userId,
                  sourceDocumentType: 'invoice',
                  sourceDocumentId: prepared2.invoice.id,
                ),
              ),
            )
            .toList(growable: false),
        SalesMapper.toInvoiceEntity(
          prepared2.invoice.copyWith(
            isCanceled: true,
            voidReason: 'SALE_CANCEL cycle 2',
            syncStatus: SyncStatus.pending,
            sourceSequence: 4,
            idempotencyKey: 'void:$terminalId:${prepared2.invoice.id}',
          ),
        ),
        null,
        false,
        const [],
        null,
      );
      final p2CycleEnd =
          (await insumoDao.findInsumoById('ins-p2-resale'))!.stock;
      _assertClose(p2CycleEnd, 15.0, 'P2 stock after void cycle 2');

      passed++;
      _log(
        'E2E_RESULT: PASS [3/3] InventoryMapper policy round-trip + Purchase(15.0)->Sale(12.0)->Void(15.0) verified',
      );

      _log('E2E_RESULT: $passed/$total ALL_TESTS_PASSED');
      if (mounted) setState(() => _status = 'ALL_TESTS_PASSED ($passed/$total)');
    } catch (e, st) {
      _log('TEST_FAILED: $e\n$st');
      if (mounted) setState(() => _status = 'TEST_FAILED: $e');
    } finally {
      await database?.close();
      if (await workDir.exists()) {
        await workDir.delete(recursive: true);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      home: Scaffold(
        appBar: AppBar(title: Text('#518/#935 S23 E2E — $_status')),
        body: ListView(
          padding: const EdgeInsets.all(16),
          children: _logs.map((l) => Text(l)).toList(),
        ),
      ),
    );
  }
}
