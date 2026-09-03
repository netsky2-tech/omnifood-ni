import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/database/migrations.dart';
import 'package:pos_app/data/models/fulfillment/fulfillment_persistence_entities.dart';
import 'package:pos_app/data/models/inventory/movement_entity.dart';
import 'package:pos_app/data/models/sales/invoice_entity.dart';
import 'package:pos_app/domain/models/config/tax_regime.dart';
import 'package:pos_app/domain/models/sales/invoice.dart';
import 'package:pos_app/domain/models/sales/invoice_item.dart';
import 'package:pos_app/domain/models/sales/payment.dart';
import 'package:pos_app/domain/ports/printer_port.dart';
import 'package:pos_app/domain/repositories/audit_repository.dart';
import 'package:pos_app/domain/services/fulfillment/durable_print_service.dart';

class _FakePrinterPort implements PrinterPort {
  bool failReceipt = false;
  bool uncertainReceipt = false;
  bool failTicket = false;
  final List<String> printedJobs = [];

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
    TaxRegime taxRegime = TaxRegime.regimenGeneral,
    bool isTaxExempt = false,
    int paperWidthMm = 58,
  }) async {
    if (failReceipt) {
      return PrinterResult.failure(PrinterStatus.error, 'Receipt failed');
    }
    if (uncertainReceipt) {
      return PrinterResult.failure(PrinterStatus.offline, 'Printer disconnected');
    }
    printedJobs.add('RECEIPT:${invoice.id}');
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
    if (failTicket) {
      return PrinterResult.failure(PrinterStatus.error, 'Ticket failed');
    }
    printedJobs.add('TICKET:$ticketId');
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

void main() {
  late AppDatabase database;
  late _FakePrinterPort printerPort;
  late _FakeAuditRepository auditRepo;
  late DurablePrintService printService;

  setUp(() async {
    database = await $FloorAppDatabase
        .inMemoryDatabaseBuilder()
        .addCallback(inventoryMovementAppendOnlyCallback)
        .build();

    printerPort = _FakePrinterPort();
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

  group('DurablePrintService - Sequence 0 Before Sequence 1', () {
    test(
      'Receipt (seq 0) must succeed before ticket (seq 1); failure of seq 0 blocks seq 1',
      () async {
        final fulfillment = FulfillmentRecordEntity(
          id: 'f-seq-1',
          tenantId: 'tenant-1',
          saleId: 'sale-seq-1',
          topologySnapshotId: 'snap-1',
          topologyRevision: 1,
          channel: 'PRINT_ONLY',
          routeState: 'ROUTED',
          deliveryState: 'PENDING',
          linesPayload: '[]',
        );
        await database.fulfillmentPersistenceDao.insertFulfillment(fulfillment);

        final receiptJob = PrintJobEntity(
          id: 'job-receipt-1',
          tenantId: 'tenant-1',
          fulfillmentId: 'f-seq-1',
          documentKind: 'RECEIPT',
          sequence: 0,
          payload: '{"invoiceId":"sale-seq-1","number":"001-001"}',
          state: 'PENDING',
          retryCount: 0,
          idempotencyKey: 'key-receipt-1',
        );
        final ticketJob = PrintJobEntity(
          id: 'job-ticket-1',
          tenantId: 'tenant-1',
          fulfillmentId: 'f-seq-1',
          documentKind: 'TICKET',
          sequence: 1,
          payload: '{"ticketId":"sale-seq-1"}',
          state: 'PENDING',
          retryCount: 0,
          idempotencyKey: 'key-ticket-1',
        );
        await database.fulfillmentPersistenceDao.insertPrintJob(receiptJob);
        await database.fulfillmentPersistenceDao.insertPrintJob(ticketJob);

        // Inject failure on receipt
        printerPort.failReceipt = true;

        final batchResult = await printService.processFulfillmentPrintBatch(
          tenantId: 'tenant-1',
          fulfillmentId: 'f-seq-1',
        );

        expect(batchResult.success, isFalse);
        expect(batchResult.receiptState, 'FAILED');
        expect(batchResult.ticketState, 'PENDING'); // BLOCKED by seq 0!
        expect(printerPort.printedJobs, isEmpty);

        // Now recover receipt and retry
        printerPort.failReceipt = false;
        final retryResult = await printService.processFulfillmentPrintBatch(
          tenantId: 'tenant-1',
          fulfillmentId: 'f-seq-1',
        );

        expect(retryResult.success, isTrue);
        expect(retryResult.receiptState, 'PRINTED');
        expect(retryResult.ticketState, 'PRINTED');
        expect(printerPort.printedJobs, [
          'RECEIPT:sale-seq-1',
          'TICKET:sale-seq-1',
        ]);
      },
    );
  });

  group('DurablePrintService - Uncertainty Resolution', () {
    test(
      'Uncertain print prompts resolution: confirmPrinted, retryAsCopy, or leaveUnresolved',
      () async {
        final fulfillment = FulfillmentRecordEntity(
          id: 'f-unc-1',
          tenantId: 'tenant-1',
          saleId: 'sale-unc-1',
          topologySnapshotId: 'snap-1',
          topologyRevision: 1,
          channel: 'PRINT_ONLY',
          routeState: 'ROUTED',
          deliveryState: 'PENDING',
          linesPayload: '[]',
        );
        await database.fulfillmentPersistenceDao.insertFulfillment(fulfillment);

        final receiptJob = PrintJobEntity(
          id: 'job-unc-receipt',
          tenantId: 'tenant-1',
          fulfillmentId: 'f-unc-1',
          documentKind: 'RECEIPT',
          sequence: 0,
          payload: '{"invoiceId":"sale-unc-1"}',
          state: 'PENDING',
          retryCount: 0,
          idempotencyKey: 'key-unc-receipt',
        );
        await database.fulfillmentPersistenceDao.insertPrintJob(receiptJob);

        // Inject response loss -> UNCERTAIN
        printerPort.uncertainReceipt = true;

        final result = await printService.processFulfillmentPrintBatch(
          tenantId: 'tenant-1',
          fulfillmentId: 'f-unc-1',
        );

        expect(result.receiptState, 'UNCERTAIN');

        // Resolution 1: leaveUnresolved
        await printService.resolveUncertainty(
          tenantId: 'tenant-1',
          jobId: 'job-unc-receipt',
          resolution: UncertaintyResolution.leaveUnresolved,
        );
        var job = (await database.fulfillmentPersistenceDao
            .findPrintJobsByFulfillment('f-unc-1', 'tenant-1'))
            .single;
        expect(job.state, 'UNCERTAIN');

        // Resolution 2: retryAsCopy creates a marked copy job
        printerPort.uncertainReceipt = false;
        await printService.resolveUncertainty(
          tenantId: 'tenant-1',
          jobId: 'job-unc-receipt',
          resolution: UncertaintyResolution.retryAsCopy,
          operatorRole: 'MANAGER',
          reason: 'Papel atascado en corte',
        );

        final allJobs = await database.fulfillmentPersistenceDao
            .findPrintJobsByFulfillment('f-unc-1', 'tenant-1');
        expect(allJobs, hasLength(2));
        expect(allJobs.first.state, 'UNCERTAIN_SUPERSEDED');
        expect(allJobs.last.state, 'PRINTED');
        expect(allJobs.last.idempotencyKey, contains(':copy:'));
      },
    );
  });

  group('DurablePrintService - Authorized Copy Reprint Audit', () {
    test(
      'Reprint requires MANAGER role and mandatory reason, marks copyId, logs audit, and creates ZERO new invoices or kardex',
      () async {
        final fulfillment = FulfillmentRecordEntity(
          id: 'f-rep-1',
          tenantId: 'tenant-1',
          saleId: 'sale-rep-1',
          topologySnapshotId: 'snap-1',
          topologyRevision: 1,
          channel: 'PRINT_ONLY',
          routeState: 'PRINTED',
          deliveryState: 'PENDING',
          linesPayload: '[]',
        );
        await database.fulfillmentPersistenceDao.insertFulfillment(fulfillment);

        final receiptJob = PrintJobEntity(
          id: 'job-rep-receipt',
          tenantId: 'tenant-1',
          fulfillmentId: 'f-rep-1',
          documentKind: 'RECEIPT',
          sequence: 0,
          payload: '{"invoiceId":"sale-rep-1"}',
          state: 'PRINTED',
          retryCount: 0,
          idempotencyKey: 'key-rep-receipt',
        );
        await database.fulfillmentPersistenceDao.insertPrintJob(receiptJob);

        // 1. Unauthorized reprint (CASHIER) throws error
        expect(
          () => printService.requestReprint(
            tenantId: 'tenant-1',
            jobId: 'job-rep-receipt',
            userRole: 'CASHIER',
            userId: 'cashier-1',
            reason: 'Cliente lo pidió',
          ),
          throwsA(isA<StateError>()),
        );

        // 2. Empty reason throws error
        expect(
          () => printService.requestReprint(
            tenantId: 'tenant-1',
            jobId: 'job-rep-receipt',
            userRole: 'MANAGER',
            userId: 'mgr-1',
            reason: '   ',
          ),
          throwsA(isA<ArgumentError>()),
        );

        // 3. Authorized reprint by MANAGER with valid reason
        final copyJob = await printService.requestReprint(
          tenantId: 'tenant-1',
          jobId: 'job-rep-receipt',
          userRole: 'MANAGER',
          userId: 'mgr-1',
          reason: 'Cliente extravió ticket original',
        );

        expect(copyJob.documentKind, 'RECEIPT');
        expect(copyJob.idempotencyKey, contains(':copy:'));
        expect(auditRepo.recordedLogs, hasLength(1));
        expect(auditRepo.recordedLogs.single['action'], 'REPRINT_REQUESTED');
        expect(
          auditRepo.recordedLogs.single['metadata'],
          contains('Cliente extravió ticket original'),
        );

        // Invariant: ZERO duplicate invoices, ZERO Kardex movements!
        final invoices = await database.invoiceDao.getAllInvoices();
        expect(invoices, isEmpty);
        final movements = await database.movementDao.findAllMovements();
        expect(movements, isEmpty);
      },
    );
  });

  group('DurablePrintService - 90-Day Retention Purge', () {
    test(
      'Purges fulfillment records and print jobs older than 90 days, strictly preserving invoices and Kardex',
      () async {
        final now = DateTime.now();
        final ninetyOneDaysAgo = now.subtract(const Duration(days: 91));

        // 1. Seed expired fulfillment record and print job
        final expiredFulfillment = FulfillmentRecordEntity(
          id: 'f-expired-1',
          tenantId: 'tenant-1',
          saleId: 'sale-expired-1',
          topologySnapshotId: 'snap-1',
          topologyRevision: 1,
          channel: 'PRINT_ONLY',
          routeState: 'PRINTED',
          deliveryState: 'DELIVERED',
          linesPayload: '[]',
        );
        await database.fulfillmentPersistenceDao
            .insertFulfillment(expiredFulfillment);

        final expiredJob = PrintJobEntity(
          id: 'job-expired-1',
          tenantId: 'tenant-1',
          fulfillmentId: 'f-expired-1',
          documentKind: 'RECEIPT',
          sequence: 0,
          payload: '{}',
          state: 'PRINTED',
          retryCount: 0,
          idempotencyKey: 'key-expired-1',
        );
        await database.fulfillmentPersistenceDao.insertPrintJob(expiredJob);

        // 2. Seed invoice and Kardex inventory movement (MUST BE PRESERVED!)
        await database.invoiceDao.insertInvoice(
          InvoiceEntity(
            id: 'sale-expired-1',
            number: '001-001-01-00000001',
            createdAt: ninetyOneDaysAgo.millisecondsSinceEpoch,
            userId: 'c-1',
            subtotal: 100,
            totalTax: 15,
            total: 115,
          ),
        );
        await database.movementDao.insertMovement(
          MovementEntity(
            id: 'mov-1',
            insumoId: 'ins-1',
            quantity: 10,
            previousStock: 20,
            newStock: 10,
            type: 'OUT',
            timestamp: ninetyOneDaysAgo.toIso8601String(),
          ),
        );

        // 3. Execute 90-day purge
        final purgeResult = await printService.purgeFulfillmentRetention(
          tenantId: 'tenant-1',
          cutoff: now.subtract(const Duration(days: 90)),
        );

        expect(purgeResult.purgedFulfillments, 1);

        // Fulfillment is purged
        final remainingFulfillment = await database.fulfillmentPersistenceDao
            .findFulfillment('f-expired-1', 'tenant-1');
        expect(remainingFulfillment, isNull);

        // INVARIANT DGI & AUDIT: Invoices and Kardex are STRICTLY PRESERVED!
        final remainingInvoices = await database.invoiceDao.getAllInvoices();
        expect(remainingInvoices, hasLength(1));
        expect(remainingInvoices.single.id, 'sale-expired-1');

        final remainingMovements = await database.movementDao.findAllMovements();
        expect(remainingMovements, hasLength(1));
        expect(remainingMovements.single.id, 'mov-1');
      },
    );
  });
}
