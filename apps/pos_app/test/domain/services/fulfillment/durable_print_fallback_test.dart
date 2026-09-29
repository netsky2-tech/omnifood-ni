import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/database/migrations.dart';
import 'package:pos_app/data/models/fulfillment/fulfillment_persistence_entities.dart';
import 'package:pos_app/domain/models/config/tax_regime.dart';
import 'package:pos_app/domain/models/sales/invoice.dart';
import 'package:pos_app/domain/models/sales/invoice_item.dart';
import 'package:pos_app/domain/models/sales/payment.dart';
import 'package:pos_app/domain/ports/printer_port.dart';
import 'package:pos_app/domain/repositories/audit_repository.dart';
import 'package:pos_app/domain/services/fulfillment/durable_print_service.dart';
import 'package:pos_app/domain/services/sales/post_paid_feedback_service.dart';

/// H4 remediation: a corrupt print payload must fail safely and must never
/// be printed as a fabricated fiscal document with $0 totals.
void main() {
  late AppDatabase database;
  late _RecordingPrinterPort printerPort;
  late _FakeAuditRepository auditRepo;
  late DurablePrintService printService;

  setUp(() async {
    database = await $FloorAppDatabase
        .inMemoryDatabaseBuilder()
        .addCallback(inventoryMovementAppendOnlyCallback)
        .build();

    printerPort = _RecordingPrinterPort();
    auditRepo = _FakeAuditRepository();
    printService = DurablePrintService(
      database: database,
      printerPort: printerPort,
      auditRepository: auditRepo,
    );
  });

  tearDown(() async {
    await database.close();
  });

  Future<void> seedFulfillmentWithReceiptJob({
    required String fulfillmentId,
    required String jobId,
    required String payload,
    String ticketPayload = '{"ticketId":"ticket-1"}',
  }) async {
    await database.fulfillmentPersistenceDao.insertFulfillment(
      FulfillmentRecordEntity(
        id: fulfillmentId,
        tenantId: 'tenant-1',
        saleId: 'sale-$fulfillmentId',
        topologySnapshotId: 'snap-1',
        topologyRevision: 1,
        channel: 'PRINT_ONLY',
        routeState: 'ROUTED',
        deliveryState: 'PENDING',
        linesPayload: '[]',
      ),
    );
    await database.fulfillmentPersistenceDao.insertPrintJob(
      PrintJobEntity(
        id: jobId,
        tenantId: 'tenant-1',
        fulfillmentId: fulfillmentId,
        documentKind: 'RECEIPT',
        sequence: 0,
        payload: payload,
        state: 'PENDING',
        retryCount: 0,
        idempotencyKey: 'key-$jobId',
      ),
    );
    await database.fulfillmentPersistenceDao.insertPrintJob(
      PrintJobEntity(
        id: '$jobId-ticket',
        tenantId: 'tenant-1',
        fulfillmentId: fulfillmentId,
        documentKind: 'TICKET',
        sequence: 1,
        payload: ticketPayload,
        state: 'PENDING',
        retryCount: 0,
        idempotencyKey: 'key-$jobId-ticket',
      ),
    );
  }

  group('DurablePrintService - H4 corrupt payload safety', () {
    test('valid payload still prints the receipt and marks job PRINTED',
        () async {
      await seedFulfillmentWithReceiptJob(
        fulfillmentId: 'f-valid-1',
        jobId: 'job-valid-1',
        payload:
            '{"invoiceId":"sale-valid-1","invoiceNumber":"001-001-01-00000001"}',
      );

      final result = await printService.processFulfillmentPrintBatch(
        tenantId: 'tenant-1',
        fulfillmentId: 'f-valid-1',
        taxRegime: TaxRegime.regimenGeneral,
      );

      expect(result.success, isTrue);
      expect(result.receiptState, 'PRINTED');
      expect(result.ticketState, 'PRINTED');
      expect(printerPort.printedReceipts, hasLength(1));
      expect(printerPort.printedReceipts.single, startsWith('sale-valid-1|'));
      expect(auditRepo.recordedLogs, isEmpty);
    });

    test(
        'corrupt JSON payload fails safely: no invoice printed, job FAILED, ticket blocked',
        () async {
      await seedFulfillmentWithReceiptJob(
        fulfillmentId: 'f-corrupt-1',
        jobId: 'job-corrupt-1',
        payload: '{not-valid-json,,,',
      );

      final result = await printService.processFulfillmentPrintBatch(
        tenantId: 'tenant-1',
        fulfillmentId: 'f-corrupt-1',
        taxRegime: TaxRegime.regimenGeneral,
      );

      expect(result.success, isFalse);
      expect(result.receiptState, 'FAILED');
      // Sequence 1 is blocked by the failed Sequence 0.
      expect(result.ticketState, 'PENDING');

      // No fiscal document was fabricated or printed.
      expect(printerPort.printedReceipts, isEmpty);
      expect(printerPort.printedTickets, isEmpty);

      final job = await database.fulfillmentPersistenceDao.findPrintJob(
        'job-corrupt-1',
        'tenant-1',
      );
      expect(job!.state, 'FAILED');
      expect(job.retryCount, 1);

      final fulfillment = await database.fulfillmentPersistenceDao
          .findFulfillment('f-corrupt-1', 'tenant-1');
      expect(fulfillment!.routeState, 'ROUTED');
    });

    test(
        'payload without invoice identity fails safely instead of fabricating an invoice',
        () async {
      await seedFulfillmentWithReceiptJob(
        fulfillmentId: 'f-noid-1',
        jobId: 'job-noid-1',
        payload: '{"cashierName":"ana"}',
      );

      final result = await printService.processFulfillmentPrintBatch(
        tenantId: 'tenant-1',
        fulfillmentId: 'f-noid-1',
        taxRegime: TaxRegime.regimenGeneral,
      );

      expect(result.success, isFalse);
      expect(result.receiptState, 'FAILED');
      expect(printerPort.printedReceipts, isEmpty);
    });

    test(
        'legacy producer payload without invoiceId is accepted and printed',
        () async {
      // Producer contract (FulfillmentExecutionService): the receipt payload
      // carries type/invoiceNumber/cashierName/timestamp but no invoiceId.
      await seedFulfillmentWithReceiptJob(
        fulfillmentId: 'f-legacy-1',
        jobId: 'job-legacy-1',
        payload:
            '{"type":"RECEIPT","invoiceNumber":"001-001-01-00000042",'
            '"cashierName":"ana","timestamp":"2026-02-05T10:00:00.000"}',
      );

      final result = await printService.processFulfillmentPrintBatch(
        tenantId: 'tenant-1',
        fulfillmentId: 'f-legacy-1',
        taxRegime: TaxRegime.regimenGeneral,
      );

      expect(result.success, isTrue);
      expect(result.receiptState, 'PRINTED');
      expect(result.ticketState, 'PRINTED');
      expect(printerPort.printedReceipts, hasLength(1));
      // No identity field is fabricated: with invoiceId absent, the real
      // invoiceNumber doubles as the local identifier.
      expect(
        printerPort.printedReceipts.single,
        startsWith('001-001-01-00000042|001-001-01-00000042|'),
      );
      expect(auditRepo.recordedLogs, isEmpty);
    });

    test(
        'payload with only blank identity fields fails safely instead of fabricating an invoice',
        () async {
      await seedFulfillmentWithReceiptJob(
        fulfillmentId: 'f-blank-1',
        jobId: 'job-blank-1',
        payload: '{"invoiceNumber":"","invoiceId":"","cashierName":"ana"}',
      );

      final result = await printService.processFulfillmentPrintBatch(
        tenantId: 'tenant-1',
        fulfillmentId: 'f-blank-1',
        taxRegime: TaxRegime.regimenGeneral,
      );

      expect(result.success, isFalse);
      expect(result.receiptState, 'FAILED');
      expect(printerPort.printedReceipts, isEmpty);
    });

    test('corrupt payload failure is observable through the audit log',
        () async {
      await seedFulfillmentWithReceiptJob(
        fulfillmentId: 'f-obs-1',
        jobId: 'job-obs-1',
        payload: '<<<corrupted-by-partial-write>>>',
      );

      await printService.processFulfillmentPrintBatch(
        tenantId: 'tenant-1',
        fulfillmentId: 'f-obs-1',
        taxRegime: TaxRegime.regimenGeneral,
      );

      expect(auditRepo.recordedLogs, hasLength(1));
      expect(auditRepo.recordedLogs.single['action'], 'PRINT_PAYLOAD_CORRUPT');
      final metadata = auditRepo.recordedLogs.single['metadata']!;
      expect(metadata, contains('job-obs-1'));
      expect(metadata, contains('RECEIPT'));
      expect(metadata, contains('f-obs-1'));
    });

    test(
        'retryAsCopy with corrupt payload does not print and marks the copy FAILED',
        () async {
      await seedFulfillmentWithReceiptJob(
        fulfillmentId: 'f-copy-1',
        jobId: 'job-copy-1',
        payload: 'not-json-at-all',
      );

      // Force the original job into UNCERTAIN so it can be resolved.
      await database.fulfillmentPersistenceDao.updatePrintJobState(
        'job-copy-1',
        'tenant-1',
        'UNCERTAIN',
        0,
      );

      await printService.resolveUncertainty(
        tenantId: 'tenant-1',
        jobId: 'job-copy-1',
        resolution: UncertaintyResolution.retryAsCopy,
        operatorRole: 'MANAGER',
        reason: 'papel atascado',
        taxRegime: TaxRegime.regimenGeneral,
      );

      // No fiscal document was printed from the corrupt payload.
      expect(printerPort.printedReceipts, isEmpty);

      final jobs = await database.fulfillmentPersistenceDao
          .findPrintJobsByFulfillment('f-copy-1', 'tenant-1');
      expect(jobs, hasLength(3)); // original + ticket + marked copy
      expect(
        jobs.singleWhere((j) => j.id == 'job-copy-1').state,
        'UNCERTAIN_SUPERSEDED',
      );
      final copyJob = jobs.singleWhere((j) => j.id.startsWith('job-copy-1-copy'));
      expect(copyJob.state, 'FAILED');

      final corruptLogs = auditRepo.recordedLogs
          .where((l) => l['action'] == 'PRINT_PAYLOAD_CORRUPT');
      expect(corruptLogs, isNotEmpty);
      expect(corruptLogs.single['metadata'], contains(copyJob.id));
    });
  });
}

class _RecordingPrinterPort implements PrinterPort {
  final List<String> printedReceipts = [];
  final List<String> printedTickets = [];

  @override
  Future<PrinterStatus> checkStatus() async => PrinterStatus.ready;

  @override
  Future<PrinterResult> printInvoice(
    Invoice invoice, {
    required List<InvoiceItem> items,
    required List<Payment> payments,
    String? businessName,
    String? legalName,
    String? ruc,
    String? address,
    String? phone,
    String? cashierName,
    List<int>? logoRasterBytes,
    required TaxRegime taxRegime,
    bool isTaxExempt = false,
    int paperWidthMm = 58,
    PostPaidFeedback? loyaltyFeedback,
    String? fiscalAuthorizationNumber,
    bool isReprint = false,
    DateTime? reprintAt,
  }) async {
    printedReceipts.add('${invoice.id}|${invoice.number}|${invoice.total}');
    return PrinterResult.success();
  }

  @override
  Future<PrinterResult> printKitchenOrder({
    required String ticketId,
    required String orderTitle,
    required String cashierName,
    required DateTime timestamp,
    required List<InvoiceItem> items,
    String? notes,
    int? buzzerNumber,
    String? tableName,
  }) async {
    printedTickets.add(ticketId);
    return PrinterResult.success();
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => throw UnimplementedError();
}

class _FakeAuditRepository implements AuditRepository {
  final List<Map<String, String?>> recordedLogs = [];

  @override
  String get deviceId => 'pos-1';

  @override
  Future<void> log(String action, {String? metadata}) async {
    recordedLogs.add({'action': action, 'metadata': metadata});
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => throw UnimplementedError();
}
