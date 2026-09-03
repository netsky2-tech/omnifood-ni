import 'dart:convert';
import '../../../data/database/app_database.dart';
import '../../../data/models/fulfillment/fulfillment_persistence_entities.dart';
import '../../models/sales/invoice.dart';
import '../../ports/printer_port.dart';
import '../../repositories/audit_repository.dart';

enum UncertaintyResolution {
  confirmPrinted,
  retryAsCopy,
  leaveUnresolved,
}

class PrintBatchResult {
  final bool success;
  final String receiptState;
  final String ticketState;

  const PrintBatchResult({
    required this.success,
    required this.receiptState,
    required this.ticketState,
  });
}

class RetentionPurgeResult {
  final int purgedFulfillments;

  const RetentionPurgeResult({required this.purgedFulfillments});
}

class DurablePrintService {
  final AppDatabase _database;
  final PrinterPort _printerPort;
  final AuditRepository _auditRepository;

  DurablePrintService({
    required AppDatabase database,
    required PrinterPort printerPort,
    required AuditRepository auditRepository,
  })  : _database = database,
        _printerPort = printerPort,
        _auditRepository = auditRepository;

  /// Processes fulfillment print jobs sequentially:
  /// Sequence 0 (Receipt) strictly prints and must succeed before Sequence 1 (Ticket).
  Future<PrintBatchResult> processFulfillmentPrintBatch({
    required String tenantId,
    required String fulfillmentId,
  }) async {
    final jobs = await _database.fulfillmentPersistenceDao
        .findPrintJobsByFulfillment(fulfillmentId, tenantId);

    if (jobs.isEmpty) {
      return const PrintBatchResult(
        success: true,
        receiptState: 'NONE',
        ticketState: 'NONE',
      );
    }

    // Sort strictly by sequence ascending
    final sortedJobs = List<PrintJobEntity>.from(jobs)
      ..sort((a, b) => a.sequence.compareTo(b.sequence));

    PrintJobEntity? receiptJob;
    PrintJobEntity? ticketJob;

    for (final j in sortedJobs) {
      if (j.sequence == 0) receiptJob = j;
      if (j.sequence == 1) ticketJob = j;
    }

    String receiptState = receiptJob?.state ?? 'NONE';
    String ticketState = ticketJob?.state ?? 'NONE';

    // 1. Enforce Sequence 0 (Receipt) execution
    if (receiptJob != null && receiptJob.state != 'PRINTED') {
      await _database.fulfillmentPersistenceDao.updatePrintJobState(
        receiptJob.id,
        tenantId,
        'PRINTING',
        receiptJob.retryCount,
      );

      final invoice = _parseInvoiceFromPayload(receiptJob.payload);
      final result = await _printerPort.printInvoice(
        invoice,
        items: const [],
        payments: const [],
      );

      if (result.isSuccess) {
        receiptState = 'PRINTED';
        await _database.fulfillmentPersistenceDao.updatePrintJobState(
          receiptJob.id,
          tenantId,
          'PRINTED',
          receiptJob.retryCount,
        );
      } else if (result.status == PrinterStatus.offline ||
          result.status == PrinterStatus.busy) {
        // Hardware disconnect / response loss / busy -> UNCERTAIN
        receiptState = 'UNCERTAIN';
        await _database.fulfillmentPersistenceDao.updatePrintJobState(
          receiptJob.id,
          tenantId,
          'UNCERTAIN',
          receiptJob.retryCount,
        );
        // Sequence 0 uncertain -> halts execution, sequence 1 is BLOCKED
        return PrintBatchResult(
          success: false,
          receiptState: receiptState,
          ticketState: ticketState,
        );
      } else {
        receiptState = 'FAILED';
        await _database.fulfillmentPersistenceDao.updatePrintJobState(
          receiptJob.id,
          tenantId,
          'FAILED',
          receiptJob.retryCount + 1,
        );
        // Sequence 0 failed -> halts execution, sequence 1 is BLOCKED
        return PrintBatchResult(
          success: false,
          receiptState: receiptState,
          ticketState: ticketState,
        );
      }
    }

    // 2. Execute Sequence 1 (Kitchen Ticket) only if Sequence 0 succeeded
    if (ticketJob != null && ticketJob.state != 'PRINTED') {
      await _database.fulfillmentPersistenceDao.updatePrintJobState(
        ticketJob.id,
        tenantId,
        'PRINTING',
        ticketJob.retryCount,
      );

      final payload = _parseJson(ticketJob.payload);
      final result = await _printerPort.printKitchenOrder(
        ticketId: payload['ticketId']?.toString() ?? 'ticket-1',
        orderTitle: 'Kitchen Order',
        cashierName: payload['cashierName']?.toString() ?? 'Cashier',
        timestamp: DateTime.now(),
        items: const [],
      );

      if (result.isSuccess) {
        ticketState = 'PRINTED';
        await _database.fulfillmentPersistenceDao.updatePrintJobState(
          ticketJob.id,
          tenantId,
          'PRINTED',
          ticketJob.retryCount,
        );
      } else if (result.status == PrinterStatus.offline ||
          result.status == PrinterStatus.busy) {
        ticketState = 'UNCERTAIN';
        await _database.fulfillmentPersistenceDao.updatePrintJobState(
          ticketJob.id,
          tenantId,
          'UNCERTAIN',
          ticketJob.retryCount,
        );
        return PrintBatchResult(
          success: false,
          receiptState: receiptState,
          ticketState: ticketState,
        );
      } else {
        ticketState = 'FAILED';
        await _database.fulfillmentPersistenceDao.updatePrintJobState(
          ticketJob.id,
          tenantId,
          'FAILED',
          ticketJob.retryCount + 1,
        );
        return PrintBatchResult(
          success: false,
          receiptState: receiptState,
          ticketState: ticketState,
        );
      }
    }

    // If both completed successfully, mark fulfillment route_state = PRINTED
    final allPrinted = (receiptJob == null || receiptState == 'PRINTED') &&
        (ticketJob == null || ticketState == 'PRINTED');

    if (allPrinted) {
      await _database.fulfillmentPersistenceDao.updateRouteState(
        fulfillmentId,
        tenantId,
        'PRINTED',
      );
    }

    return PrintBatchResult(
      success: allPrinted,
      receiptState: receiptState,
      ticketState: ticketState,
    );
  }

  /// Resolves hardware uncertainty when print outcome is ambiguous.
  Future<void> resolveUncertainty({
    required String tenantId,
    required String jobId,
    required UncertaintyResolution resolution,
    String? operatorRole,
    String? reason,
  }) async {
    switch (resolution) {
      case UncertaintyResolution.confirmPrinted:
        await _database.fulfillmentPersistenceDao.updatePrintJobState(
          jobId,
          tenantId,
          'PRINTED',
          0,
        );
        break;

      case UncertaintyResolution.leaveUnresolved:
        // Leaves state as UNCERTAIN
        break;

      case UncertaintyResolution.retryAsCopy:
        // 1. Mark original UNCERTAIN_SUPERSEDED
        await _database.fulfillmentPersistenceDao.updatePrintJobState(
          jobId,
          tenantId,
          'UNCERTAIN_SUPERSEDED',
          0,
        );

        // 2. Fetch original job to build marked copy
        final original = await _database.fulfillmentPersistenceDao
            .findPrintJob(jobId, tenantId);
        if (original == null) throw StateError('Print job not found');

        final copyJob = PrintJobEntity(
          id: '${original.id}-copy-${DateTime.now().millisecondsSinceEpoch}',
          tenantId: tenantId,
          fulfillmentId: original.fulfillmentId,
          documentKind: original.documentKind,
          sequence: original.sequence,
          payload: original.payload,
          state: 'PENDING',
          retryCount: 0,
          idempotencyKey:
              '${original.idempotencyKey}:copy:${DateTime.now().millisecondsSinceEpoch}',
        );
        await _database.fulfillmentPersistenceDao.insertPrintJob(copyJob);

        // Execute print on the copy
        if (copyJob.documentKind == 'RECEIPT') {
          final invoice = _parseInvoiceFromPayload(copyJob.payload);
          await _printerPort.printInvoice(
            invoice,
            items: const [],
            payments: const [],
          );
        } else {
          final payload = _parseJson(copyJob.payload);
          await _printerPort.printKitchenOrder(
            ticketId: payload['ticketId']?.toString() ?? 'ticket-1',
            orderTitle: 'Kitchen Order Copy',
            cashierName: payload['cashierName']?.toString() ?? 'Cashier',
            timestamp: DateTime.now(),
            items: const [],
          );
        }

        await _database.fulfillmentPersistenceDao.updatePrintJobState(
          copyJob.id,
          tenantId,
          'PRINTED',
          0,
        );
        break;
    }
  }

  /// Authorized copy reprint requiring MANAGER role and mandatory text reason.
  /// Generates a marked copy job, logs to AuditLog, and strictly NEVER duplicates DGI invoice or Kardex.
  Future<PrintJobEntity> requestReprint({
    required String tenantId,
    required String jobId,
    required String userRole,
    required String userId,
    required String reason,
  }) async {
    final normalizedRole = userRole.trim().toUpperCase();
    if (normalizedRole != 'MANAGER' && normalizedRole != 'ADMIN') {
      throw StateError('Reprint requires manager role');
    }
    if (reason.trim().isEmpty) {
      throw ArgumentError('Reprint reason is mandatory');
    }

    final original = await _database.fulfillmentPersistenceDao
        .findPrintJob(jobId, tenantId);
    if (original == null) throw StateError('Print job not found');

    final copyJob = PrintJobEntity(
      id: '${original.id}-copy-${DateTime.now().millisecondsSinceEpoch}',
      tenantId: tenantId,
      fulfillmentId: original.fulfillmentId,
      documentKind: original.documentKind,
      sequence: original.sequence,
      payload: original.payload,
      state: 'PENDING',
      retryCount: 0,
      idempotencyKey:
          '${original.idempotencyKey}:copy:${DateTime.now().millisecondsSinceEpoch}',
    );
    await _database.fulfillmentPersistenceDao.insertPrintJob(copyJob);

    // Record audit log
    await _auditRepository.log(
      'REPRINT_REQUESTED',
      metadata: jsonEncode({
        'jobId': copyJob.id,
        'userId': userId,
        'role': userRole,
        'reason': reason,
      }),
    );

    return copyJob;
  }

  /// Purges fulfillment retention records older than cutoff,
  /// strictly preserving DGI invoices and Kardex inventory movements.
  Future<RetentionPurgeResult> purgeFulfillmentRetention({
    required String tenantId,
    required DateTime cutoff,
  }) async {
    final fulfillments = await _database.fulfillmentPersistenceDao
        .findAllFulfillments(tenantId);
    int purgedCount = 0;

    for (final f in fulfillments) {
      final invoice = await _database.invoiceDao.getInvoiceById(f.saleId);
      if (invoice != null && invoice.createdAt < cutoff.millisecondsSinceEpoch) {
        await _database.fulfillmentPersistenceDao.deletePrintJobsByFulfillment(
          f.id,
          tenantId,
        );
        await _database.fulfillmentPersistenceDao
            .deleteOutboxEventsByFulfillment(f.id, tenantId);
        await _database.fulfillmentPersistenceDao.deleteFulfillment(
          f.id,
          tenantId,
        );
        purgedCount++;
      }
    }

    return RetentionPurgeResult(purgedFulfillments: purgedCount);
  }

  Map<String, dynamic> _parseJson(String payload) {
    try {
      return jsonDecode(payload) as Map<String, dynamic>;
    } catch (_) {
      return <String, dynamic>{};
    }
  }

  Invoice _parseInvoiceFromPayload(String payload) {
    try {
      final json = jsonDecode(payload) as Map<String, dynamic>;
      return Invoice(
        id: json['invoiceId']?.toString() ?? 'unknown-id',
        number: json['invoiceNumber']?.toString() ?? '001-001-01-00000000',
        createdAt: DateTime.now(),
        userId: json['cashierName']?.toString() ?? 'system',
        subtotal: 0,
        totalTax: 0,
        total: 0,
      );
    } catch (_) {
      return Invoice(
        id: 'unknown-id',
        number: '001-001-01-00000000',
        createdAt: DateTime.now(),
        userId: 'system',
        subtotal: 0,
        totalTax: 0,
        total: 0,
      );
    }
  }
}
