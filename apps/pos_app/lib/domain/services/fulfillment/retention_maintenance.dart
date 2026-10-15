import 'dart:developer' as developer;

import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/services/fiscal_inbox_handler.dart'
    show FiscalProjectionKeys;
import 'package:pos_app/domain/services/fulfillment/durable_print_service.dart';

/// #528 R1+R2: the device's retention/lifecycle trigger. The purge existed
/// inside [DurablePrintService] but was never invoked (orphan #6 of the
/// "implemented, tested, no production caller" class) and nothing measured
/// the device lifecycle. [runOnce] is called at boot and every 24h by the
/// app bootstrap: it purges fulfillment records past the configurable
/// window (strictly preserving DGI invoices and kardex — the purge's own
/// contract) and measures the row counts + database size (R1, the daily
/// lifecycle log the issue demands before sizing any threshold).
class RetentionMaintenance {
  final AppDatabase _database;
  final DurablePrintService _durablePrintService;

  RetentionMaintenance({
    required AppDatabase database,
    required DurablePrintService durablePrintService,
  })  : _database = database,
        _durablePrintService = durablePrintService;

  Future<RetentionMaintenanceResult> runOnce({required DateTime now}) async {
    // Gate: the tenant scope comes from the fiscal projection — absent
    // before the first sync, and without it the purge has no tenant scope
    // (pre-first-sync devices must not touch anything).
    final tenantEntity = await _database.localConfigDao.getConfigByKey(
      FiscalProjectionKeys.tenantId,
    );
    final tenantId = tenantEntity?.value.trim() ?? '';
    if (tenantId.isEmpty) {
      return const RetentionMaintenanceResult.zero();
    }

    // R2: the window is explicit and configurable (local_configs), never a
    // silent constant baked into the call site.
    final daysEntity = await _database.localConfigDao.getConfigByKey(
      'fulfillment_retention_days',
    );
    final retentionDays = int.tryParse(daysEntity?.value.trim() ?? '') ?? 30;
    final cutoff = now.subtract(Duration(days: retentionDays));

    final purge = await _durablePrintService.purgeFulfillmentRetention(
      tenantId: tenantId,
      cutoff: cutoff,
    );

    // R1: the daily lifecycle measurement.
    final invoiceCount = await _count('invoices');
    final auditLogCount = await _count('audit_logs');
    final movementCount = await _count('inventory_movements');
    final dbSizeBytes = await _dbSizeBytes();

    final result = RetentionMaintenanceResult(
      purgedFulfillments: purge.purgedFulfillments,
      invoiceCount: invoiceCount,
      auditLogCount: auditLogCount,
      movementCount: movementCount,
      dbSizeBytes: dbSizeBytes,
    );
    developer.log(
      '[RETENTION] purged=${result.purgedFulfillments} '
      'invoices=${result.invoiceCount} auditLogs=${result.auditLogCount} '
      'movements=${result.movementCount} dbSizeBytes=${result.dbSizeBytes}',
      name: 'RetentionMaintenance',
    );
    return result;
  }

  Future<int> _count(String table) async {
    final rows = await _database.database.rawQuery(
      'SELECT COUNT(*) AS c FROM $table',
    );
    final value = rows.first['c'];
    return value is int ? value : int.parse(value.toString());
  }

  Future<int> _dbSizeBytes() async {
    final pages = await _database.database.rawQuery('PRAGMA page_count');
    final pageSize = await _database.database.rawQuery('PRAGMA page_size');
    final pageCount = (pages.first['page_count'] as int?) ?? 0;
    final pageSizeBytes = (pageSize.first['page_size'] as int?) ?? 0;
    return pageCount * pageSizeBytes;
  }
}

class RetentionMaintenanceResult {
  final int purgedFulfillments;
  final int invoiceCount;
  final int auditLogCount;
  final int movementCount;
  final int dbSizeBytes;

  const RetentionMaintenanceResult({
    required this.purgedFulfillments,
    required this.invoiceCount,
    required this.auditLogCount,
    required this.movementCount,
    required this.dbSizeBytes,
  });

  const RetentionMaintenanceResult.zero()
      : this(
          purgedFulfillments: 0,
          invoiceCount: 0,
          auditLogCount: 0,
          movementCount: 0,
          dbSizeBytes: 0,
        );
}
