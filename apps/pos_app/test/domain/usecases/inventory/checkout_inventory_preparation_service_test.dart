import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/inventory/authority_projection_entities.dart';
import 'package:pos_app/data/models/local_config_entity.dart';
import 'package:pos_app/domain/models/sales/invoice.dart';
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
}
