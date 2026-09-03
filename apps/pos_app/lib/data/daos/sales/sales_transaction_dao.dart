import 'dart:convert';
import 'package:crypto/crypto.dart';
import 'package:floor/floor.dart';
import '../../models/sales/invoice_entity.dart';
import '../../models/sales/invoice_item_entity.dart';
import '../../models/sales/payment_entity.dart';
import '../../models/inventory/insumo_entity.dart';
import '../../models/inventory/movement_entity.dart';
import '../../models/sales/invoice_item_modifier_entity.dart';
import '../../models/audit_log_entity.dart';
import '../../models/fulfillment/fulfillment_persistence_entities.dart';

@dao
abstract class SalesTransactionDao {
  @Insert(onConflict: OnConflictStrategy.abort)
  Future<void> insertInvoice(InvoiceEntity invoice);

  @Update(onConflict: OnConflictStrategy.replace)
  Future<void> updateInvoice(InvoiceEntity invoice);

  @Insert(onConflict: OnConflictStrategy.abort)
  Future<void> insertInvoiceItems(List<InvoiceItemEntity> items);

  @Insert(onConflict: OnConflictStrategy.abort)
  Future<void> insertInvoiceItemModifiers(
    List<InvoiceItemModifierEntity> modifiers,
  );

  @Insert(onConflict: OnConflictStrategy.abort)
  Future<void> insertPayments(List<PaymentEntity> payments);

  @Query('SELECT * FROM insumos WHERE id = :id')
  Future<InsumoEntity?> getInsumoById(String id);

  @Update(onConflict: OnConflictStrategy.replace)
  Future<void> updateInsumo(InsumoEntity insumo);

  @Insert(onConflict: OnConflictStrategy.replace)
  Future<void> insertMovement(MovementEntity movement);

  @Insert(onConflict: OnConflictStrategy.replace)
  Future<void> insertAuditLog(AuditLogEntity log);

  @Query('SELECT * FROM invoices WHERE id = :id')
  Future<InvoiceEntity?> getInvoiceById(String id);

  @Query('SELECT * FROM invoices WHERE related_invoice_id = :relatedId')
  Future<List<InvoiceEntity>> getCreditNotesByRelatedId(String relatedId);

  @Query(
    'SELECT COALESCE(MAX(source_sequence), 0) + 1 FROM invoices WHERE terminal_id = :terminalId AND source_sequence > 0',
  )
  Future<int?> getNextInvoiceSourceSequence(String terminalId);

  @Query(
    "UPDATE local_configs SET value = :nextSequence WHERE `key` = 'dgi_current_number'",
  )
  Future<void> advanceDgiCurrentNumber(String nextSequence);

  @Query('SELECT value FROM local_configs WHERE `key` = :key')
  Future<String?> getDgiConfig(String key);

  @Query(
    'SELECT id FROM inventory_movements WHERE source_document_id = :invoiceId AND insumo_id = :insumoId AND origin_movement_id IS NULL ORDER BY timestamp DESC LIMIT 1',
  )
  Future<String?> getOriginalMovementId(String invoiceId, String insumoId);

  @Query(
    'SELECT * FROM fulfillment_outbox_events WHERE tenant_id = :tenantId AND idempotency_key = :idempotencyKey',
  )
  Future<OutboxEventEntity?> findReplay(String tenantId, String idempotencyKey);

  @transaction
  Future<void> executeSaleTransaction(
    InvoiceEntity invoice,
    List<InvoiceItemEntity> items,
    List<InvoiceItemModifierEntity> modifiers,
    List<PaymentEntity> payments,
    List<MovementEntity> movements,
    AuditLogEntity? auditLog,
    bool shouldFail,
  ) async {
    await _persistSale(
      invoice,
      items,
      modifiers,
      payments,
      movements,
      auditLog,
      shouldFail,
    );
  }

  /// Persists a sale and its DGI sequence advancement as one SQLite unit.
  ///
  /// The SQLite transaction reads and advances the configured sequence itself.
  /// The legacy [nextDgiSequence] argument remains positional for existing
  /// callers, but is not trusted as fiscal authority.
  @transaction
  Future<void> executeSaleWithDgiTransaction(
    InvoiceEntity invoice,
    List<InvoiceItemEntity> items,
    List<InvoiceItemModifierEntity> modifiers,
    List<PaymentEntity> payments,
    List<MovementEntity> movements,
    AuditLogEntity? auditLog,
    String nextDgiSequence,
    bool shouldFail,
  ) async {
    final current = await getDgiConfig('dgi_current_number');
    final sequence = int.tryParse(current ?? '');
    if (sequence == null || sequence < 1) {
      throw StateError('DGI current number is not configured.');
    }
    final prefix =
        await getDgiConfig('dgi_prefix') ??
        invoice.number.replaceFirst(RegExp(r'\d+$'), '');
    invoice.number = '$prefix${sequence.toString().padLeft(8, '0')}';
    await _persistSale(
      invoice,
      items,
      modifiers,
      payments,
      movements,
      auditLog,
      false,
    );
    await advanceDgiCurrentNumber((sequence + 1).toString());
    if (shouldFail) {
      throw Exception('Forced failure for testing');
    }
  }

  /// Persists the local checkout aggregate and its replay identity as one
  /// SQLite unit. Every argument is positional because Floor code generation
  /// does not support named transaction arguments.
  @transaction
  Future<void> executeFulfillmentSaleTransaction(
    InvoiceEntity invoice,
    List<InvoiceItemEntity> items,
    List<InvoiceItemModifierEntity> modifiers,
    List<PaymentEntity> payments,
    List<MovementEntity> movements,
    AuditLogEntity? auditLog,
    FulfillmentRecordEntity fulfillment,
    List<PrintJobEntity> printJobs,
    OutboxEventEntity outbox,
    bool shouldFail,
  ) async {
    final replay = await findReplay(outbox.tenantId, outbox.idempotencyKey);
    if (replay != null) {
      final storedInvoice = await getInvoiceById(invoice.id);
      if (storedInvoice == null ||
          replay.eventId != outbox.eventId ||
          replay.aggregateId != fulfillment.id ||
          fulfillment.saleId != invoice.id ||
          _checkoutHash(
                invoice,
                items,
                modifiers,
                payments,
                movements,
                fulfillment,
                printJobs,
                outbox,
                storedInvoice.number,
              ) !=
              replay.payloadHash) {
        throw StateError('Checkout replay does not match its persisted aggregate.');
      }
      return;
    }

    final current = await getDgiConfig('dgi_current_number');
    final sequence = int.tryParse(current ?? '');
    if (sequence == null || sequence < 1) {
      throw StateError('DGI current number is not configured.');
    }
    final prefix =
        await getDgiConfig('dgi_prefix') ??
        invoice.number.replaceFirst(RegExp(r'\d+$'), '');
    invoice.number = '$prefix${sequence.toString().padLeft(8, '0')}';
    await _persistSale(invoice, items, modifiers, payments, movements, auditLog, false);
    await advanceDgiCurrentNumber((sequence + 1).toString());
    await insertFulfillment(fulfillment);
    for (final job in printJobs) {
      await insertPrintJob(job);
    }
    await insertOutboxEvent(
      OutboxEventEntity(
        eventId: outbox.eventId,
        tenantId: outbox.tenantId,
        deviceId: outbox.deviceId,
        sourceSequence: outbox.sourceSequence,
        aggregateType: outbox.aggregateType,
        aggregateId: outbox.aggregateId,
        idempotencyKey: outbox.idempotencyKey,
        payloadHash: _checkoutHash(invoice, items, modifiers, payments, movements, fulfillment, printJobs, outbox),
        topologyRevision: outbox.topologyRevision,
        state: outbox.state,
        attempts: outbox.attempts,
      ),
    );
    if (shouldFail) throw Exception('Forced failure for testing');
  }

  @Insert(onConflict: OnConflictStrategy.abort)
  Future<void> insertFulfillment(FulfillmentRecordEntity fulfillment);
  @Insert(onConflict: OnConflictStrategy.abort)
  Future<void> insertPrintJob(PrintJobEntity job);
  @Insert(onConflict: OnConflictStrategy.abort)
  Future<void> insertOutboxEvent(OutboxEventEntity outbox);

  Future<void> _persistSale(
    InvoiceEntity invoice,
    List<InvoiceItemEntity> items,
    List<InvoiceItemModifierEntity> modifiers,
    List<PaymentEntity> payments,
    List<MovementEntity> movements,
    AuditLogEntity? auditLog,
    bool shouldFail,
  ) async {
    // 1. Credit Note Validation
    if (invoice.type == 'creditNote' && invoice.relatedInvoiceId != null) {
      final original = await getInvoiceById(invoice.relatedInvoiceId!);
      if (original == null) {
        throw Exception('Original invoice not found');
      }

      final existingCreditNotes = await getCreditNotesByRelatedId(
        invoice.relatedInvoiceId!,
      );
      final double existingTotal = existingCreditNotes.fold(
        0,
        (sum, cn) => sum + cn.total,
      );

      // We use a small epsilon for double comparison if needed, but here simple sum
      if ((existingTotal + invoice.total).abs() > original.total.abs() + 0.01) {
        throw Exception('Credit note total exceeds original invoice total');
      }
    }

    // 2. Insert Invoice
    await insertInvoice(invoice);
    await insertInvoiceItems(items);
    if (modifiers.isNotEmpty) {
      await insertInvoiceItemModifiers(modifiers);
    }
    await insertPayments(payments);

    // 3. Inventory Movements
    for (final movement in movements) {
      final insumo = await getInsumoById(movement.insumoId);
      if (insumo != null) {
        final newStock =
            insumo.stock + movement.quantity; // quantity is negative for sales
        await updateInsumo(
          InsumoEntity(
            id: insumo.id,
            name: insumo.name,
            consumptionUom: insumo.consumptionUom,
            warehouseId: insumo.warehouseId,
            isPerishable: insumo.isPerishable,
            stock: newStock,
            averageCost: insumo.averageCost,
            parLevel: insumo.parLevel,
            isActive: insumo.isActive,
          ),
        );
        await insertMovement(movement);
      }
    }

    // 4. Audit Log
    if (auditLog != null) {
      await insertAuditLog(auditLog);
    }

    // 5. Force failure for testing
    if (shouldFail) {
      throw Exception('Forced failure for testing');
    }
  }

  /// Atomically persists a sale void/cancellation in a single Floor
  /// transaction.
  ///
  /// Combines, in one commit-or-rollback unit:
  /// 1. compensating reversal [movements] + the matching insumo stock
  ///    updates (read fresh inside the tx to avoid stale writes),
  /// 2. the invoice `isCanceled` flag flip ([canceledInvoice]) — never a
  ///    delete, per DGI Disposición Técnica 09-2007 (invoices are
  ///    cancelled, not erased),
  /// 3. the optional forensic hash-chained [auditLog].
  ///
  /// If any inner DAO write fails, Floor rolls back the whole unit so no
  /// partial reversal/cancellation/audit state is ever persisted.
  ///
  /// Positional arguments are mandatory for `@transaction` in this repo:
  /// named arguments break the generated `.g.dart` code.
  ///
  /// [shouldFail] mirrors [executeSaleTransaction]'s hook: when true, the
  /// method throws AFTER every inner write has run, so the real-DB
  /// integrity tests can prove Floor rolls the whole unit back. Production
  /// callers always pass `false`.
  @transaction
  Future<void> executeVoidTransaction(
    List<MovementEntity> movements,
    InvoiceEntity canceledInvoice,
    AuditLogEntity? auditLog,
    bool shouldFail,
  ) async {
    // 1. Reversal movements + insumo stock updates.
    for (final movement in movements) {
      final originMovementId =
          movement.originMovementId ??
          await getOriginalMovementId(canceledInvoice.id, movement.insumoId);
      if (originMovementId == null &&
          movement.sourceDocumentId == canceledInvoice.id) {
        throw StateError(
          'Cancellation reversal requires an original movement.',
        );
      }
      if (originMovementId != null) {
        movement.originMovementId = originMovementId;
      }
      final insumo = await getInsumoById(movement.insumoId);
      if (insumo != null) {
        // Re-compute from the fresh row read inside the tx (positive
        // quantity for reversals adds stock back). This mirrors
        // executeSaleTransaction and keeps reads/writes consistent within
        // the same begin/commit boundary.
        final newStock = insumo.stock + movement.quantity;
        await updateInsumo(
          InsumoEntity(
            id: insumo.id,
            name: insumo.name,
            consumptionUom: insumo.consumptionUom,
            warehouseId: insumo.warehouseId,
            isPerishable: insumo.isPerishable,
            stock: newStock,
            averageCost: insumo.averageCost,
            parLevel: insumo.parLevel,
            isActive: insumo.isActive,
          ),
        );
        await insertMovement(movement);
      }
    }

    // 2. Cancel the invoice (UPDATE only — never DELETE; DGI compliance).
    await updateInvoice(canceledInvoice);

    // 3. Forensic audit log — persisted atomically with the cancellation.
    if (auditLog != null) {
      await insertAuditLog(auditLog);
    }

    // 4. Force failure for testing (production callers pass false).
    if (shouldFail) {
      throw Exception('Forced failure for testing');
    }
  }
}

String _checkoutHash(
  InvoiceEntity invoice,
  List<InvoiceItemEntity> items,
  List<InvoiceItemModifierEntity> modifiers,
  List<PaymentEntity> payments,
  List<MovementEntity> movements,
  FulfillmentRecordEntity fulfillment,
  List<PrintJobEntity> printJobs,
  OutboxEventEntity outbox,
  [String? persistedNumber]
) {
  List<T> ordered<T>(List<T> values, String Function(T) id) => [...values]
    ..sort((left, right) => id(left).compareTo(id(right)));
  final canonical = <Object?>[
    ['invoice', invoice.id, persistedNumber ?? invoice.number, invoice.createdAt, invoice.userId, invoice.subtotal, invoice.totalTax, invoice.total, invoice.isCanceled, invoice.voidReason, invoice.syncStatus, invoice.paymentStatus, invoice.customerId, invoice.globalTaxOverride, invoice.type, invoice.relatedInvoiceId, invoice.originInvoiceId, invoice.refundReasonPolicy, invoice.refundReasonCode, invoice.authorizedByUserId, invoice.authorizedByRole, invoice.terminalId, invoice.sourceSequence, invoice.idempotencyKey, invoice.bcnOfficialRate, invoice.commercialRate, invoice.totalUsd],
    for (final item in ordered(items, (item) => item.id)) ['item', item.id, item.invoiceId, item.productId, item.productName, item.quantity, item.unitPrice, item.originalTaxRate, item.appliedTaxRate, item.taxAmount, item.total, item.discount, item.variantId, item.notes, item.recipeVersionId, item.originInvoiceItemId],
    for (final modifier in ordered(modifiers, (modifier) => modifier.id)) ['modifier', modifier.id, modifier.invoiceItemId, modifier.name, modifier.extraPrice],
    for (final payment in ordered(payments, (payment) => payment.id)) ['payment', payment.id, payment.invoiceId, payment.method, payment.amount, payment.currency, payment.exchangeRate, payment.amountNio, payment.changeGiven, payment.changeCurrency, payment.voucherCode, payment.cardBrand, payment.cardType, payment.bankPos, payment.reconciliationStatus, payment.last4, payment.batchNumber, payment.reconciledAt, payment.reconciledByUserId, payment.createdAt],
    for (final movement in ordered(movements, (movement) => movement.id)) ['movement', movement.id, movement.insumoId, movement.type, movement.quantity, movement.previousStock, movement.newStock, movement.timestamp, movement.reason, movement.userId, movement.unitCostNio, movement.sourceDocumentType, movement.sourceDocumentId, movement.originMovementId, movement.originInvoiceItemId, movement.batch_deductions, movement.estadoCosteo, movement.intentosCount, movement.bloqueoMotivo, movement.autorizadoPorUsuarioId, movement.fechaAutorizacion],
    ['fulfillment', fulfillment.id, fulfillment.tenantId, fulfillment.saleId, fulfillment.topologySnapshotId, fulfillment.topologyRevision, fulfillment.channel, fulfillment.routeState, fulfillment.deliveryState, fulfillment.linesPayload],
    for (final job in ordered(printJobs, (job) => job.id)) ['print', job.id, job.tenantId, job.fulfillmentId, job.documentKind, job.sequence, job.payload, job.state, job.retryCount, job.idempotencyKey],
    ['outbox', outbox.eventId, outbox.tenantId, outbox.deviceId, outbox.sourceSequence, outbox.aggregateType, outbox.aggregateId, outbox.idempotencyKey, outbox.topologyRevision, outbox.state, outbox.attempts],
  ];
  return sha256.convert(utf8.encode(jsonEncode(canonical))).toString();
}
