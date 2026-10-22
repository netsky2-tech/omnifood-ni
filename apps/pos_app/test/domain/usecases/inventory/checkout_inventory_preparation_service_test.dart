import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/inventory/authority_projection_entities.dart';
import 'package:pos_app/data/models/inventory/insumo_entity.dart';
import 'package:pos_app/data/models/local_config_entity.dart';
import 'package:pos_app/domain/models/sales/invoice.dart';
import 'package:pos_app/domain/models/inventory/product.dart';
import 'package:pos_app/domain/models/sales/invoice_item.dart';
import 'package:pos_app/domain/usecases/inventory/checkout_inventory_preparation_service.dart';
import 'package:pos_app/domain/usecases/inventory/validated_sale_inventory_authority.dart';

void main() {
  late AppDatabase database;
  late CheckoutInventoryPreparationService service;

  Invoice buildInvoice() => Invoice(
        id: 'inv-1',
        number: 'PENDING',
        createdAt: DateTime.parse('2026-09-01T12:00:00Z'),
        userId: 'user-1',
        subtotal: 150.0,
        totalTax: 22.5,
        total: 172.5,
        terminalId: 'term-1',
      );

  List<InvoiceItem> buildItems() => const [
        InvoiceItem(
          id: 'item-1',
          invoiceId: 'inv-1',
          productId: 'prod-burger',
          productName: 'Classic Burger',
          quantity: 2.0,
          unitPrice: 150.0,
          originalTaxRate: 0.15,
          appliedTaxRate: 0.15,
          taxAmount: 22.5,
          total: 172.5,
        ),
      ];

  Future<void> seedTenantAuthority(AppDatabase db) async {
    final dao = db.authorityProjectionDao;

    await dao.insertInsumo(
      const AuthorityInsumoEntity(
        tenantId: 'tenant-1',
        id: 'insumo-beef',
        name: 'Ground Beef',
        uom: 'KG',
      ),
    );

    await dao.insertRecipeVersion(
      const AuthorityRecipeVersionEntity(
        tenantId: 'tenant-1',
        id: 'ver-burger-1',
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
        tenantId: 'tenant-1',
        id: 'comp-1',
        versionId: 'ver-burger-1',
        ordinal: 0,
        insumoId: 'insumo-beef',
        grossQuantity: 0.25,
        technicalShrinkPct: 0.0,
        ingredientType: 'DIRECT',
        componentName: 'Patty',
      ),
    );

    await db.database.execute('''
      INSERT INTO products (id, name, uom, stock, average_cost, sell_price, is_active, is_prepared, product_type, tenant_id, tax_rate, is_tax_exempt)
      VALUES ('prod-burger', 'Classic Burger', 'UNIT', 10.0, 50.0, 150.0, 1, 1, 'PREPARED', 'tenant-1', 0.15, 0)
    ''');
  }

  setUp(() async {
    database = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();
    service = CheckoutInventoryPreparationService(database);
  });

  tearDown(() async {
    await database.close();
  });

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  test(
    'CheckoutInventoryPreparationService wires authority, planner, and builder into SALE_TIME_V1',
    () async {
      final dao = database.authorityProjectionDao;

      // Seed authority facts
      await dao.insertInsumo(
        const AuthorityInsumoEntity(
          tenantId: 'tenant-1',
          id: 'insumo-beef',
          name: 'Ground Beef',
          uom: 'KG',
        ),
      );

      await dao.insertRecipeVersion(
        const AuthorityRecipeVersionEntity(
          tenantId: 'tenant-1',
          id: 'ver-burger-1',
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
          tenantId: 'tenant-1',
          id: 'comp-1',
          versionId: 'ver-burger-1',
          ordinal: 0,
          insumoId: 'insumo-beef',
          grossQuantity: 0.25,
          technicalShrinkPct: 0.0,
          ingredientType: 'DIRECT',
          componentName: 'Patty',
        ),
      );

      // Seed product in SQLite products table directly
      await database.database.execute('''
      INSERT INTO products (id, name, uom, stock, average_cost, sell_price, is_active, is_prepared, product_type, tenant_id, tax_rate, is_tax_exempt)
      VALUES ('prod-burger', 'Classic Burger', 'UNIT', 10.0, 50.0, 150.0, 1, 1, 'PREPARED', 'tenant-1', 0.15, 0)
    ''');

      final invoice = Invoice(
        id: 'inv-1',
        number: 'PENDING',
        createdAt: DateTime.parse('2026-09-01T12:00:00Z'),
        userId: 'user-1',
        subtotal: 150.0,
        totalTax: 22.5,
        total: 172.5,
        terminalId: 'term-1',
      );

      final items = <InvoiceItem>[
        const InvoiceItem(
          id: 'item-1',
          invoiceId: 'inv-1',
          productId: 'prod-burger',
          productName: 'Classic Burger',
          quantity: 2.0,
          unitPrice: 150.0,
          originalTaxRate: 0.15,
          appliedTaxRate: 0.15,
          taxAmount: 22.5,
          total: 172.5,
        ),
      ];

      final result = await service.prepare(
        invoice: invoice,
        items: items,
        offlineUserId: 'user-1',
        tenantId: 'tenant-1',
        terminalId: 'term-1',
      );

      expect(result.invoice.inventoryPolicyVersion, 'SALE_TIME_V1');
      expect(result.invoice.inventoryOutcome, 'APPLIED');
      expect(result.items.length, 1);
      expect(result.items.first.inventorySnapshotVersion, 'SALE_TIME_V1');
      expect(result.items.first.inventorySnapshot, isNotNull);
      expect(result.items.first.inventorySnapshot!.disposition.name, 'recipe');
      expect(result.items.first.inventorySnapshot!.bindings.length, 1);
      expect(
        result.items.first.inventorySnapshot!.bindings.first.insumoId,
        'insumo-beef',
      );

      // Legacy users without tenant authority remain on the pre-Q80 path and
      // must not falsely claim a SALE_TIME_V1 snapshot.
      final legacyResult = await service.prepare(
        invoice: invoice,
        items: items,
        offlineUserId: 'user-1',
        tenantId: '',
        terminalId: 'term-1',
      );
      expect(legacyResult.invoice.inventoryPolicyVersion, isNull);
      expect(legacyResult.items, items);

      // Provenance still fails closed when actor or terminal identity is absent.
      await expectLater(
        service.prepare(
          invoice: invoice,
          items: items,
          offlineUserId: '',
          tenantId: 'tenant-1',
          terminalId: 'term-1',
        ),
        throwsA(isA<CheckoutAuthorityException>()),
      );
    },
  );

  test(
    'blank tenantId resolves the effective tenant from the terminal binding',
    () async {
      await seedTenantAuthority(database);

      // The terminal is bound to a tenant even though the user row has a NULL
      // tenant_id. The binding is authoritative for the terminal's own
      // inventory operations.
      await database.localConfigDao.saveConfig(
        LocalConfigEntity(key: 'tenant_id', value: 'tenant-1'),
      );

      final result = await service.prepare(
        invoice: buildInvoice(),
        items: buildItems(),
        offlineUserId: 'user-1',
        tenantId: '',
        terminalId: 'term-1',
      );

      expect(result.invoice.inventoryPolicyVersion, 'SALE_TIME_V1');
      expect(result.invoice.inventoryOutcome, 'APPLIED');
      expect(result.items.first.inventorySnapshotVersion, 'SALE_TIME_V1');
      expect(result.items.first.inventorySnapshot, isNotNull);
      expect(
        result.items.first.inventorySnapshot!.bindings.first.insumoId,
        'insumo-beef',
      );
    },
  );

  test(
    'blank tenantId with no terminal binding keeps the legacy passthrough',
    () async {
      // No local_configs['tenant_id'] row: genuinely unbound terminal.
      final invoice = buildInvoice();
      final items = buildItems();

      final result = await service.prepare(
        invoice: invoice,
        items: items,
        offlineUserId: 'user-1',
        tenantId: '',
        terminalId: 'term-1',
      );

      expect(result.invoice.inventoryPolicyVersion, isNull);
      expect(result.invoice.inventoryOutcome, isNull);
      expect(result.invoice.inventoryOutcomeReason, isNull);
      expect(result.items, same(items));
    },
  );

  test(
    'non-empty tenantId wins and the terminal binding is not consulted',
    () async {
      await seedTenantAuthority(database);

      // Binding points at a DIFFERENT tenant with no authority data; if the
      // service consulted it, the line would lose its recipe binding.
      await database.localConfigDao.saveConfig(
        LocalConfigEntity(key: 'tenant_id', value: 'tenant-other'),
      );

      final result = await service.prepare(
        invoice: buildInvoice(),
        items: buildItems(),
        offlineUserId: 'user-1',
        tenantId: 'tenant-1',
        terminalId: 'term-1',
      );

      expect(result.invoice.inventoryPolicyVersion, 'SALE_TIME_V1');
      expect(result.invoice.inventoryOutcome, 'APPLIED');
      expect(result.items.first.inventorySnapshotVersion, 'SALE_TIME_V1');
      expect(
        result.items.first.inventorySnapshot!.bindings.first.insumoId,
        'insumo-beef',
      );

      final bindingAfter = await database.localConfigDao.getConfigByKey(
        'tenant_id',
      );
      expect(bindingAfter!.value, 'tenant-other');
    },
  );

  /// Inserts a product carrying a DIRECT insumo mapping
  /// (mappingVersionId + insumoId) into the local products table.
  Future<void> insertDirectMappedProduct({
    required String id,
    required String productType,
    required String mappingVersionId,
    required String insumoId,
  }) async {
    final isPrepared = productType == 'SIMPLE' ? 0 : 1;
    await database.database.execute('''
      INSERT INTO products (id, name, uom, stock, average_cost, sell_price, is_active, is_prepared, product_type, mapping_version_id, insumo_id, tenant_id, tax_rate, is_tax_exempt)
      VALUES ('$id', 'Producto Directo', 'UNIT', 10.0, 50.0, 150.0, 1, $isPrepared, '$productType', '$mappingVersionId', '$insumoId', 'tenant-1', 0.15, 0)
    ''');
  }

  InvoiceItem buildDirectItem({
    String id = 'item-direct',
    required String productId,
    double quantity = 1.0,
  }) =>
      InvoiceItem(
        id: id,
        invoiceId: 'inv-1',
        productId: productId,
        productName: 'Producto Directo',
        quantity: quantity,
        unitPrice: 150.0,
        originalTaxRate: 0.15,
        appliedTaxRate: 0.15,
        taxAmount: 22.5,
        total: 172.5,
      );

  test(
    'a COMPOUND product with a direct mapping and hydrated insumo but NO published recipe no longer throws CheckoutAuthorityException',
    () async {
      // The authority projection carries the insumo (e.g. hydrated by the
      // sync pull from the top-level insumos delta), but no recipe version
      // exists for the product: the mapping is DIRECT.
      await database.authorityProjectionDao.insertInsumo(
        const AuthorityInsumoEntity(
          tenantId: 'tenant-1',
          id: 'insumo-direct',
          name: 'Base Directa',
          uom: 'G',
        ),
      );
      await insertDirectMappedProduct(
        id: 'prod-comp-direct',
        productType: 'COMPOUND',
        mappingVersionId: 'mv-comp-1',
        insumoId: 'insumo-direct',
      );

      final result = await service.prepare(
        invoice: buildInvoice(),
        items: [buildDirectItem(productId: 'prod-comp-direct')],
        offlineUserId: 'user-1',
        tenantId: 'tenant-1',
        terminalId: 'term-1',
      );

      // The sale is no longer aborted: a valid SALE_TIME_V1 snapshot is
      // produced. A COMPOUND product without a published recipe stays on
      // the planner's pendingRecipe disposition (empty bindings; inventory
      // pending until a recipe is published) — the mapping's insumo merely
      // has to RESOLVE for the authority guard to pass.
      expect(result.invoice.inventoryPolicyVersion, 'SALE_TIME_V1');
      expect(result.invoice.inventoryOutcome, 'APPLIED_INVENTORY_PENDING');
      expect(result.invoice.inventoryOutcomeReason, 'MISSING_PUBLISHED_RECIPE');
      expect(result.items.first.inventorySnapshotVersion, 'SALE_TIME_V1');
      expect(result.items.first.inventorySnapshot, isNotNull);
      expect(
        result.items.first.inventorySnapshot!.disposition.name,
        'pendingRecipe',
      );
    },
  );

  test(
    'a SIMPLE product with a direct mapping produces a DIRECT snapshot with non-empty bindings',
    () async {
      await database.authorityProjectionDao.insertInsumo(
        const AuthorityInsumoEntity(
          tenantId: 'tenant-1',
          id: 'insumo-direct',
          name: 'Base Directa',
          uom: 'G',
        ),
      );
      await insertDirectMappedProduct(
        id: 'prod-simple-direct',
        productType: 'SIMPLE',
        mappingVersionId: 'mv-simple-1',
        insumoId: 'insumo-direct',
      );

      final result = await service.prepare(
        invoice: buildInvoice(),
        items: [buildDirectItem(productId: 'prod-simple-direct')],
        offlineUserId: 'user-1',
        tenantId: 'tenant-1',
        terminalId: 'term-1',
      );

      // Inventory actually applies through the direct mapping.
      expect(result.invoice.inventoryPolicyVersion, 'SALE_TIME_V1');
      expect(result.invoice.inventoryOutcome, 'APPLIED');
      expect(result.items.first.inventorySnapshot, isNotNull);
      expect(result.items.first.inventorySnapshot!.disposition.name, 'direct');
      expect(result.items.first.inventorySnapshot!.bindings, hasLength(1));
      expect(
        result.items.first.inventorySnapshot!.bindings.first.insumoId,
        'insumo-direct',
      );
    },
  );

  test(
    'two direct mappings referencing the SAME insumo do not produce duplicate authority facts',
    () async {
      await database.authorityProjectionDao.insertInsumo(
        const AuthorityInsumoEntity(
          tenantId: 'tenant-1',
          id: 'insumo-shared',
          name: 'Insumo Compartido',
          uom: 'KG',
        ),
      );
      await insertDirectMappedProduct(
        id: 'prod-a',
        productType: 'SIMPLE',
        mappingVersionId: 'mv-a',
        insumoId: 'insumo-shared',
      );
      await insertDirectMappedProduct(
        id: 'prod-b',
        productType: 'SIMPLE',
        mappingVersionId: 'mv-b',
        insumoId: 'insumo-shared',
      );

      // The validator rejects duplicate facts; two lines sharing an insumo
      // must not turn the de-duplication gap into a thrown exception.
      final result = await service.prepare(
        invoice: buildInvoice(),
        items: [
          buildDirectItem(id: 'item-a', productId: 'prod-a'),
          buildDirectItem(id: 'item-b', productId: 'prod-b'),
        ],
        offlineUserId: 'user-1',
        tenantId: 'tenant-1',
        terminalId: 'term-1',
      );

      expect(result.invoice.inventoryPolicyVersion, 'SALE_TIME_V1');
      expect(result.invoice.inventoryOutcome, 'APPLIED');
      expect(result.items, hasLength(2));
      for (final item in result.items) {
        expect(item.inventorySnapshot, isNotNull);
        expect(item.inventorySnapshot!.disposition.name, 'direct');
        expect(item.inventorySnapshot!.bindings.first.insumoId,
            'insumo-shared');
      }
    },
  );

  /// Inserts a product without a direct mapping into the local products
  /// table (inventory resolution, if any, comes from a published recipe).
  Future<void> insertUnmappedProduct({
    required String id,
    required String productType,
  }) async {
    final isPrepared = productType == 'SIMPLE' ? 0 : 1;
    await database.database.execute('''
      INSERT INTO products (id, name, uom, stock, average_cost, sell_price, is_active, is_prepared, product_type, tenant_id, tax_rate, is_tax_exempt)
      VALUES ('$id', 'Producto Receta', 'UNIT', 10.0, 50.0, 150.0, 1, $isPrepared, '$productType', 'tenant-1', 0.15, 0)
    ''');
  }

  /// Seeds a published recipe version with one component for [productId].
  /// Does NOT insert the insumo: callers insert insumos explicitly so two
  /// recipes can share one.
  Future<void> seedPublishedRecipe({
    required String productId,
    required String versionId,
    required String componentId,
    required String insumoId,
  }) async {
    final dao = database.authorityProjectionDao;
    await dao.insertRecipeVersion(
      AuthorityRecipeVersionEntity(
        tenantId: 'tenant-1',
        id: versionId,
        productId: productId,
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
      AuthorityRecipeVersionComponentEntity(
        tenantId: 'tenant-1',
        id: componentId,
        versionId: versionId,
        ordinal: 0,
        insumoId: insumoId,
        grossQuantity: 0.25,
        technicalShrinkPct: 0.0,
        ingredientType: 'DIRECT',
        componentName: 'Porcion',
      ),
    );
  }

  test(
    'the same product in two cart lines without a recipe does not abort checkout',
    () async {
      // SaleViewModel.addToCart only merges lines when productId, variantId
      // AND modifiers all match: the same product with different modifiers
      // becomes TWO lines. The service must collapse the repeated product
      // fact instead of letting the validator reject the duplicate id.
      await insertUnmappedProduct(id: 'prod-soda', productType: 'SIMPLE');

      final result = await service.prepare(
        invoice: buildInvoice(),
        items: [
          buildDirectItem(id: 'item-a', productId: 'prod-soda'),
          buildDirectItem(id: 'item-b', productId: 'prod-soda'),
        ],
        offlineUserId: 'user-1',
        tenantId: 'tenant-1',
        terminalId: 'term-1',
      );

      expect(result.invoice.inventoryPolicyVersion, 'SALE_TIME_V1');
      expect(result.invoice.inventoryOutcome, 'APPLIED_NO_INVENTORY_IMPACT');
      expect(result.invoice.inventoryOutcomeReason,
          'NO_EXPLICIT_INSUMO_MAPPING');
      expect(result.items, hasLength(2));
      for (final item in result.items) {
        expect(item.inventorySnapshot, isNotNull);
        expect(item.inventorySnapshot!.disposition.name, 'noImpact');
        expect(item.inventorySnapshot!.bindings, isEmpty);
      }
    },
  );

  test(
    'the same product in two cart lines with a published recipe binds the recipe exactly once per line',
    () async {
      await seedTenantAuthority(database);

      final result = await service.prepare(
        invoice: buildInvoice(),
        items: [
          buildDirectItem(id: 'item-a', productId: 'prod-burger'),
          buildDirectItem(id: 'item-b', productId: 'prod-burger'),
        ],
        offlineUserId: 'user-1',
        tenantId: 'tenant-1',
        terminalId: 'term-1',
      );

      expect(result.invoice.inventoryPolicyVersion, 'SALE_TIME_V1');
      expect(result.invoice.inventoryOutcome, 'APPLIED');
      expect(result.items, hasLength(2));
      for (final item in result.items) {
        expect(item.inventorySnapshot, isNotNull);
        expect(item.inventorySnapshot!.disposition.name, 'recipe');
        expect(item.inventorySnapshot!.recipeVersionId, 'ver-burger-1');
        // The recipe (and its component/insumo facts) is bound exactly once
        // per line, not once per accumulated duplicate fact.
        expect(item.inventorySnapshot!.bindings, hasLength(1));
        expect(
          item.inventorySnapshot!.bindings.first.insumoId,
          'insumo-beef',
        );
        expect(
          item.inventorySnapshot!.bindings.first.recipeComponentId,
          'comp-1',
        );
      }
    },
  );

  test(
    'two different products whose recipes share one insumo collapse the shared insumo into one authority fact',
    () async {
      await database.authorityProjectionDao.insertInsumo(
        const AuthorityInsumoEntity(
          tenantId: 'tenant-1',
          id: 'insumo-milk',
          name: 'Leche',
          uom: 'L',
        ),
      );
      await insertUnmappedProduct(id: 'prod-tea', productType: 'PREPARED');
      await insertUnmappedProduct(id: 'prod-coffee', productType: 'PREPARED');
      await seedPublishedRecipe(
        productId: 'prod-tea',
        versionId: 'ver-tea-1',
        componentId: 'comp-tea-1',
        insumoId: 'insumo-milk',
      );
      await seedPublishedRecipe(
        productId: 'prod-coffee',
        versionId: 'ver-coffee-1',
        componentId: 'comp-coffee-1',
        insumoId: 'insumo-milk',
      );

      final result = await service.prepare(
        invoice: buildInvoice(),
        items: [
          buildDirectItem(id: 'item-a', productId: 'prod-tea'),
          buildDirectItem(id: 'item-b', productId: 'prod-coffee'),
        ],
        offlineUserId: 'user-1',
        tenantId: 'tenant-1',
        terminalId: 'term-1',
      );

      expect(result.invoice.inventoryPolicyVersion, 'SALE_TIME_V1');
      expect(result.invoice.inventoryOutcome, 'APPLIED');
      expect(result.items, hasLength(2));
      expect(result.items.first.inventorySnapshot!.disposition.name, 'recipe');
      expect(
        result.items.first.inventorySnapshot!.recipeVersionId,
        'ver-tea-1',
      );
      expect(result.items.last.inventorySnapshot!.disposition.name, 'recipe');
      expect(
        result.items.last.inventorySnapshot!.recipeVersionId,
        'ver-coffee-1',
      );
      // Each line binds the shared insumo exactly once through its own
      // recipe component.
      for (final item in result.items) {
        expect(item.inventorySnapshot!.bindings, hasLength(1));
        expect(item.inventorySnapshot!.bindings.first.insumoId,
            'insumo-milk');
      }
    },
  );

  test(
    'a single-line COMPOUND sale with a published recipe still produces a recipe disposition',
    () async {
      await database.authorityProjectionDao.insertInsumo(
        const AuthorityInsumoEntity(
          tenantId: 'tenant-1',
          id: 'insumo-dough',
          name: 'Masa',
          uom: 'KG',
        ),
      );
      await insertUnmappedProduct(id: 'prod-pizza', productType: 'COMPOUND');
      await seedPublishedRecipe(
        productId: 'prod-pizza',
        versionId: 'ver-pizza-1',
        componentId: 'comp-pizza-1',
        insumoId: 'insumo-dough',
      );

      final result = await service.prepare(
        invoice: buildInvoice(),
        items: [buildDirectItem(productId: 'prod-pizza')],
        offlineUserId: 'user-1',
        tenantId: 'tenant-1',
        terminalId: 'term-1',
      );

      expect(result.invoice.inventoryPolicyVersion, 'SALE_TIME_V1');
      expect(result.invoice.inventoryOutcome, 'APPLIED');
      expect(result.items.single.inventorySnapshot, isNotNull);
      expect(
        result.items.single.inventorySnapshot!.disposition.name,
        'recipe',
      );
      expect(
        result.items.single.inventorySnapshot!.recipeVersionId,
        'ver-pizza-1',
      );
      expect(result.items.single.inventorySnapshot!.bindings, hasLength(1));
      expect(
        result.items.single.inventorySnapshot!.bindings.first.insumoId,
        'insumo-dough',
      );
      expect(
        result.items.single.inventorySnapshot!.bindings.first
            .recipeComponentId,
        'comp-pizza-1',
      );
    },
  );

  test(
    'a product whose identity is not a safe authority fact still fails closed',
    () async {
      // A malformed/foreign fact (unsafe id such as 'unknown') must keep
      // aborting the checkout even after de-duplication.
      await insertUnmappedProduct(id: 'unknown', productType: 'SIMPLE');

      await expectLater(
        service.prepare(
          invoice: buildInvoice(),
          items: [buildDirectItem(productId: 'unknown')],
          offlineUserId: 'user-1',
          tenantId: 'tenant-1',
          terminalId: 'term-1',
        ),
        throwsA(isA<CheckoutAuthorityException>()),
      );
    },
  );

  test(
    'a direct mapping whose insumo is NOT in authority_insumos still fails closed',
    () async {
      // No authority insumo is hydrated for 'insumo-missing': the snapshot
      // cannot be built soundly, so the guard MUST keep rejecting it.
      await insertDirectMappedProduct(
        id: 'prod-dangling',
        productType: 'SIMPLE',
        mappingVersionId: 'mv-dangling',
        insumoId: 'insumo-missing',
      );

      await expectLater(
        service.prepare(
          invoice: buildInvoice(),
          items: [buildDirectItem(productId: 'prod-dangling')],
          offlineUserId: 'user-1',
          tenantId: 'tenant-1',
          terminalId: 'term-1',
        ),
        throwsA(isA<CheckoutAuthorityException>()),
      );
    },
  );

  // R21 / S18 — Camino B: the POS mirror of the backend's recursive BOM
  // explosion (R11). The tacos recipe consumes a SUB_RECIPE plus two direct
  // insumos; the sale must freeze bindings on the LEAF insumos.
  Future<void> seedSubRecipeProjection({
    bool seedSubRecipeVersion = true,
  }) async {
    final dao = database.authorityProjectionDao;
    for (final insumo in [
      const AuthorityInsumoEntity(
        tenantId: 'tenant-1',
        id: 'insumo-carne',
        name: 'Carne Molida',
        uom: 'g',
      ),
      const AuthorityInsumoEntity(
        tenantId: 'tenant-1',
        id: 'insumo-tortillas',
        name: 'Tortillas',
        uom: 'UND',
      ),
      const AuthorityInsumoEntity(
        tenantId: 'tenant-1',
        id: 'insumo-queso',
        name: 'Queso',
        uom: 'g',
      ),
    ]) {
      await dao.insertInsumo(insumo);
    }

    await insertUnmappedProduct(id: 'prod-tacos', productType: 'COMPOUND');
    await insertUnmappedProduct(id: 'prod-relleno', productType: 'COMPOUND');

    await dao.insertRecipeVersion(
      const AuthorityRecipeVersionEntity(
        tenantId: 'tenant-1',
        id: 'ver-tacos-1',
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
    await dao.insertComponents([
      const AuthorityRecipeVersionComponentEntity(
        tenantId: 'tenant-1',
        id: 'comp-tacos-relleno',
        versionId: 'ver-tacos-1',
        ordinal: 0,
        insumoId: 'prod-relleno',
        grossQuantity: 1.0,
        technicalShrinkPct: 0.0,
        ingredientType: 'SUB_RECIPE',
        componentName: 'Relleno de Carne Criolla',
        referenceVersionId: 'ver-relleno-1',
      ),
      const AuthorityRecipeVersionComponentEntity(
        tenantId: 'tenant-1',
        id: 'comp-tacos-tortillas',
        versionId: 'ver-tacos-1',
        ordinal: 1,
        insumoId: 'insumo-tortillas',
        grossQuantity: 3.0,
        technicalShrinkPct: 0.0,
        ingredientType: 'INSUMO',
        componentName: 'Tortillas',
        componentUom: 'UND',
      ),
      const AuthorityRecipeVersionComponentEntity(
        tenantId: 'tenant-1',
        id: 'comp-tacos-queso',
        versionId: 'ver-tacos-1',
        ordinal: 2,
        insumoId: 'insumo-queso',
        grossQuantity: 40.0,
        technicalShrinkPct: 0.0,
        ingredientType: 'INSUMO',
        componentName: 'Queso',
        componentUom: 'g',
      ),
    ]);

    if (seedSubRecipeVersion) {
      await dao.insertRecipeVersion(
        const AuthorityRecipeVersionEntity(
          tenantId: 'tenant-1',
          id: 'ver-relleno-1',
          productId: 'prod-relleno',
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
          tenantId: 'tenant-1',
          id: 'comp-relleno-carne',
          versionId: 'ver-relleno-1',
          ordinal: 0,
          insumoId: 'insumo-carne',
          grossQuantity: 0.15,
          technicalShrinkPct: 0.0,
          ingredientType: 'INSUMO',
          componentName: 'Carne Molida',
          componentUom: 'g',
        ),
      );
    }
  }

  test(
    'Camino B: a SUB_RECIPE component expands into leaf insumo bindings',
    () async {
      await seedSubRecipeProjection();

      final result = await service.prepare(
        invoice: buildInvoice(),
        items: [buildDirectItem(id: 'item-tacos', productId: 'prod-tacos')],
        offlineUserId: 'user-1',
        tenantId: 'tenant-1',
        terminalId: 'term-1',
      );

      final snapshot = result.items.single.inventorySnapshot!;
      expect(result.invoice.inventoryPolicyVersion, 'SALE_TIME_V1');
      expect(result.invoice.inventoryOutcome, 'APPLIED');
      expect(result.invoice.inventoryOutcomeReason, isNull);
      expect(result.items.single.inventorySnapshotVersion, 'SALE_TIME_V1');
      expect(snapshot.disposition.name, 'recipe');
      expect(snapshot.recipeVersionId, 'ver-tacos-1');

      // Bindings are the LEAVES (sorted by insumo id), not the root
      // components: the sub-recipe product never becomes a binding.
      expect(snapshot.bindings, hasLength(3));
      expect(snapshot.bindings.map((b) => b.insumoId).toList(), [
        'insumo-carne',
        'insumo-queso',
        'insumo-tortillas',
      ]);
      expect(snapshot.bindings.map((b) => b.bindingOrdinal).toList(), [0, 1, 2]);
      expect(snapshot.bindings.map((b) => b.quantityPerSaleUnit).toList(), [
        0.15,
        40.0,
        3.0,
      ]);

      // Direct leaves keep their root component id; a nested leaf cannot
      // (the backend validates that id against the ROOT recipe's details).
      final bindingsByInsumo = {
        for (final binding in snapshot.bindings) binding.insumoId: binding,
      };
      expect(
        bindingsByInsumo['insumo-carne']!.recipeComponentId,
        isNull,
      );
      expect(
        bindingsByInsumo['insumo-queso']!.recipeComponentId,
        'comp-tacos-queso',
      );
      expect(
        bindingsByInsumo['insumo-tortillas']!.recipeComponentId,
        'comp-tacos-tortillas',
      );

      // Every correlation id stays unique, which is what the backend's
      // SALE_TIME_V1 validator enforces.
      final correlationIds = snapshot.bindings
          .map((binding) => binding.saleCorrelationId)
          .toSet();
      expect(correlationIds, hasLength(3));
    },
  );

  test(
    'Camino B: a sub-recipe without an active published version fails closed',
    () async {
      await seedSubRecipeProjection(seedSubRecipeVersion: false);

      await expectLater(
        service.prepare(
          invoice: buildInvoice(),
          items: [buildDirectItem(id: 'item-tacos', productId: 'prod-tacos')],
          offlineUserId: 'user-1',
          tenantId: 'tenant-1',
          terminalId: 'term-1',
        ),
        throwsA(isA<CheckoutAuthorityException>()),
      );
    },
  );

  test(
    'R23: checkout fails closed when negative_stock_policy is RESTRICT and stock is insufficient',
    () async {
      final dao = database.authorityProjectionDao;
      await dao.insertInsumo(
        const AuthorityInsumoEntity(
          tenantId: 'tenant-1',
          id: 'insumo-salmon',
          name: 'Salmón Fresco',
          uom: 'KG',
          negativeStockPolicy: 'RESTRICT',
        ),
      );
      // Insumo in SQLite with 0 stock
      await database.insumoDao.insertInsumos([
        InsumoEntity(
          id: 'insumo-salmon',
          name: 'Salmón Fresco',
          consumptionUom: 'KG',
          stock: 0.0,
          averageCost: 350.0,
          negativeStockPolicy: 'RESTRICT',
        ),
      ]);
      await insertDirectMappedProduct(
        id: 'prod-salmon-platter',
        productType: 'SIMPLE',
        mappingVersionId: 'mv-salmon-1',
        insumoId: 'insumo-salmon',
      );

      try {
        await service.prepare(
          invoice: buildInvoice(),
          items: [buildDirectItem(productId: 'prod-salmon-platter', quantity: 1.0)],
          offlineUserId: 'user-1',
          tenantId: 'tenant-1',
          terminalId: 'term-1',
        );
        fail('Should have thrown CheckoutAuthorityException');
      } on CheckoutAuthorityException catch (e) {
        expect(e.reason, CheckoutAuthorityFailureReason.negativeStockBlocked);
        expect(e.insumoName, 'Salmón Fresco');
        expect(e.availableQuantity, 0.0);
        expect(e.requiredQuantity, 1.0);
      }
    },
  );

  test(
    'FD-02: a lot-managed insumo is available by its LOTS, not by the aggregate',
    () async {
      // The rig's case: 150 ml in the aggregate, 50 ml in the lots. The
      // cloud draws the outflow from the LOTS, so the terminal must decide
      // with the same number — otherwise it sells what the cloud cannot
      // record (and the cloud used to reject it, freezing the fiscal
      // sequence).
      await database.authorityProjectionDao.insertInsumo(
        const AuthorityInsumoEntity(
          tenantId: 'tenant-1',
          id: 'insumo-leche',
          name: 'Leche',
          uom: 'ML',
        ),
      );
      await database.insumoDao.insertInsumos([
        InsumoEntity(
          id: 'insumo-leche',
          name: 'Leche',
          consumptionUom: 'ML',
          stock: 150.0,
          averageCost: 12.0,
          isBatchManaged: true,
          lotAvailableStock: 50.0,
        ),
      ]);
      await insertDirectMappedProduct(
        id: 'prod-leche',
        productType: 'SIMPLE',
        mappingVersionId: 'mv-leche-1',
        insumoId: 'insumo-leche',
      );

      // 100 ml: the lots (50) do not cover it ⇒ the sale is refused, exactly
      // as the cloud would refuse it.
      await expectLater(
        service.prepare(
          invoice: buildInvoice(),
          items: [buildDirectItem(productId: 'prod-leche', quantity: 100.0)],
          offlineUserId: 'user-1',
          tenantId: 'tenant-1',
          terminalId: 'term-1',
        ),
        throwsA(
          isA<CheckoutAuthorityException>().having(
            (e) => e.reason,
            'reason',
            CheckoutAuthorityFailureReason.negativeStockBlocked,
          ),
        ),
      );
    },
  );

  test(
    'FD-02: an insumo WITHOUT lots keeps the aggregate as its only truth',
    () async {
      await database.authorityProjectionDao.insertInsumo(
        const AuthorityInsumoEntity(
          tenantId: 'tenant-1',
          id: 'insumo-azucar',
          name: 'Azúcar',
          uom: 'KG',
        ),
      );
      await database.insumoDao.insertInsumos([
        InsumoEntity(
          id: 'insumo-azucar',
          name: 'Azúcar',
          consumptionUom: 'KG',
          stock: 150.0,
          averageCost: 12.0,
          // No lots: the aggregate decides, exactly as before.
        ),
      ]);
      await insertDirectMappedProduct(
        id: 'prod-azucar',
        productType: 'SIMPLE',
        mappingVersionId: 'mv-azucar-1',
        insumoId: 'insumo-azucar',
      );

      final result = await service.prepare(
        invoice: buildInvoice(),
        items: [buildDirectItem(productId: 'prod-azucar', quantity: 100.0)],
        offlineUserId: 'user-1',
        tenantId: 'tenant-1',
        terminalId: 'term-1',
      );
      expect(result.invoice.inventoryOutcome, 'APPLIED');
    },
  );

  test(
    'R23: checkout succeeds when negative_stock_policy is ALLOW_TEMPORARY even with zero stock',
    () async {
      final dao = database.authorityProjectionDao;
      await dao.insertInsumo(
        const AuthorityInsumoEntity(
          tenantId: 'tenant-1',
          id: 'insumo-cafe',
          name: 'Café Grano',
          uom: 'KG',
          negativeStockPolicy: 'ALLOW_TEMPORARY',
        ),
      );
      // Insumo in SQLite with 0 stock but ALLOW_TEMPORARY
      await database.insumoDao.insertInsumos([
        InsumoEntity(
          id: 'insumo-cafe',
          name: 'Café Grano',
          consumptionUom: 'KG',
          stock: 0.0,
          averageCost: 180.0,
          negativeStockPolicy: 'ALLOW_TEMPORARY',
        ),
      ]);
      await insertDirectMappedProduct(
        id: 'prod-cafe-espresso',
        productType: 'SIMPLE',
        mappingVersionId: 'mv-cafe-1',
        insumoId: 'insumo-cafe',
      );

      final result = await service.prepare(
        invoice: buildInvoice(),
        items: [buildDirectItem(productId: 'prod-cafe-espresso', quantity: 1.0)],
        offlineUserId: 'user-1',
        tenantId: 'tenant-1',
        terminalId: 'term-1',
      );
      expect(result.invoice.inventoryOutcome, 'APPLIED');
    },
  );

  test(
    'R23: checkout succeeds when negative_stock_policy is RESTRICT and stock is sufficient',
    () async {
      final dao = database.authorityProjectionDao;
      await dao.insertInsumo(
        const AuthorityInsumoEntity(
          tenantId: 'tenant-1',
          id: 'insumo-arroz',
          name: 'Arroz 80/20',
          uom: 'KG',
          negativeStockPolicy: 'RESTRICT',
        ),
      );
      // Insumo in SQLite with plenty of stock
      await database.insumoDao.insertInsumos([
        InsumoEntity(
          id: 'insumo-arroz',
          name: 'Arroz 80/20',
          consumptionUom: 'KG',
          stock: 50.0,
          averageCost: 25.0,
          negativeStockPolicy: 'RESTRICT',
        ),
      ]);
      await insertDirectMappedProduct(
        id: 'prod-porcion-arroz',
        productType: 'SIMPLE',
        mappingVersionId: 'mv-arroz-1',
        insumoId: 'insumo-arroz',
      );

      final result = await service.prepare(
        invoice: buildInvoice(),
        items: [buildDirectItem(productId: 'prod-porcion-arroz', quantity: 2.0)],
        offlineUserId: 'user-1',
        tenantId: 'tenant-1',
        terminalId: 'term-1',
      );
      expect(result.invoice.inventoryOutcome, 'APPLIED');
    },
  );

  test(
    'R28: a SWAP modifier replaces the component in the snapshot (the '
    'substitute is not a recipe component, so the authority must resolve it '
    'anyway)',
    () async {
      // The rig found this: the almond milk is NOT a component of the
      // recipe, so the recipe's closure never carried it. The deviation
      // resolver then skipped the effect as "insumo not in catalog" and
      // the line consumed the RECIPE AS WRITTEN: the whole milk was
      // downloaded and the almond milk never was.
      final dao = database.authorityProjectionDao;
      await dao.insertInsumo(
        const AuthorityInsumoEntity(
          tenantId: 'tenant-1',
          id: 'insumo-beef',
          name: 'Ground Beef',
          uom: 'KG',
        ),
      );
      await dao.insertInsumo(
        const AuthorityInsumoEntity(
          tenantId: 'tenant-1',
          id: 'insumo-alternativa',
          name: 'Ground Beef Alternative',
          uom: 'KG',
        ),
      );
      await dao.insertRecipeVersion(
        const AuthorityRecipeVersionEntity(
          tenantId: 'tenant-1',
          id: 'ver-burger-1',
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
          tenantId: 'tenant-1',
          id: 'comp-1',
          versionId: 'ver-burger-1',
          ordinal: 0,
          insumoId: 'insumo-beef',
          grossQuantity: 0.25,
          technicalShrinkPct: 0.0,
          ingredientType: 'DIRECT',
          componentName: 'Patty',
        ),
      );
      // A second component: the substitution APPENDS the substitute, so
      // without the canonical order the bindings would not be sorted and
      // the frozen snapshot would be invalid ("Invalid sale-time inventory
      // snapshot") — the sale refused for a substitution the operator had
      // just chosen.
      await dao.insertInsumo(
        const AuthorityInsumoEntity(
          tenantId: 'tenant-1',
          id: 'insumo-queso',
          name: 'Cheese',
          uom: 'KG',
        ),
      );
      await dao.insertComponent(
        const AuthorityRecipeVersionComponentEntity(
          tenantId: 'tenant-1',
          id: 'comp-2',
          versionId: 'ver-burger-1',
          ordinal: 1,
          insumoId: 'insumo-queso',
          grossQuantity: 0.1,
          technicalShrinkPct: 0.0,
          ingredientType: 'DIRECT',
          componentName: 'Cheese',
        ),
      );
      await database.database.execute(
        "INSERT INTO products (id, name, uom, stock, average_cost, sell_price, is_active, is_prepared, product_type, tenant_id, tax_rate, is_tax_exempt) "
        "VALUES ('prod-burger', 'Classic Burger', 'UNIT', 10.0, 50.0, 150.0, 1, 1, 'PREPARED', 'tenant-1', 0.15, 0)",
      );

      final invoice = Invoice(
        id: 'inv-1',
        number: 'PENDING',
        createdAt: DateTime.parse('2026-09-01T12:00:00Z'),
        userId: 'user-1',
        subtotal: 160.0,
        totalTax: 24.0,
        total: 184.0,
        terminalId: 'term-1',
      );
      final items = <InvoiceItem>[
        const InvoiceItem(
          id: 'item-1',
          invoiceId: 'inv-1',
          productId: 'prod-burger',
          productName: 'Classic Burger',
          quantity: 1.0,
          unitPrice: 160.0,
          originalTaxRate: 0.15,
          appliedTaxRate: 0.15,
          taxAmount: 24.0,
          total: 184.0,
          selectedModifiers: [
            Modifier(
              id: 'opt-alternativa',
              name: 'Carne: Alternativa',
              extraPrice: 10,
              optionId: 'opt-alternativa',
              groupId: 'grp-carne',
              inventoryEffect: 'SWAP',
              effectInsumoId: 'insumo-alternativa',
              effectTargetInsumoId: 'insumo-beef',
            ),
          ],
        ),
      ];

      final result = await service.prepare(
        invoice: invoice,
        items: items,
        offlineUserId: 'user-1',
        tenantId: 'tenant-1',
        terminalId: 'term-1',
      );

      final snapshot = result.items.first.inventorySnapshot;
      expect(snapshot, isNotNull);
      final bindings = snapshot!.bindings;
      // The replaced component is NOT consumed...
      expect(
        bindings.any((binding) => binding.insumoId == 'insumo-beef'),
        isFalse,
      );
      // ...and the substitute IS, in the component's own quantity.
      final substitute = bindings.firstWhere(
        (binding) => binding.insumoId == 'insumo-alternativa',
      );
      expect(substitute.quantityPerSaleUnit, 0.25);
      // The frozen document is in the CANONICAL order (by insumo id): the
      // substitute is appended by the deviation, and the snapshot is only
      // valid when the bindings are sorted.
      expect(
        bindings.map((binding) => binding.insumoId).toList(),
        ['insumo-alternativa', 'insumo-queso'],
      );
    },
  );
}
