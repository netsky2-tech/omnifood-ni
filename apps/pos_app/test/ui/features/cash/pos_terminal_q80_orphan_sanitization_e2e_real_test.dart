import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/audit_log_entity.dart';
import 'package:pos_app/data/models/local_config_entity.dart';
import 'package:pos_app/data/models/sales/cashier_session_entity.dart';
import 'package:pos_app/data/services/sync_service.dart';
import 'package:pos_app/domain/models/inventory/count_session_document.dart';
import 'package:pos_app/domain/models/inventory/forensic_alert.dart';
import 'package:pos_app/domain/models/inventory/inventory_movement.dart';
import 'package:pos_app/domain/models/inventory/production_order_document.dart';
import 'package:pos_app/domain/models/inventory/purchase.dart';
import 'package:pos_app/domain/models/inventory/recipe_version_document.dart';
import 'package:pos_app/domain/models/user.dart';
import 'package:pos_app/domain/repositories/audit_repository.dart';
import 'package:pos_app/domain/repositories/inventory/inventory_repository.dart';
import 'package:pos_app/domain/repositories/sales/sales_repository.dart';
import 'package:pos_app/ui/features/cash/cash_shift_view_model.dart';
import 'package:pos_app/ui/features/cash/widgets/device_shifts_dialog.dart';

class _FakeSalesRepository implements SalesRepository {
  @override
  dynamic noSuchMethod(Invocation invocation) => throw UnimplementedError();

  @override
  Future<List<Map<String, dynamic>>> getUnsyncedAggregates() async => [];
}

class _RealDatabaseAuditRepository implements AuditRepository {
  final AppDatabase database;
  final String _deviceId;

  _RealDatabaseAuditRepository(this.database, this._deviceId);

  @override
  String get deviceId => _deviceId;

  @override
  Future<void> log(String action, {String? metadata}) async {
    return logForensic(action, metadata: metadata);
  }

  @override
  Future<void> logForensic(
    String action, {
    String? metadata,
    String? metodoAutorizacion,
    String? usuarioAutorizadorId,
  }) async {
    await database.auditDao.appendForensicLog(
      'tenant-prod-soho',
      _deviceId,
      usuarioAutorizadorId ?? 'user-owner-01',
      (sequenceNo, prevHash) => AuditLogEntity(
        id: null,
        tenantId: 'tenant-prod-soho',
        deviceId: _deviceId,
        userId: usuarioAutorizadorId ?? 'user-owner-01',
        sequenceNo: sequenceNo,
        prevHash: prevHash,
        entryHash: 'hash-$sequenceNo',
        timestamp: DateTime.now().toIso8601String(),
        action: action,
        metadata: metadata,
        isSynced: false,
        remoteRefUuid: 'remote-uuid-$sequenceNo',
        metodoAutorizacion: metodoAutorizacion,
        usuarioAutorizadorId: usuarioAutorizadorId,
      ),
    );
  }

  @override
  Future<AuditSyncOutcome> syncLogs() async =>
      const AuditSyncOutcome.complete();

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeInventoryRepository implements InventoryRepository {
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);

  @override
  Future<List<InventoryMovement>> getUnsyncedMovements() async => [];

  @override
  Future<List<Purchase>> getUnsyncedPurchases() async => [];

  @override
  Future<List<CountSessionDocument>> getUnsyncedCountSessionDocuments() async =>
      [];

  @override
  Future<List<ProductionOrderDocument>> getUnsyncedProductionOrders() async => [];

  @override
  Future<List<RecipeVersionDocument>> getUnsyncedRecipeVersionDocuments() async =>
      [];

  @override
  Future<List<ForensicAlert>> getUnsyncedForensicAlerts() async => [];
}

void main() {
  late AppDatabase database;
  late Dio dio;
  late SyncService syncService;
  late _RealDatabaseAuditRepository auditRepo;
  late List<Map<String, dynamic>> capturedShiftSyncRequests;

  const terminalId = 'Q802024120001';

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  setUp(() async {
    database = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();

    await database.localConfigDao.saveConfig(
      LocalConfigEntity(key: 'tenant_id', value: 'tenant-prod-soho'),
    );

    auditRepo = _RealDatabaseAuditRepository(database, terminalId);

    capturedShiftSyncRequests = [];
    dio = Dio();
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          if (options.path == '/sales/shifts/sync') {
            capturedShiftSyncRequests.add(
              Map<String, dynamic>.from(options.data as Map),
            );
            final body = options.data as Map;
            final records = [
              ...(body['sessions'] as List),
              ...(body['movements'] as List),
            ];
            return handler.resolve(
              Response(
                requestOptions: options,
                statusCode: 200,
                data: {
                  'received': records.length,
                  'processed': records.length,
                  'failed': 0,
                  'results': [
                    for (final record in records)
                      {
                        'idempotencyKey': (record as Map)['id'],
                        'status': 'ACCEPTED',
                      },
                  ],
                },
              ),
            );
          }
          return handler.resolve(
            Response(
              requestOptions: options,
              statusCode: 200,
              data: {'results': []},
            ),
          );
        },
      ),
    );

    syncService = SyncService(
      auditRepo,
      _FakeSalesRepository(),
      _FakeInventoryRepository(),
      dio,
      database: database,
    );
  });

  tearDown(() async {
    syncService.dispose();
    await database.close();
  });

  group('Paso C (#943) - E2E Real SQLite Terminal Q80 Simulation', () {
    test(
        'Real SQLite: Q80 historical orphan shifts converge without infinite re-push, sanitize bulk with sequential Z and forensic audits, reaching zero pending',
        () async {
      final now = DateTime.now().millisecondsSinceEpoch;

      // Simulate terminal Q80 delivered state:
      // 2 historical abandoned open shifts from previous operators
      // and 1 active shift opened by current owner
      final historicalOrphan1 = CashierSessionEntity(
        id: 'shift-q80-hist-01',
        userId: 'user-cajero-antiguo',
        cashierName: 'Manuel Fonseca',
        terminalId: terminalId,
        openedAt: now - 3600000 * 72,
        openingBalanceNio: 1000.0,
        expectedNio: 1000.0,
        isClosed: false,
        syncStatus: 'pending',
      );
      final historicalOrphan2 = CashierSessionEntity(
        id: 'shift-q80-hist-02',
        userId: 'user-cajera-relevo',
        cashierName: 'Elena Rostrán',
        terminalId: terminalId,
        openedAt: now - 3600000 * 48,
        openingBalanceNio: 1200.0,
        expectedNio: 1200.0,
        isClosed: false,
        syncStatus: 'pending',
      );
      final currentActiveShift = CashierSessionEntity(
        id: 'shift-q80-active-owner',
        userId: 'user-owner-01',
        cashierName: 'Octavio Morales',
        terminalId: terminalId,
        openedAt: now - 1800000,
        openingBalanceNio: 2000.0,
        openingBalanceUsd: 50.0,
        expectedNio: 2000.0,
        expectedUsd: 50.0,
        isClosed: false,
        syncStatus: 'pending',
      );

      await database.cashierSessionDao.insertSession(historicalOrphan1);
      await database.cashierSessionDao.insertSession(historicalOrphan2);
      await database.cashierSessionDao.insertSession(currentActiveShift);

      // 1. Pending outbox count reveals all 3 pending shifts
      expect(await syncService.getPendingOutboxCount(), 3);

      // 2. Run sync: pushes all 3 shifts and marks them 'synced'
      await syncService.triggerManualSync();

      expect(capturedShiftSyncRequests, hasLength(1));
      final pushedBatch = capturedShiftSyncRequests.first['sessions'] as List;
      expect(pushedBatch, hasLength(3));

      // Verify all 3 sessions are now 'synced' in SQLite
      expect(await syncService.getPendingOutboxCount(), 0);
      final s1 = await database.cashierSessionDao.getSessionById(historicalOrphan1.id);
      final s2 = await database.cashierSessionDao.getSessionById(historicalOrphan2.id);
      final sActive = await database.cashierSessionDao.getSessionById(currentActiveShift.id);
      expect(s1!.syncStatus, 'synced');
      expect(s2!.syncStatus, 'synced');
      expect(sActive!.syncStatus, 'synced');

      // 3. Second sync pass: MUST NOT re-push the synced shifts (infinite re-push broken)
      await syncService.triggerManualSync();
      expect(capturedShiftSyncRequests, hasLength(1));

      // 4. Initialize CashShiftViewModel for supervisor on this terminal
      final vm = CashShiftViewModel(
        sessionDao: database.cashierSessionDao,
        movementDao: database.cashMovementDao,
        paymentDao: database.paymentDao,
        auditRepository: auditRepo,
        currentUserId: 'user-owner-01',
        currentUserName: 'Octavio Morales',
        currentTerminalId: terminalId,
        currentUserRole: UserRole.owner,
        openAccountsLoader: () async => const [],
      );
      await vm.init();

      expect(vm.hasActiveShift, isTrue);
      expect(vm.activeShift?.id, 'shift-q80-active-owner');
      expect(vm.orphanShifts, hasLength(2));

      // 5. Execute bulk sanitization
      final sanitizedCount = await vm.sanitizeAllOrphanShifts(
        reason: 'Saneamiento de turnos huérfanos Q802024120001 antes de corte nocturno',
      );
      expect(sanitizedCount, 2);

      // 6. Verify in SQLite real:
      // A) Both orphans are closed with sequential Z reports
      final closed1 = await database.cashierSessionDao.getSessionById(historicalOrphan1.id);
      final closed2 = await database.cashierSessionDao.getSessionById(historicalOrphan2.id);
      expect(closed1!.isClosed, isTrue);
      expect(closed2!.isClosed, isTrue);
      expect(closed1.zReportSequence, 1);
      expect(closed2.zReportSequence, 2);
      expect(closed1.syncStatus, 'pending');
      expect(closed2.syncStatus, 'pending');

      // B) Current active shift remains OPEN and intact
      final activeAfter = await database.cashierSessionDao.getSessionById(currentActiveShift.id);
      expect(activeAfter!.isClosed, isFalse);
      expect(vm.orphanShifts, isEmpty);

      // C) Real audit_logs table contains 2 forensic entries
      final logs = await database.auditDao.findAllLogs();
      expect(logs, hasLength(2));
      for (final log in logs) {
        expect(log.action, 'ADMINISTRATIVE_CLOSE_ORPHAN_SHIFT');
        expect(log.userId, 'user-owner-01');
        expect(log.deviceId, terminalId);
        final meta = jsonDecode(log.metadata!) as Map<String, dynamic>;
        expect(meta['action'], 'bulk_orphan_shift_sanitization');
        expect(meta['terminal_id'], terminalId);
        expect(meta['reason'], 'Saneamiento de turnos huérfanos Q802024120001 antes de corte nocturno');
      }

      // 7. Sync pass pushes the closed states to the cloud and converges to 0 pending
      expect(await syncService.getPendingOutboxCount(), 2);
      await syncService.triggerManualSync();

      expect(capturedShiftSyncRequests, hasLength(2));
      final closingPayload = capturedShiftSyncRequests.last['sessions'] as List;
      expect(closingPayload, hasLength(2));
      expect(closingPayload[0]['status'], 'CLOSED');
      expect(closingPayload[1]['status'], 'CLOSED');

      expect(await syncService.getPendingOutboxCount(), 0);

      // 8. Idempotency verification: a repeated sanitization touches 0 rows and logs 0 additional events
      final repeatCount = await vm.sanitizeAllOrphanShifts(
        reason: 'Saneamiento de turnos huérfanos Q802024120001 antes de corte nocturno',
      );
      expect(repeatCount, 0);
      expect(await database.auditDao.findAllLogs(), hasLength(2));
      expect(await syncService.getPendingOutboxCount(), 0);
    });
  });
}
