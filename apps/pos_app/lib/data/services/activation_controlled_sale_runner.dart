import 'package:pos_app/domain/models/config/tax_regime.dart';
import 'dart:convert';
import 'package:crypto/crypto.dart';
import 'package:uuid/uuid.dart';

import '../../domain/models/sales/invoice.dart';
import '../../domain/models/sales/invoice_item.dart';
import '../../domain/models/sales/payment.dart';
import '../../domain/ports/printer_port.dart';
import '../../domain/repositories/sales/sales_repository.dart';
import '../database/app_database.dart';
import '../mappers/sales_mapper.dart';
import '../models/activation/activation_check_result_local_entity.dart';
import '../models/activation/activation_outbox_envelope_entity.dart';
import '../models/activation/first_successful_sale_claim_entity.dart';
import '../models/sales/invoice_entity.dart';
import 'activation_clock_manager.dart';
import '../../domain/usecases/inventory/checkout_inventory_preparation_service.dart';

class ControlledSaleParams {
  final String tenantId;
  final String attemptId;
  final String cashierUserId;
  final double? customAmount;
  final String paymentMethod;
  final String currency;

  const ControlledSaleParams({
    required this.tenantId,
    required this.attemptId,
    required this.cashierUserId,
    this.customAmount,
    this.paymentMethod = 'cash',
    this.currency = 'NIO',
  });
}

class ControlledSaleResult {
  final bool isSuccess;
  final String? verificationTicketId;
  final FirstSuccessfulSaleClaimEntity? firstSaleClaim;
  final String attemptStatus;
  final Map<String, ActivationCheckResultLocalEntity> checks;
  final List<ActivationOutboxEnvelopeEntity> outboxEnvelopes;
  final List<String> errors;

  const ControlledSaleResult({
    required this.isSuccess,
    this.verificationTicketId,
    this.firstSaleClaim,
    required this.attemptStatus,
    this.checks = const {},
    this.outboxEnvelopes = const [],
    this.errors = const [],
  });
}

class ActivationControlledSaleRunner {
  final AppDatabase _database;
  final SalesRepository _salesRepository;
  final PrinterPort _printerPort;
  final ActivationClockManager? _clockManager;

  ActivationControlledSaleRunner({
    required AppDatabase database,
    required SalesRepository salesRepository,
    required PrinterPort printerPort,
    ActivationClockManager? clockManager,
  })  : _database = database,
        _salesRepository = salesRepository,
        _printerPort = printerPort,
        _clockManager = clockManager;

  Future<ControlledSaleResult> executeControlledOfflineSale(
    ControlledSaleParams params,
  ) async {
    final now = DateTime.now().toUtc();
    final nowIso = now.toIso8601String();
    final trimmedTenantId = params.tenantId.trim();
    final trimmedAttemptId = params.attemptId.trim();
    final trimmedCashierId = params.cashierUserId.trim();

    // 1. Fetch Attempt & Assert Pre-Condition: RUNNING or already LOCAL_ACTIVATION_EVIDENCE_COMPLETE
    final attempt = await _database.activationAttemptLocalDao.getAttemptById(trimmedAttemptId);
    if (attempt == null) {
      return ControlledSaleResult(
        isSuccess: false,
        attemptStatus: 'NOT_FOUND',
        errors: ["ActivationAttemptLocal '$trimmedAttemptId' not found in SQLite"],
      );
    }

    // Initialize clock context and anchor if present in attempt
    final clock = _clockManager ?? ActivationClockManager.instance;
    if (attempt.serverTimeAnchorAt != null && attempt.anchorMonotonicTicks != null) {
      clock.setAnchor(
        serverTimeAnchorAt: DateTime.parse(attempt.serverTimeAnchorAt!),
        anchorMonotonicTicks: attempt.anchorMonotonicTicks!,
        serverTimeAnchorId: 'anchor-${attempt.attemptId}',
        bootSessionId: attempt.bootSessionId ?? clock.bootSessionId,
      );
    }
    final clockRes = clock.resolveClockContext(
      deviceWallClock: now,
      currentBootSessionId: attempt.bootSessionId,
    );

    if (attempt.tenantId.trim() != trimmedTenantId) {
      return ControlledSaleResult(
        isSuccess: false,
        attemptStatus: attempt.localStatus,
        errors: [
          "TENANT_MISMATCH: Attempt tenant '${attempt.tenantId}' does not match requested '$trimmedTenantId'",
        ],
      );
    }

    if (attempt.localStatus != 'RUNNING' &&
        attempt.localStatus != 'LOCAL_ACTIVATION_EVIDENCE_COMPLETE') {
      return ControlledSaleResult(
        isSuccess: false,
        attemptStatus: attempt.localStatus,
        errors: [
          "ATTEMPT_NOT_IN_RUNNING: Attempt is in status '${attempt.localStatus}', must be in 'RUNNING' to execute controlled offline sale",
        ],
      );
    }

    // 2. Fetch Pinned Verification Product
    final product = await _database.productDao.findProductByIdAndTenant(
      attempt.verificationProductId,
      trimmedTenantId,
    ) ?? await _database.productDao.findProductById(attempt.verificationProductId);

    if (product == null) {
      return ControlledSaleResult(
        isSuccess: false,
        attemptStatus: attempt.localStatus,
        errors: [
          "VERIFICATION_PRODUCT_NOT_FOUND: Product '${attempt.verificationProductId}' not found in local catalog",
        ],
      );
    }

    // 3. Idempotency Key & Existing Ticket Check
    final saleIdempotencyKey = 'onboarding:activation-sale:$trimmedTenantId:$trimmedAttemptId';
    InvoiceEntity? existingInvoice;

    if (attempt.verificationTicketId != null) {
      existingInvoice = await _database.invoiceDao.getInvoiceById(attempt.verificationTicketId!);
    }
    existingInvoice ??= await _database.invoiceDao.getInvoiceByIdempotencyKey(saleIdempotencyKey);

    final expectedAmount = params.customAmount ?? product.sellPrice;

    if (existingInvoice != null) {
      // Conflict detection for idempotent retry: same key with different amount is INTEGRITY_CONFLICT
      if (params.customAmount != null &&
          (existingInvoice.total - expectedAmount).abs() > 0.01) {
        return ControlledSaleResult(
          isSuccess: false,
          verificationTicketId: existingInvoice.id,
          attemptStatus: attempt.localStatus,
          errors: [
            "INTEGRITY_CONFLICT: Existing verification ticket '${existingInvoice.id}' has total ${existingInvoice.total}, conflicting with requested $expectedAmount",
          ],
        );
      }
    }

    String ticketId;
    String ticketNumber;
    double ticketTotal;
    String ticketSyncStatus;
    bool isNewSale = false;

    if (existingInvoice != null) {
      ticketId = existingInvoice.id;
      ticketNumber = existingInvoice.number;
      ticketTotal = existingInvoice.total;
      ticketSyncStatus = existingInvoice.syncStatus;
    } else {
      // 4. Production Checkout Path Execution (Real Sales Save)
      ticketId = const Uuid().v4();
      final total = expectedAmount;

      final invoice = Invoice(
        id: ticketId,
        number: '',
        subtotal: total,
        totalTax: 0.0,
        total: total,
        createdAt: now,
        userId: trimmedCashierId,
        syncStatus: SyncStatus.pending,
        paymentStatus: PaymentStatus.paid,
        idempotencyKey: saleIdempotencyKey,
        terminalId: attempt.candidateTerminalId,
      );

      final item = InvoiceItem(
        id: const Uuid().v4(),
        invoiceId: ticketId,
        productId: product.id,
        productName: product.name,
        quantity: 1,
        unitPrice: total,
        originalTaxRate: 0.0,
        appliedTaxRate: 0.0,
        taxAmount: 0.0,
        total: total,
      );

      final payment = Payment(
        id: const Uuid().v4(),
        invoiceId: ticketId,
        method: PaymentMethod.cash,
        amount: total,
        currency: params.currency,
        exchangeRate: 1.0,
        amountNio: total,
        changeGiven: 0.0,
        createdAt: now,
      );

      final prepService = CheckoutInventoryPreparationService(_database);
      final prepResult = await prepService.prepare(
        invoice: invoice,
        items: [item],
        offlineUserId: trimmedCashierId,
        tenantId: trimmedTenantId,
        terminalId: attempt.candidateTerminalId,
      );

      await _salesRepository.saveSale(
        invoice: prepResult.invoice,
        items: prepResult.items,
        payments: [payment],
      );

      final persistedInvoice = await _database.invoiceDao.getInvoiceById(ticketId);
      if (persistedInvoice == null || persistedInvoice.paymentStatus != 'paid') {
        throw StateError(
          "Controlled offline sale failed to persist real PAID ticket '$ticketId' in SQLite",
        );
      }

      ticketNumber = persistedInvoice.number;
      ticketTotal = persistedInvoice.total;
      ticketSyncStatus = persistedInvoice.syncStatus;
      isNewSale = true;
    }

    final persistedInvoice = await _database.invoiceDao.getInvoiceById(ticketId);
    if (persistedInvoice == null ||
        persistedInvoice.paymentStatus != 'paid' ||
        persistedInvoice.terminalId?.trim() != attempt.candidateTerminalId.trim() ||
        persistedInvoice.sourceSequence == null ||
        persistedInvoice.idempotencyKey?.trim().isEmpty != false) {
      throw StateError(
        "Controlled offline sale '$ticketId' is missing authoritative terminal or sync provenance.",
      );
    }
    ticketNumber = persistedInvoice.number;
    ticketTotal = persistedInvoice.total;
    ticketSyncStatus = persistedInvoice.syncStatus;
    final persistedItems = await _database.invoiceItemDao.getItemsByInvoiceId(ticketId);
    final persistedPayments = await _database.paymentDao.getPaymentsByInvoiceId(ticketId);
    final persistedInvoicePayload = SalesMapper.toSyncJson(
      SalesMapper.toInvoiceDomain(persistedInvoice),
      persistedItems.map(SalesMapper.toItemDomain).toList(growable: false),
      persistedPayments.map(SalesMapper.toPaymentDomain).toList(growable: false),
    );
    final verificationSalePayload = <String, dynamic>{
      'idempotencyKey': persistedInvoice.idempotencyKey,
      'sourceDeviceId': persistedInvoice.terminalId,
      'sourceSequence': persistedInvoice.sourceSequence,
      'flowType': 'sales',
      'documentType': 'SALE',
      'invoiceId': persistedInvoice.id,
      'terminalId': persistedInvoice.terminalId,
      'invoice': persistedInvoicePayload,
      'movements': <dynamic>[],
    };

    // 5. Real Receipt / Printing Path Traversal
    final printerStatus = await _printerPort.checkStatus();
    final printerIsReady = printerStatus == PrinterStatus.ready;
    bool receiptPrintedSuccess = false;

    if (printerIsReady) {
      final receiptInvoice = Invoice(
        id: ticketId,
        number: ticketNumber,
        subtotal: ticketTotal,
        totalTax: 0.0,
        total: ticketTotal,
        createdAt: now,
        userId: trimmedCashierId,
        syncStatus: SyncStatus.pending,
        paymentStatus: PaymentStatus.paid,
      );
      final receiptItem = InvoiceItem(
        id: const Uuid().v4(),
        invoiceId: ticketId,
        productId: product.id,
        productName: product.name,
        quantity: 1,
        unitPrice: ticketTotal,
        originalTaxRate: 0.0,
        appliedTaxRate: 0.0,
        taxAmount: 0.0,
        total: ticketTotal,
      );
      final receiptPayment = Payment(
        id: const Uuid().v4(),
        invoiceId: ticketId,
        method: PaymentMethod.cash,
        amount: ticketTotal,
        currency: params.currency,
        exchangeRate: 1.0,
        amountNio: ticketTotal,
        changeGiven: 0.0,
        createdAt: now,
      );

      final printResult = await _printerPort.printInvoice(
        receiptInvoice,
        items: [receiptItem],
        payments: [receiptPayment],
        cashierName: trimmedCashierId,
            taxRegime: TaxRegime.regimenGeneral,
          );
      receiptPrintedSuccess = printResult.isSuccess;
    }

    final checks = <String, ActivationCheckResultLocalEntity>{};
    final errors = <String>[];

    // Check 1: OFFLINE_SALE_PAID
    final salePaidCheck = ActivationCheckResultLocalEntity(
      id: const Uuid().v4(),
      tenantId: trimmedTenantId,
      activationAttemptId: trimmedAttemptId,
      checkCode: 'OFFLINE_SALE_PAID',
      status: 'PASS',
      evidenceType: 'OFFLINE_INVOICE_PAID_PROOF',
      evidenceRef: ticketId,
      occurredAt: nowIso,
      recordedAt: nowIso,
      detailsSanitizedJson: jsonEncode({
        'invoiceId': ticketId,
        'invoiceNumber': ticketNumber,
        'total': ticketTotal,
        'paymentStatus': 'paid',
        'isNewSale': isNewSale,
        'idempotencyKey': saleIdempotencyKey,
      }),
    );
    checks['OFFLINE_SALE_PAID'] = salePaidCheck;

    // Check 2: SALE_RECEIPT_PATH
    final receiptCheck = ActivationCheckResultLocalEntity(
      id: const Uuid().v4(),
      tenantId: trimmedTenantId,
      activationAttemptId: trimmedAttemptId,
      checkCode: 'SALE_RECEIPT_PATH',
      status: receiptPrintedSuccess ? 'PASS' : 'FAIL',
      evidenceType: 'RECEIPT_PRINTER_OUTPUT',
      evidenceRef: receiptPrintedSuccess ? 'RECEIPT_PRINTED_OK' : 'RECEIPT_PRINT_FAILED',
      occurredAt: nowIso,
      recordedAt: nowIso,
      detailsSanitizedJson: jsonEncode({
        'printerStatus': printerStatus.name,
        'receiptSuccess': receiptPrintedSuccess,
        'ticketId': ticketId,
      }),
    );
    checks['SALE_RECEIPT_PATH'] = receiptCheck;
    if (!receiptPrintedSuccess) {
      errors.add(
        'SALE_RECEIPT_PATH_FAILED: Printing receipt failed with printer status ${printerStatus.name}',
      );
    }

    // 6. Outbox Envelopes Consolidate (ONB1.8D)
    final outboxEnvelopes = <ActivationOutboxEnvelopeEntity>[];

    void addEnvelope({
      required String eventType,
      required String idempotencyKey,
      required Map<String, dynamic> payload,
    }) {
      final payloadJson = jsonEncode(payload);
      final payloadHash = sha256.convert(utf8.encode(payloadJson)).toString();
      outboxEnvelopes.add(
        ActivationOutboxEnvelopeEntity(
          id: const Uuid().v4(),
          tenantId: trimmedTenantId,
          activationAttemptId: trimmedAttemptId,
          eventType: eventType,
          idempotencyKey: idempotencyKey,
          payloadJson: payloadJson,
          payloadHash: payloadHash,
          syncStatus: 'PENDING',
          createdAt: nowIso,
        ),
      );
    }

    addEnvelope(
      eventType: 'ACTIVATION_CHECK',
      idempotencyKey: 'activation:check:$trimmedTenantId:$trimmedAttemptId:OFFLINE_SALE_PAID',
      payload: {
        'checkCode': 'OFFLINE_SALE_PAID',
        'status': 'PASS',
        'evidenceRef': ticketId,
        'occurredAt': nowIso,
      },
    );

    addEnvelope(
      eventType: 'ACTIVATION_CHECK',
      idempotencyKey: 'activation:check:$trimmedTenantId:$trimmedAttemptId:SALE_RECEIPT_PATH',
      payload: {
        'checkCode': 'SALE_RECEIPT_PATH',
        'status': receiptPrintedSuccess ? 'PASS' : 'FAIL',
        'evidenceRef': receiptPrintedSuccess ? 'RECEIPT_PRINTED_OK' : 'RECEIPT_PRINT_FAILED',
        'occurredAt': nowIso,
      },
    );

    addEnvelope(
      eventType: 'VERIFICATION_SALE',
      idempotencyKey: 'activation:sale:$trimmedTenantId:$trimmedAttemptId:$ticketId',
      payload: verificationSalePayload,
    );

    // 6.1 TTFSS First Successful Sale Claim (ONB1.8E & ONB1.8F)
    final claimOutboxEventId = const Uuid().v4();
    final candidateClaim = FirstSuccessfulSaleClaimEntity(
      tenantId: trimmedTenantId,
      terminalId: attempt.candidateTerminalId,
      ticketId: ticketId,
      activationAttemptId: trimmedAttemptId,
      deviceOccurredAt: clockRes.deviceOccurredAt,
      anchoredOccurredAt: clockRes.anchoredOccurredAt,
      clockConfidence: clockRes.clockConfidence,
      serverTimeAnchorId: clockRes.serverTimeAnchorId,
      posBuild: '1.0.0+1',
      outboxEventId: claimOutboxEventId,
      createdAtLocal: nowIso,
    );

    // Atomic write-once insert: ON CONFLICT DO NOTHING (OnConflictStrategy.ignore in Floor DAO)
    await _database.firstSuccessfulSaleClaimDao.insertClaim(candidateClaim);

    // Verify if this ticket is the authoritative winning claim for this tenant
    final persistedClaim = await _database.firstSuccessfulSaleClaimDao.getClaimByTenantId(trimmedTenantId);
    final isWinningClaim = persistedClaim != null && persistedClaim.ticketId == ticketId;

    if (isWinningClaim) {
      addEnvelope(
        eventType: 'FIRST_SUCCESSFUL_SALE_OBSERVED',
        idempotencyKey: 'onboarding:first-sale:$trimmedTenantId',
        payload: {
          'ticketId': ticketId,
          'declarativeTenantId': trimmedTenantId,
          'declarativeTerminalId': attempt.candidateTerminalId,
          'activationAttemptId': trimmedAttemptId,
          'deviceOccurredAt': clockRes.deviceOccurredAt,
          'anchoredOccurredAt': clockRes.anchoredOccurredAt,
          'clockConfidence': clockRes.clockConfidence,
          'serverTimeAnchorId': clockRes.serverTimeAnchorId,
          'posBuild': '1.0.0+1',
          'outboxEventId': persistedClaim.outboxEventId,
        },
      );
    }

    // Persist checks & envelopes to Floor SQLite
    await _database.activationCheckResultLocalDao.insertChecks(checks.values.toList());

    for (final env in outboxEnvelopes) {
      final existingEnv = await _database.activationOutboxDao.getEnvelopeByIdempotencyKey(
        trimmedTenantId,
        env.idempotencyKey,
      );
      if (existingEnv == null) {
        await _database.activationOutboxDao.insertEnvelope(env);
      }
    }

    // Check 3: OUTBOX_DURABLE
    final outboxCheck = ActivationCheckResultLocalEntity(
      id: const Uuid().v4(),
      tenantId: trimmedTenantId,
      activationAttemptId: trimmedAttemptId,
      checkCode: 'OUTBOX_DURABLE',
      status: 'PASS',
      evidenceType: 'OUTBOX_CONSOLIDATION_PROOF',
      evidenceRef: 'OUTBOX_CONSOLIDATED',
      occurredAt: nowIso,
      recordedAt: nowIso,
      detailsSanitizedJson: jsonEncode({
        'envelopesCount': outboxEnvelopes.length,
        'invoiceSyncStatus': ticketSyncStatus,
      }),
    );
    checks['OUTBOX_DURABLE'] = outboxCheck;
    await _database.activationCheckResultLocalDao.insertOrReplace(outboxCheck);

    addEnvelope(
      eventType: 'ACTIVATION_CHECK',
      idempotencyKey: 'activation:check:$trimmedTenantId:$trimmedAttemptId:OUTBOX_DURABLE',
      payload: {
        'checkCode': 'OUTBOX_DURABLE',
        'status': 'PASS',
        'occurredAt': nowIso,
      },
    );
    final existingOutboxEnv = await _database.activationOutboxDao.getEnvelopeByIdempotencyKey(
      trimmedTenantId,
      'activation:check:$trimmedTenantId:$trimmedAttemptId:OUTBOX_DURABLE',
    );
    if (existingOutboxEnv == null) {
      await _database.activationOutboxDao.insertEnvelope(outboxEnvelopes.last);
    }

    // 7. Attempt State Update: Transition to LOCAL_ACTIVATION_EVIDENCE_COMPLETE
    final allChecksPassed = errors.isEmpty &&
        checks.values.every((c) => c.status == 'PASS');

    final updatedAttempt = attempt.copyWith(
      verificationTicketId: ticketId,
      localStatus: allChecksPassed ? 'LOCAL_ACTIVATION_EVIDENCE_COMPLETE' : attempt.localStatus,
      updatedAt: nowIso,
    );
    await _database.activationAttemptLocalDao.updateAttempt(updatedAttempt);

    return ControlledSaleResult(
      isSuccess: allChecksPassed,
      verificationTicketId: ticketId,
      firstSaleClaim: persistedClaim,
      attemptStatus: updatedAttempt.localStatus,
      checks: checks,
      outboxEnvelopes: outboxEnvelopes,
      errors: errors,
    );
  }
}
