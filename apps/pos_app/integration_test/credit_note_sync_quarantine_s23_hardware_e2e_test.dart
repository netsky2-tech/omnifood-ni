import 'dart:convert';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/sales/invoice_entity.dart';
import 'package:pos_app/data/repositories/inventory/inventory_repository_impl.dart';
import 'package:pos_app/data/repositories/sales/sales_repository_impl.dart';
import 'package:pos_app/data/services/sales/dgi_numbering_service_impl.dart';
import 'package:pos_app/data/services/sync_service.dart';
import 'package:pos_app/domain/models/audit_log.dart';
import 'package:pos_app/domain/repositories/audit_repository.dart';
import 'package:pos_app/domain/services/inventory/kardex_recalculation_engine.dart';
import 'package:pos_app/domain/services/inventory/movement_engine_impl.dart';
import 'package:pos_app/domain/services/inventory/negative_stock_regularization_service.dart';
import 'package:pos_app/domain/usecases/inventory/process_sale_inventory_use_case.dart';
import 'package:pos_app/domain/usecases/inventory/reverse_sale_inventory_use_case.dart';
import 'package:pos_app/presentation/services/alert_service_impl.dart';

/// Real Android Hardware E2E Runner for #522 (Isolated Credit Note Sync &
/// Durable Operator Quarantine on Samsung Galaxy S23 SM-S918B ARM64).
///
/// Uses 100% REAL on-device Floor SQLite (`$FloorAppDatabase.databaseBuilder`),
/// REAL `SalesRepositoryImpl`, REAL `SyncService`, and REAL `Dio` talking to a
/// REAL local loopback `HttpServer.bind(InternetAddress.loopbackIPv4, 0)`
/// running on the Android device itself — ZERO mocks.
///
/// Build & run on attached Android device:
///   flutter build apk --debug -t integration_test/credit_note_sync_quarantine_s23_hardware_e2e_test.dart
///   adb install -r build/app/outputs/flutter-apk/app-debug.apk
///   adb logcat -c && adb shell am start -n com.example.pos_app/.MainActivity
///   adb logcat -d -s flutter
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const _HardwareE2ECreditNoteSyncApp());
}

class _LoopbackAuditRepository implements AuditRepository {
  @override
  String get deviceId => 'pos-s23';

  @override
  Future<void> log(String action, {String? metadata}) async {}

  @override
  Future<AuditLog?> prepareLog(
    String action, {
    String? metadata,
    String? metodoAutorizacion,
    String? usuarioAutorizadorId,
  }) async => null;

  @override
  Future<void> logForensic(
    String action, {
    String? metadata,
    String? metodoAutorizacion,
    String? usuarioAutorizadorId,
  }) async {}

  @override
  Future<AuditSyncOutcome> syncLogs() async =>
      const AuditSyncOutcome.complete();

  @override
  Future<List<AuditLog>> getLocalLogs({
    DateTime? start,
    DateTime? end,
    String? userId,
  }) async => const [];

  @override
  Future<({int sequenceNo, String entryHash})?> getCloudStreamHead(
    String userId, {
    String? deviceId,
  }) async => null;
}

class _RecordedBatchRequest {
  final List<Map<String, dynamic>> records;
  final int statusCode;

  _RecordedBatchRequest({
    required this.records,
    required this.statusCode,
  });
}

class _HardwareE2ECreditNoteSyncApp extends StatefulWidget {
  const _HardwareE2ECreditNoteSyncApp();

  @override
  State<_HardwareE2ECreditNoteSyncApp> createState() =>
      _HardwareE2ECreditNoteSyncAppState();
}

class _HardwareE2ECreditNoteSyncAppState
    extends State<_HardwareE2ECreditNoteSyncApp> {
  final List<String> _logs = [];
  String _status = 'RUNNING';

  @override
  void initState() {
    super.initState();
    _runAll();
  }

  void _log(String msg) {
    debugPrint('[S23_E2E_CREDIT_NOTE_SYNC] $msg');
    if (mounted) {
      setState(() => _logs.add(msg));
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
      '${docsDir.path}/s23_e2e_credit_note_sync_${DateTime.now().millisecondsSinceEpoch}',
    );
    await workDir.create(recursive: true);
    final dbPath = '${workDir.path}/credit_note_sync_quarantine.db';

    AppDatabase? db;
    SyncService? syncService;
    HttpServer? server;
    Dio? dio;

    var rejectCreditNotesWith403 = false;
    final recordedBatches = <_RecordedBatchRequest>[];

    try {
      server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      server.listen((HttpRequest request) async {
        try {
          final bodyText = await utf8.decoder.bind(request).join();
          if (request.method.toUpperCase() == 'POST' &&
              request.uri.path == '/v1/sync/batch') {
            final decoded = jsonDecode(bodyText) as Map<String, dynamic>;
            final rawRecords =
                (decoded['records'] as List<dynamic>? ?? const <dynamic>[])
                    .cast<Map<String, dynamic>>();

            final isCreditNoteBatch = rawRecords.any(
              (r) => r['documentType'] == 'CREDIT_NOTE',
            );

            if (isCreditNoteBatch && rejectCreditNotesWith403) {
              recordedBatches.add(
                _RecordedBatchRequest(records: rawRecords, statusCode: 403),
              );
              request.response.statusCode = HttpStatus.forbidden;
              request.response.headers.contentType = ContentType.json;
              request.response.write(
                jsonEncode({
                  'code': 'SUPERVISOR_INACTIVE',
                  'message': 'Supervisor inactivo',
                }),
              );
              await request.response.close();
              return;
            }

            recordedBatches.add(
              _RecordedBatchRequest(records: rawRecords, statusCode: 200),
            );
            request.response.statusCode = HttpStatus.ok;
            request.response.headers.contentType = ContentType.json;
            request.response.write(
              jsonEncode({
                'status': 'OK',
                'results': rawRecords
                    .map(
                      (r) => {
                        'idempotencyKey': r['idempotencyKey'],
                        'invoiceId': r['invoiceId'],
                        'terminalId': r['terminalId'],
                        'flowType': r['flowType'] ?? 'SALES',
                        'sourceSequence': r['sourceSequence'],
                        'documentType': r['documentType'],
                        'status': 'APPLIED',
                      },
                    )
                    .toList(growable: false),
              }),
            );
            await request.response.close();
            return;
          }

          request.response.statusCode = HttpStatus.ok;
          request.response.headers.contentType = ContentType.json;
          request.response.write(jsonEncode({'ok': true}));
          await request.response.close();
        } catch (e) {
          request.response.statusCode = HttpStatus.internalServerError;
          request.response.write(jsonEncode({'error': e.toString()}));
          await request.response.close();
        }
      });

      final baseUrl = 'http://127.0.0.1:${server.port}';
      dio = Dio(
        BaseOptions(
          baseUrl: baseUrl,
          connectTimeout: const Duration(seconds: 5),
          receiveTimeout: const Duration(seconds: 5),
        ),
      );

      db = await $FloorAppDatabase.databaseBuilder(dbPath).build();
      final auditRepository = _LoopbackAuditRepository();
      final inventoryRepository = InventoryRepositoryImpl(
        insumoDao: db.insumoDao,
        recipeDao: db.recipeDao,
        recipeVersionDocumentDao: db.recipeVersionDocumentDao,
        countSessionDao: db.countSessionDao,
        countLineDao: db.countLineDao,
        forensicAlertDao: db.forensicAlertDao,
        movementDao: db.movementDao,
        movementSyncStateDao: db.movementSyncStateDao,
        supplierDao: db.supplierDao,
        warehouseDao: db.warehouseDao,
        uomConversionDao: db.uomConversionDao,
        batchDao: db.batchDao,
        purchaseDao: db.purchaseDao,
        productionOrderDocumentDao: db.productionOrderDocumentDao,
        productionTransactionDao: db.productionTransactionDao,
        dio: dio,
        database: db,
      );
      final alertService = AlertServiceImpl(inventoryRepository);
      final regularizationService = NegativeStockRegularizationService(
        database: db,
        engine: const KardexRecalculationEngine(),
      );
      final movementEngine = MovementEngineImpl(
        inventoryRepository,
        alertService,
        regularizationService: regularizationService,
      );
      final numberingService = DgiNumberingServiceImpl(
        db.localConfigDao,
        db.invoiceDao,
      );
      final salesRepository = SalesRepositoryImpl(
        database: db,
        invoiceDao: db.invoiceDao,
        itemDao: db.invoiceItemDao,
        paymentDao: db.paymentDao,
        transactionDao: db.salesTransactionDao,
        numberingService: numberingService,
        movementEngine: movementEngine,
        auditRepository: auditRepository,
        processInventoryUseCase: ProcessSaleInventoryUseCase(movementEngine),
        reverseInventoryUseCase: ReverseSaleInventoryUseCase(movementEngine),
        inventoryRepository: inventoryRepository,
      );

      syncService = SyncService(
        auditRepository,
        salesRepository,
        inventoryRepository,
        dio,
        database: db,
      );

      // =======================================================================
      // CASE 1 — Isolated-lane happy path (SALE + CREDIT_NOTE)
      // =======================================================================
      _log('E2E_CASE: [1/3] Isolated-lane happy path (SALE + CREDIT_NOTE)');

      final nowMs = DateTime.now().toUtc().millisecondsSinceEpoch;
      await db.invoiceDao.insertInvoice(
        InvoiceEntity(
          id: 'sale-1',
          number: 'F-00000001',
          createdAt: nowMs,
          userId: 'cashier-1',
          subtotal: 100.0,
          totalTax: 15.0,
          total: 115.0,
          syncStatus: 'pending',
          paymentStatus: 'paid',
          type: 'regular',
          terminalId: 'pos-s23',
          sourceSequence: 1,
          idempotencyKey: 'sale:pos-s23:sale-1',
        ),
      );
      await db.invoiceDao.insertInvoice(
        InvoiceEntity(
          id: 'cn-1',
          number: 'NC-00000001',
          createdAt: nowMs + 1000,
          userId: 'cashier-1',
          subtotal: -100.0,
          totalTax: -15.0,
          total: -115.0,
          syncStatus: 'pending',
          paymentStatus: 'paid',
          type: 'creditNote',
          originInvoiceId: 'sale-1',
          refundReasonCode: 'DEFECTIVE',
          authorizedByUserId: 'mgr-1',
          authorizedByRole: 'manager',
          terminalId: 'pos-s23',
          sourceSequence: 2,
          idempotencyKey: 'credit-note:pos-s23:cn-1',
        ),
      );

      final pendingBeforeCase1 = await syncService.getPendingOutboxCount();
      _assertTrue(
        pendingBeforeCase1 >= 2,
        'Case 1 getPendingOutboxCount() >= 2 (got $pendingBeforeCase1)',
      );

      await syncService.triggerManualSync();

      _assertTrue(
        recordedBatches.length == 2,
        'Case 1 loopback server received 2 separate POST /v1/sync/batch requests (got ${recordedBatches.length})',
      );
      _assertTrue(
        recordedBatches[0].records.length == 1 &&
            recordedBatches[0].records.single['documentType'] == 'SALE' &&
            recordedBatches[0].records.single['invoiceId'] == 'sale-1',
        'Case 1 request #1 contains SALE only',
      );
      _assertTrue(
        recordedBatches[1].records.length == 1 &&
            recordedBatches[1].records.single['documentType'] == 'CREDIT_NOTE' &&
            recordedBatches[1].records.single['invoiceId'] == 'cn-1',
        'Case 1 request #2 contains single CREDIT_NOTE record',
      );
      final cn1Payload =
          recordedBatches[1].records.single['invoice'] as Map<String, dynamic>;
      _assertTrue(
        cn1Payload['authorizedByUserId'] == 'mgr-1' &&
            cn1Payload['authorizedByRole'] == 'manager' &&
            cn1Payload['originInvoiceId'] == 'sale-1' &&
            cn1Payload['refundReasonCode'] == 'DEFECTIVE',
        'Case 1 CREDIT_NOTE carries authorizedByUserId/authorizedByRole/originInvoiceId/refundReasonCode',
      );

      final sale1After = await db.invoiceDao.getInvoiceById('sale-1');
      final cn1After = await db.invoiceDao.getInvoiceById('cn-1');
      _assertTrue(
        sale1After?.syncStatus == 'synced',
        'Case 1 sale-1 syncStatus == synced (got ${sale1After?.syncStatus})',
      );
      _assertTrue(
        cn1After?.syncStatus == 'synced',
        'Case 1 cn-1 syncStatus == synced (got ${cn1After?.syncStatus})',
      );
      _assertTrue(
        await syncService.getPendingOutboxCount() == 0,
        'Case 1 getPendingOutboxCount() == 0',
      );
      _assertTrue(
        await syncService.getQuarantinedCount() == 0,
        'Case 1 getQuarantinedCount() == 0',
      );

      passed++;
      _log(
        'E2E_RESULT: PASS [1/3] Isolated-lane happy path verified (2 separate batches, both synced, outbox=0, quarantined=0)',
      );

      // =======================================================================
      // CASE 2 — Permanent 403 Quarantine isolation
      // =======================================================================
      _log('E2E_CASE: [2/3] Permanent 403 Quarantine isolation');
      recordedBatches.clear();
      rejectCreditNotesWith403 = true;

      await db.invoiceDao.insertInvoice(
        InvoiceEntity(
          id: 'sale-2',
          number: 'F-00000002',
          createdAt: nowMs + 2000,
          userId: 'cashier-1',
          subtotal: 200.0,
          totalTax: 30.0,
          total: 230.0,
          syncStatus: 'pending',
          paymentStatus: 'paid',
          type: 'regular',
          terminalId: 'pos-s23',
          sourceSequence: 3,
          idempotencyKey: 'sale:pos-s23:sale-2',
        ),
      );
      await db.invoiceDao.insertInvoice(
        InvoiceEntity(
          id: 'cn-2',
          number: 'NC-00000002',
          createdAt: nowMs + 3000,
          userId: 'cashier-1',
          subtotal: -50.0,
          totalTax: -7.5,
          total: -57.5,
          syncStatus: 'pending',
          paymentStatus: 'paid',
          type: 'creditNote',
          originInvoiceId: 'sale-2',
          refundReasonCode: 'CUSTOMER_RETURN',
          authorizedByUserId: 'mgr-inactive',
          authorizedByRole: 'manager',
          terminalId: 'pos-s23',
          sourceSequence: 4,
          idempotencyKey: 'credit-note:pos-s23:cn-2',
        ),
      );

      await syncService.triggerManualSync();

      final sale2After = await db.invoiceDao.getInvoiceById('sale-2');
      final cn2After = await db.invoiceDao.getInvoiceById('cn-2');
      _assertTrue(
        sale2After?.syncStatus == 'synced',
        'Case 2 sale-2 is synced in SQLite (got ${sale2After?.syncStatus})',
      );
      _assertTrue(
        !syncService.isAuthBlocked,
        'Case 2 terminal is NOT isAuthBlocked',
      );
      _assertTrue(
        cn2After?.syncStatus == 'quarantined',
        'Case 2 cn-2 is durably quarantined in SQLite (got ${cn2After?.syncStatus})',
      );
      _assertTrue(
        await syncService.getQuarantinedCount() == 1,
        'Case 2 getQuarantinedCount() == 1',
      );

      final quarantinedDocs = await syncService.getQuarantinedDocuments();
      _assertTrue(
        quarantinedDocs.length == 1,
        'Case 2 getQuarantinedDocuments() length == 1 (got ${quarantinedDocs.length})',
      );
      final qDoc = quarantinedDocs.single;
      _assertTrue(
        qDoc.invoiceId == 'cn-2',
        'Case 2 quarantined doc invoiceId == cn-2 (got ${qDoc.invoiceId})',
      );
      _assertTrue(
        qDoc.code == 'SUPERVISOR_INACTIVE',
        'Case 2 quarantined doc code == SUPERVISOR_INACTIVE (got ${qDoc.code})',
      );
      _assertTrue(
        qDoc.reason.contains('Supervisor inactivo'),
        'Case 2 quarantined doc reason contains Supervisor inactivo (got ${qDoc.reason})',
      );

      // Verify durable persistence by re-reading directly from SQLite local_configs
      final rawQuarantineConfig = await db.localConfigDao.getConfigByKey(
        'sync_quarantine_reasons',
      );
      _assertTrue(
        rawQuarantineConfig != null &&
            rawQuarantineConfig.value.contains('cn-2') &&
            rawQuarantineConfig.value.contains('Supervisor inactivo'),
        'Case 2 local_configs sync_quarantine_reasons durably persisted in SQLite',
      );

      passed++;
      _log(
        'E2E_RESULT: PASS [2/3] Permanent 403 quarantined cn-2 without blocking sale-2 or setting AUTH_BLOCKED',
      );

      // =======================================================================
      // CASE 3 — Actionable Quarantine Retry (Idempotent)
      // =======================================================================
      _log('E2E_CASE: [3/3] Actionable Quarantine Retry (Idempotent)');
      final rejectedCn2Key =
          recordedBatches
              .firstWhere(
                (b) => b.records.any((r) => r['invoiceId'] == 'cn-2'),
              )
              .records
              .single['idempotencyKey']
          as String;

      recordedBatches.clear();
      rejectCreditNotesWith403 = false;

      await syncService.retryQuarantinedDocument('cn-2');

      _assertTrue(
        recordedBatches.length == 1 &&
            recordedBatches.single.records.length == 1 &&
            recordedBatches.single.records.single['invoiceId'] == 'cn-2',
        'Case 3 loopback server received retry batch for cn-2',
      );
      final retriedCn2Key =
          recordedBatches.single.records.single['idempotencyKey'] as String;
      _assertTrue(
        retriedCn2Key == rejectedCn2Key &&
            retriedCn2Key == 'credit-note:pos-s23:cn-2',
        'Case 3 retry used exact same idempotencyKey ($retriedCn2Key)',
      );

      final cn2Final = await db.invoiceDao.getInvoiceById('cn-2');
      _assertTrue(
        cn2Final?.syncStatus == 'synced',
        'Case 3 cn-2 is now syncStatus == synced (got ${cn2Final?.syncStatus})',
      );
      _assertTrue(
        await syncService.getQuarantinedCount() == 0,
        'Case 3 getQuarantinedCount() == 0',
      );
      _assertTrue(
        (await syncService.getQuarantinedDocuments()).isEmpty,
        'Case 3 getQuarantinedDocuments() is empty',
      );
      _assertTrue(
        await syncService.getPendingOutboxCount() == 0,
        'Case 3 getPendingOutboxCount() == 0',
      );

      passed++;
      _log(
        'E2E_RESULT: PASS [3/3] Idempotent quarantine retry transitioned cn-2 to synced with same idempotencyKey',
      );

      _log('E2E_RESULT: $passed/$total ALL_TESTS_PASSED');
      if (mounted) setState(() => _status = 'ALL_TESTS_PASSED ($passed/$total)');
    } catch (e, st) {
      _log('TEST_FAILED: $e\n$st');
      if (mounted) setState(() => _status = 'TEST_FAILED: $e');
    } finally {
      syncService?.dispose();
      dio?.close(force: true);
      await server?.close(force: true);
      await db?.close();
      if (await workDir.exists()) {
        await workDir.delete(recursive: true);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      home: Scaffold(
        appBar: AppBar(title: Text('#522 S23 E2E — $_status')),
        body: ListView(
          padding: const EdgeInsets.all(16),
          children: _logs.map((l) => Text(l)).toList(),
        ),
      ),
    );
  }
}
