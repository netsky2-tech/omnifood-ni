import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/inventory/authority_projection_entities.dart';
import 'package:pos_app/domain/models/sales/invoice.dart';
import 'package:pos_app/domain/models/sales/invoice_item.dart';
import 'package:pos_app/domain/usecases/inventory/checkout_inventory_preparation_service.dart';
import 'package:pos_app/domain/usecases/inventory/validated_sale_inventory_authority.dart';

void main() {
  late AppDatabase database;
  late CheckoutInventoryPreparationService service;

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  setUp(() async {
    database = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();
    service = CheckoutInventoryPreparationService(database);
  });

  tearDown(() async {
    await database.close();
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
}
