import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/database/migrations.dart';
import 'package:pos_app/data/models/sales/invoice_entity.dart';
import 'package:pos_app/domain/models/config/tenant_operation_mode.dart';
import 'package:pos_app/domain/models/fulfillment/fulfillment_contracts.dart';
import 'package:pos_app/domain/models/sales/cart_item.dart';
import 'package:pos_app/domain/services/fulfillment/fulfillment_execution_service.dart';

void main() {
  late AppDatabase database;
  late FulfillmentExecutionService service;

  setUp(() async {
    database = await $FloorAppDatabase
        .inMemoryDatabaseBuilder()
        .addCallback(inventoryMovementAppendOnlyCallback)
        .build();
    service = FulfillmentExecutionService(database);
  });

  tearDown(() async {
    await database.close();
  });

  group('FulfillmentExecutionService - Channel Semantics & Execution', () {
    test(
      'PRINT_ONLY creates thermal print jobs, NO active KDS orders, and deliveryState is PENDING',
      () async {
        const topology = FulfillmentTopology(
          tenantId: 'tenant-1',
          contractVersion: 1,
          revision: 1,
          operationMode: TenantOperationMode.foodparkQsr,
          channels: {FulfillmentChannel.print},
        );

        final items = [
          const CartItem(
            productId: 'p-1',
            productName: 'Tacos al Pastor',
            unitPrice: 100,
            quantity: 2,
            taxRate: 0.15,
          ),
        ];

        final result = await service.executeFulfillment(
          tenantId: 'tenant-1',
          saleId: 'sale-print-only-1',
          invoiceNumber: '001-001-01-00000001',
          items: items,
          topology: topology,
          cashierName: 'Juan Cajero',
        );

        expect(result.channel, 'PRINT_ONLY');
        expect(result.routeState, 'ROUTED');
        expect(result.deliveryState, 'PENDING');

        // Verify print jobs were created (receipt seq 0, ticket seq 1)
        final printJobs = await database.fulfillmentPersistenceDao
            .findRetryablePrintJobs('tenant-1');
        expect(printJobs, hasLength(2));
        expect(printJobs[0].sequence, 0);
        expect(printJobs[0].documentKind, 'RECEIPT');
        expect(printJobs[1].sequence, 1);
        expect(printJobs[1].documentKind, 'TICKET');

        // Active query suppression: PRINT_ONLY must NOT appear in active KDS orders!
        final activeKds = await service.getActiveKdsOrders('tenant-1');
        expect(activeKds, isEmpty);
      },
    );

    test(
      'KDS_ONLY creates active KDS orders, NO ticket print jobs, and deliveryState is PENDING',
      () async {
        const topology = FulfillmentTopology(
          tenantId: 'tenant-1',
          contractVersion: 1,
          revision: 1,
          operationMode: TenantOperationMode.restaurant,
          channels: {FulfillmentChannel.kds},
        );

        final items = [
          const CartItem(
            productId: 'p-2',
            productName: 'Hamburguesa Doble',
            unitPrice: 150,
            quantity: 1,
            taxRate: 0.15,
          ),
        ];

        final result = await service.executeFulfillment(
          tenantId: 'tenant-1',
          saleId: 'sale-kds-only-1',
          invoiceNumber: '001-001-01-00000002',
          items: items,
          topology: topology,
          cashierName: 'Juan Cajero',
        );

        expect(result.channel, 'KDS_ONLY');
        expect(result.routeState, 'ROUTED');
        expect(result.deliveryState, 'PENDING');

        // Only receipt print job (seq 0) is created; kitchen ticket is NOT printed
        final printJobs = await database.fulfillmentPersistenceDao
            .findRetryablePrintJobs('tenant-1');
        expect(printJobs, hasLength(1));
        expect(printJobs.single.documentKind, 'RECEIPT');

        // Active KDS work exists
        final activeKds = await service.getActiveKdsOrders('tenant-1');
        expect(activeKds, hasLength(1));
        expect(activeKds.single.items.single.productName, 'Hamburguesa Doble');
        expect(activeKds.single.status, 'PENDIENTE');
      },
    );

    test(
      'KDS_AND_PRINT creates BOTH KDS orders and kitchen print jobs',
      () async {
        const topology = FulfillmentTopology(
          tenantId: 'tenant-1',
          contractVersion: 1,
          revision: 1,
          operationMode: TenantOperationMode.hybrid,
          channels: {FulfillmentChannel.kds, FulfillmentChannel.print},
        );

        final items = [
          const CartItem(
            productId: 'p-3',
            productName: 'Pizza Margarita',
            unitPrice: 200,
            quantity: 1,
            taxRate: 0.15,
          ),
        ];

        final result = await service.executeFulfillment(
          tenantId: 'tenant-1',
          saleId: 'sale-hybrid-1',
          invoiceNumber: '001-001-01-00000003',
          items: items,
          topology: topology,
          cashierName: 'Juan Cajero',
        );

        expect(result.channel, 'KDS_AND_PRINT');
        expect(result.routeState, 'ROUTED');
        expect(result.deliveryState, 'PENDING');

        // Print jobs created for both receipt and kitchen ticket
        final printJobs = await database.fulfillmentPersistenceDao
            .findRetryablePrintJobs('tenant-1');
        expect(printJobs, hasLength(2));

        // KDS orders created
        final activeKds = await service.getActiveKdsOrders('tenant-1');
        expect(activeKds, hasLength(1));
        expect(activeKds.single.items.single.productName, 'Pizza Margarita');
      },
    );
  });

  group('FulfillmentExecutionService - Delivery Independence', () {
    test(
      'Print completion marks routeState PRINTED but deliveryState remains PENDING',
      () async {
        const topology = FulfillmentTopology(
          tenantId: 'tenant-1',
          contractVersion: 1,
          revision: 1,
          operationMode: TenantOperationMode.foodparkQsr,
          channels: {FulfillmentChannel.print},
        );

        final result = await service.executeFulfillment(
          tenantId: 'tenant-1',
          saleId: 'sale-indep-1',
          invoiceNumber: '001-001-01-00000010',
          items: [
            const CartItem(
              productId: 'p-1',
              productName: 'Tacos',
              unitPrice: 50,
              quantity: 1,
              taxRate: 0.15,
            ),
          ],
          topology: topology,
          cashierName: 'Cajero',
        );

        // Simulate printer completed
        await service.markPrintCompleted(
          tenantId: 'tenant-1',
          fulfillmentId: result.id,
        );

        final updated = await database.fulfillmentPersistenceDao
            .findFulfillment(result.id, 'tenant-1');

        expect(updated!.routeState, 'PRINTED');
        // INVARIANT: printing never marks DELIVERED!
        expect(updated.deliveryState, 'PENDING');
        expect(updated.deliveryState, isNot('DELIVERED'));
      },
    );

    test(
      'KDS bump marks deliveryState DELIVERED without altering route/print state',
      () async {
        const topology = FulfillmentTopology(
          tenantId: 'tenant-1',
          contractVersion: 1,
          revision: 1,
          operationMode: TenantOperationMode.hybrid,
          channels: {FulfillmentChannel.kds, FulfillmentChannel.print},
        );

        final result = await service.executeFulfillment(
          tenantId: 'tenant-1',
          saleId: 'sale-indep-2',
          invoiceNumber: '001-001-01-00000011',
          items: [
            const CartItem(
              productId: 'p-1',
              productName: 'Tacos',
              unitPrice: 50,
              quantity: 1,
              taxRate: 0.15,
            ),
          ],
          topology: topology,
          cashierName: 'Cajero',
        );

        // Mark print completed
        await service.markPrintCompleted(
          tenantId: 'tenant-1',
          fulfillmentId: result.id,
        );

        // Bump KDS delivery
        final activeKds = await service.getActiveKdsOrders('tenant-1');
        expect(activeKds, hasLength(1));
        await service.bumpKdsOrder(
          tenantId: 'tenant-1',
          orderId: activeKds.single.id,
        );

        final updated = await database.fulfillmentPersistenceDao
            .findFulfillment(result.id, 'tenant-1');

        expect(updated!.routeState, 'PRINTED');
        expect(updated.deliveryState, 'DELIVERED');

        // And active KDS query now suppresses this delivered order
        final remainingKds = await service.getActiveKdsOrders('tenant-1');
        expect(remainingKds, isEmpty);
      },
    );
  });

  group('FulfillmentExecutionService - Legacy Read Adapter', () {
    test(
      'Adapts historical sales with legacy kitchen_orders when fulfillment_records row is absent',
      () async {
        // Seed legacy invoice entity directly into SQLite
        await database.invoiceDao.insertInvoice(
          InvoiceEntity(
            id: 'legacy-sale-1',
            number: '001-001-01-00009999',
            createdAt: 1700000000000,
            userId: 'cashier-1',
            subtotal: 100,
            totalTax: 15,
            total: 115,
          ),
        );

        // Read through legacy adapter
        final record = await service.getFulfillmentBySaleId(
          tenantId: 'tenant-1',
          saleId: 'legacy-sale-1',
        );

        expect(record, isNotNull);
        expect(record!.saleId, 'legacy-sale-1');
        expect(record.channel, 'LEGACY_ADAPTED');
        expect(record.deliveryState, 'DELIVERED');
      },
    );
  });
}
