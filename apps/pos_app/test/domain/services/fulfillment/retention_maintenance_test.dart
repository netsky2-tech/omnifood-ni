import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/database/migrations.dart';
import 'package:pos_app/data/models/local_config_entity.dart';
import 'package:pos_app/data/models/fulfillment/fulfillment_persistence_entities.dart';
import 'package:pos_app/data/models/sales/invoice_entity.dart';
import 'package:pos_app/data/services/fiscal_inbox_handler.dart'
    show FiscalProjectionKeys;
import 'package:pos_app/domain/ports/printer_port.dart';
import 'package:pos_app/domain/repositories/audit_repository.dart';
import 'package:pos_app/domain/services/fulfillment/durable_print_service.dart';
import 'package:pos_app/domain/services/fulfillment/retention_maintenance.dart';

class _FakePrinterPort implements PrinterPort {
  @override
  dynamic noSuchMethod(Invocation invocation) => throw UnimplementedError();
}

class _FakeAuditRepository implements AuditRepository {
  @override
  String get deviceId => 'pos-1';

  @override
  Future<void> log(String action, {String? metadata}) async {}

  @override
  dynamic noSuchMethod(Invocation invocation) => throw UnimplementedError();
}

/// #528 R1+R2: the retention purge existed but was never invoked (orphan
/// #6 of the "implemented, tested, no production caller" class) and nothing
/// measured the device lifecycle. RetentionMaintenance is the real trigger:
/// boot + periodic, with an explicit configurable window and the R1
/// measurement surfaced in the result for the daily log.
void main() {
  late AppDatabase database;
  late DurablePrintService durablePrintService;
  late RetentionMaintenance maintenance;
  const tenantId = 'tenant-retention-1';

  setUp(() async {
    database = await $FloorAppDatabase
        .inMemoryDatabaseBuilder()
        .addCallback(inventoryMovementAppendOnlyCallback)
        .build();
    durablePrintService = DurablePrintService(
      database: database,
      printerPort: _FakePrinterPort(),
      auditRepository: _FakeAuditRepository(),
    );
    maintenance = RetentionMaintenance(
      database: database,
      durablePrintService: durablePrintService,
    );
  });

  tearDown(() async {
    await database.close();
  });

  Future<void> seedTenantProjection() async {
    await database.localConfigDao.saveConfig(
      LocalConfigEntity(
        key: FiscalProjectionKeys.tenantId,
        value: tenantId,
        description: 'test',
      ),
    );
  }

  Future<void> seedInvoiceWithFulfillment({
    required String id,
    required DateTime createdAt,
  }) async {
    await database.invoiceDao.insertInvoice(
      InvoiceEntity(
        id: id,
        number: '001-001-01-${id.substring(id.length - 8)}',
        createdAt: createdAt.millisecondsSinceEpoch,
        userId: 'c-1',
        subtotal: 100,
        totalTax: 15,
        total: 115,
      ),
    );
    await database.fulfillmentPersistenceDao.insertFulfillment(
      FulfillmentRecordEntity(
        id: 'f-$id',
        tenantId: tenantId,
        saleId: id,
        topologySnapshotId: 'snap-1',
        topologyRevision: 1,
        channel: 'PRINT_ONLY',
        routeState: 'PRINTED',
        deliveryState: 'DELIVERED',
        linesPayload: '[]',
      ),
    );
  }

  test(
    'purges fulfillments whose invoice is older than the configured window',
    () async {
      await seedTenantProjection();
      await database.localConfigDao.saveConfig(
        LocalConfigEntity(
          key: 'fulfillment_retention_days',
          value: '30',
          description: 'test',
        ),
      );
      await seedInvoiceWithFulfillment(
        id: 'sale-old-1',
        createdAt: DateTime.now().subtract(const Duration(days: 91)),
      );

      final result = await maintenance.runOnce(now: DateTime.now());

      expect(result.purgedFulfillments, 1);
      final remaining = await database.fulfillmentPersistenceDao
          .findAllFulfillments(tenantId);
      expect(remaining, isEmpty);
    },
  );

  test(
    'keeps fulfillments inside the configured window',
    () async {
      await seedTenantProjection();
      await database.localConfigDao.saveConfig(
        LocalConfigEntity(
          key: 'fulfillment_retention_days',
          value: '30',
          description: 'test',
        ),
      );
      await seedInvoiceWithFulfillment(
        id: 'sale-recent-1',
        createdAt: DateTime.now().subtract(const Duration(days: 2)),
      );

      final result = await maintenance.runOnce(now: DateTime.now());

      expect(result.purgedFulfillments, 0);
      final remaining = await database.fulfillmentPersistenceDao
          .findAllFulfillments(tenantId);
      expect(remaining, hasLength(1));
    },
  );

  test(
    'skips everything when the tenant id is not yet projected (pre-first-sync gate)',
    () async {
      // NO tenant projection: the device is not linked yet — the purge has
      // no tenant scope and must not touch anything.
      await seedInvoiceWithFulfillment(
        id: 'sale-ungated-1',
        createdAt: DateTime.now().subtract(const Duration(days: 91)),
      );

      final result = await maintenance.runOnce(now: DateTime.now());

      expect(result.purgedFulfillments, 0);
      // The fulfillment is untouched — still under its own tenant scope.
      final remaining = await database.fulfillmentPersistenceDao
          .findAllFulfillments('tenant-retention-1');
      expect(remaining, hasLength(1));
    },
  );

  test(
    'surfaces the R1 lifecycle measurement (row counts + db size)',
    () async {
      await seedTenantProjection();
      await seedInvoiceWithFulfillment(
        id: 'sale-measured-1',
        createdAt: DateTime.now(),
      );

      final result = await maintenance.runOnce(now: DateTime.now());

      expect(result.invoiceCount, greaterThanOrEqualTo(1));
      expect(result.auditLogCount, greaterThanOrEqualTo(0));
      expect(result.movementCount, greaterThanOrEqualTo(0));
      expect(result.dbSizeBytes, greaterThan(0));
    },
  );
}
