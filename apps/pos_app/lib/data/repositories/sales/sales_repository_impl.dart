import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:pos_app/domain/usecases/inventory/process_sale_inventory_use_case.dart';
import 'package:pos_app/domain/usecases/inventory/reverse_sale_inventory_use_case.dart';
import 'package:pos_app/data/mappers/inventory_mapper.dart';
import 'package:uuid/uuid.dart';
import 'package:pos_app/data/daos/sales/invoice_dao.dart';
import 'package:pos_app/data/daos/sales/invoice_item_dao.dart';
import 'package:pos_app/data/daos/sales/payment_dao.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/mappers/sales_mapper.dart';
import 'package:pos_app/domain/models/sales/invoice.dart';
import 'package:pos_app/domain/models/sales/invoice_item.dart';
import 'package:pos_app/domain/models/sales/payment.dart';
import 'package:pos_app/domain/repositories/sales/sales_repository.dart';
import 'package:pos_app/domain/repositories/inventory/inventory_repository.dart';
import 'package:pos_app/domain/services/inventory/movement_engine.dart';
import 'package:pos_app/domain/repositories/audit_repository.dart';
import 'package:pos_app/data/daos/sales/sales_transaction_dao.dart';
import 'package:pos_app/domain/services/sales/dgi_numbering_service.dart';
import 'package:pos_app/data/models/sales/invoice_entity.dart';
import 'package:pos_app/data/models/sales/invoice_item_entity.dart';
import 'package:pos_app/data/models/inventory/movement_entity.dart';
import 'package:pos_app/data/mappers/audit_mapper.dart';
import 'package:pos_app/domain/models/user.dart';

class SalesRepositoryImpl implements SalesRepository {
  final AppDatabase database;
  final InvoiceDao invoiceDao;
  final InvoiceItemDao itemDao;
  final PaymentDao paymentDao;
  final SalesTransactionDao transactionDao;
  final DgiNumberingService numberingService;
  final MovementEngine movementEngine;
  final AuditRepository auditRepository;
  final ProcessSaleInventoryUseCase processInventoryUseCase;
  final ReverseSaleInventoryUseCase reverseInventoryUseCase;
  final InventoryRepository inventoryRepository;

  SalesRepositoryImpl({
    required this.database,
    required this.invoiceDao,
    required this.itemDao,
    required this.paymentDao,
    required this.transactionDao,
    required this.numberingService,
    required this.movementEngine,
    required this.auditRepository,
    required this.processInventoryUseCase,
    required this.reverseInventoryUseCase,
    required this.inventoryRepository,
  });

  @override
  Future<void> saveSale({
    required Invoice invoice,
    required List<InvoiceItem> items,
    required List<Payment> payments,
  }) async {
    if (await numberingService.isRangeExhausted()) {
      throw Exception('DGI Authorized Numbering Range exhausted.');
    }

    final finalNumber = await numberingService.getNextNumber();
    final terminalId = 'pos-${invoice.userId}';
    final sourceSequence = await transactionDao.getNextInvoiceSourceSequence(
      terminalId,
    );
    final payloadHash = _buildSalePayloadHash(
      invoice: invoice.copyWith(number: finalNumber),
      items: items,
      payments: payments,
    );
    final updatedInvoice = invoice.copyWith(
      number: finalNumber,
      terminalId: terminalId,
      sourceSequence: sourceSequence,
      idempotencyKey: 'sale:$terminalId:${invoice.id}',
      payloadHash: payloadHash,
    );

    // Bind historical recipe version per line (UC-05). For prepared products
    // without an explicit recipeVersionId, resolve the active version at sale
    // time so the line is frozen to the version used when it was cooked.
    // Items that already carry a recipeVersionId are never recomputed.
    final resolvedItems = await _resolveRecipeVersionBindings(items);

    final invoiceEntity = SalesMapper.toInvoiceEntity(updatedInvoice);
    final itemEntities = resolvedItems.map(SalesMapper.toItemEntity).toList();
    final paymentEntities = payments.map(SalesMapper.toPaymentEntity).toList();

    // Prepare inventory movements using the use case (receives resolved items
    // so the BOM explosion uses the same historical version that is persisted).
    final movements = await processInventoryUseCase.execute(resolvedItems);
    final movementEntities = movements
        .map(
          (m) => InventoryMapper.toMovementEntity(
            m.copyWith(userId: updatedInvoice.userId),
          ),
        )
        .toList();

    try {
      await transactionDao.executeSaleTransaction(
        invoiceEntity,
        itemEntities,
        [],
        paymentEntities,
        movementEntities,
        null, // Audit log is written separately
        false,
      );

      await auditRepository.log(
        'SALE_CREATED',
        metadata:
            '{"invoice_id": "${updatedInvoice.id}", "number": "${updatedInvoice.number}", "total": ${updatedInvoice.total}}',
      );

      await numberingService.incrementNumber();
    } catch (e) {
      rethrow;
    }
  }

  /// Resolves and freezes the [recipeVersionId] on each invoice line for
  /// prepared products that do not already carry one.
  ///
  /// Lines with an existing [recipeVersionId] are passed through untouched —
  /// the historical binding must never be recomputed from the mutable active
  /// recipe (UC-05). Non-prepared products are left as-is (null version).
  Future<List<InvoiceItem>> _resolveRecipeVersionBindings(
    List<InvoiceItem> items,
  ) async {
    final List<InvoiceItem> resolved = [];
    for (final item in items) {
      if (item.recipeVersionId != null) {
        resolved.add(item);
        continue;
      }
      final product = await inventoryRepository.getProductById(item.productId);
      if (product == null || !product.isPrepared) {
        resolved.add(item);
        continue;
      }
      final activeVersionId = await inventoryRepository
          .getActiveRecipeVersionId(item.productId);
      if (activeVersionId == null) {
        throw StateError(
          'Prepared product ${item.productId} cannot be sold without a published active recipe version.',
        );
      }
      resolved.add(item.copyWith(recipeVersionId: activeVersionId));
    }
    return resolved;
  }

  @override
  Future<Invoice?> getInvoiceById(String id) async {
    final entity = await invoiceDao.getInvoiceById(id);
    return entity != null ? SalesMapper.toInvoiceDomain(entity) : null;
  }

  @override
  Future<Invoice?> getInvoiceByNumber(String number) async {
    final entity = await invoiceDao.getInvoiceByNumber(number);
    return entity != null ? SalesMapper.toInvoiceDomain(entity) : null;
  }

  @override
  Future<List<Invoice>> getUnsyncedInvoices() async {
    final entities = await invoiceDao.getInvoicesBySyncStatus('pending');
    return entities.map(SalesMapper.toInvoiceDomain).toList();
  }

  @override
  Future<List<Map<String, dynamic>>> getUnsyncedAggregates() async {
    final invoices = await getUnsyncedInvoices();
    final List<Map<String, dynamic>> aggregates = [];

    for (final invoice in invoices) {
      final items = await itemDao.getItemsByInvoiceId(invoice.id);
      final payments = await paymentDao.getPaymentsByInvoiceId(invoice.id);

      aggregates.add(
        SalesMapper.toSyncJson(
          invoice,
          items.map(SalesMapper.toItemDomain).toList(),
          payments.map(SalesMapper.toPaymentDomain).toList(),
        ),
      );
    }
    return aggregates;
  }

  @override
  Future<void> markAsSynced(List<String> invoiceIds) async {
    if (invoiceIds.isEmpty) return;
    await invoiceDao.updateSyncStatusForIds(invoiceIds, 'synced');
  }

  Future<void> markAsFailed(String invoiceId) async {
    final entity = await invoiceDao.getInvoiceById(invoiceId);
    if (entity != null) {
      final updated = InvoiceEntity(
        id: entity.id,
        number: entity.number,
        createdAt: entity.createdAt,
        userId: entity.userId,
        subtotal: entity.subtotal,
        totalTax: entity.totalTax,
        total: entity.total,
        isCanceled: entity.isCanceled,
        voidReason: entity.voidReason,
        syncStatus: 'failed',
        paymentStatus: entity.paymentStatus,
        type: entity.type,
        customerId: entity.customerId,
        globalTaxOverride: entity.globalTaxOverride,
        relatedInvoiceId: entity.relatedInvoiceId,
        originInvoiceId: entity.originInvoiceId,
        refundReasonPolicy: entity.refundReasonPolicy,
        refundReasonCode: entity.refundReasonCode,
        authorizedByUserId: entity.authorizedByUserId,
        authorizedByRole: entity.authorizedByRole,
        terminalId: entity.terminalId,
        sourceSequence: entity.sourceSequence,
        idempotencyKey: entity.idempotencyKey,
        payloadHash: entity.payloadHash,
      );
      await invoiceDao.updateInvoice(updated);
    }
  }

  @override
  Future<void> voidInvoice(String invoiceId, String reason) async {
    final entity = await invoiceDao.getInvoiceById(invoiceId);
    if (entity == null) return;

    // Build the compensating inventory reversal BEFORE opening the write
    // transaction. The versioned reversal can throw (e.g. a missing
    // historical recipe document, or a recipeVersionId/product mismatch);
    // in that case the invoice must remain active. DGI forbids deleting
    // invoices, so cancellation is an audit-safe flag flip that must
    // always be committed together with its compensating movements.
    final itemEntities = await itemDao.getItemsByInvoiceId(invoiceId);
    final items = itemEntities.map(SalesMapper.toItemDomain).toList();

    final movements = await reverseInventoryUseCase.execute(
      items,
      'Anulación Factura: ${entity.number}',
    );
    final movementEntities = movements
        .map(
          (m) => InventoryMapper.toMovementEntity(
            m.copyWith(userId: entity.userId),
          ),
        )
        .toList();

    // Prepare the forensic hash-chained audit entry WITHOUT inserting,
    // so the audit row is persisted in the same atomic unit as the
    // cancellation (see below). Returns null when there is no current
    // user, mirroring auditRepository.log().
    final preparedAudit = await auditRepository.prepareLog(
      'SALE_VOIDED',
      metadata: '{"invoice_id": "$invoiceId", "reason": "$reason"}',
    );
    final auditEntity = preparedAudit == null
        ? null
        : AuditMapper.toEntity(preparedAudit);

    // DGI forbids deleting invoices — cancellation is a flag flip, never
    // a row deletion. syncStatus is reset to 'pending' so the cancelled
    // invoice re-syncs upstream.
    final canceledInvoice = InvoiceEntity(
      id: entity.id,
      number: entity.number,
      createdAt: entity.createdAt,
      userId: entity.userId,
      subtotal: entity.subtotal,
      totalTax: entity.totalTax,
      total: entity.total,
      isCanceled: true,
      voidReason: reason,
      syncStatus: 'pending',
      paymentStatus: entity.paymentStatus,
      type: entity.type,
      customerId: entity.customerId,
      globalTaxOverride: entity.globalTaxOverride,
      relatedInvoiceId: entity.relatedInvoiceId,
      originInvoiceId: entity.originInvoiceId,
      refundReasonPolicy: entity.refundReasonPolicy,
      refundReasonCode: entity.refundReasonCode,
      authorizedByUserId: entity.authorizedByUserId,
      authorizedByRole: entity.authorizedByRole,
      terminalId: entity.terminalId,
      sourceSequence: entity.sourceSequence,
      idempotencyKey: entity.idempotencyKey,
      payloadHash: entity.payloadHash,
    );

    // Persist EVERYTHING in a single Floor @transaction:
    //   reversal movements + insumo stock + isCanceled flag + audit log.
    // A DAO failure after any inner write rolls back the whole unit, so
    // no partial reversal/cancellation/audit state can be committed.
    await transactionDao.executeVoidTransaction(
      movementEntities,
      canceledInvoice,
      auditEntity,
      false,
    );
  }

  @override
  Future<void> createCreditNote({
    required String originalInvoiceId,
    required String reason,
    required String authorizedByUserId,
    required UserRole authorizedByRole,
    RefundReasonPolicy refundReasonPolicy =
        RefundReasonPolicy.restockOriginalBom,
    List<CreditNoteRefundLine>? lines,
  }) async {
    if (authorizedByRole == UserRole.cashier ||
        authorizedByRole == UserRole.waiter) {
      throw StateError('Credit note requires manager or owner authorization.');
    }
    if (authorizedByUserId.trim().isEmpty) {
      throw StateError('Credit note requires an authorized actor.');
    }
    final sanitizedReason = reason.trim();
    if (sanitizedReason.isEmpty) {
      throw StateError('Credit note reason must not be blank.');
    }
    if (await numberingService.isRangeExhausted()) {
      throw Exception('DGI Authorized Numbering Range exhausted.');
    }

    final original = await invoiceDao.getInvoiceById(originalInvoiceId);
    if (original == null) throw Exception('Original invoice not found');
    if (original.isCanceled) {
      throw StateError('Credit note origin invoice must not be canceled.');
    }
    if (original.type != 'regular') {
      throw StateError('Credit note origin invoice must be a regular sale.');
    }

    final items = await itemDao.getItemsByInvoiceId(originalInvoiceId);
    final requestedLines =
        lines ??
        items
            .map(
              (item) => CreditNoteRefundLine(
                originInvoiceItemId: item.id,
                quantity: item.quantity,
              ),
            )
            .toList(growable: false);
    final selectedItems = _buildRefundItems(items, requestedLines);
    await _assertRefundWithinOriginalQuantity(
      originalInvoiceId,
      items,
      selectedItems,
    );

    final creditNoteId = const Uuid().v4();
    final creditNoteNumber = await numberingService.getNextNumber();
    final now = DateTime.now();
    final terminalId = 'pos-${original.userId}';
    final sourceSequence = await transactionDao.getNextInvoiceSourceSequence(
      terminalId,
    );
    final payloadHash = _buildCreditNotePayloadHash(
      creditNoteId: creditNoteId,
      originalInvoiceId: originalInvoiceId,
      reason: sanitizedReason,
      policy: refundReasonPolicy,
      lines: selectedItems,
    );

    final creditNoteEntity = InvoiceEntity(
      id: creditNoteId,
      number: creditNoteNumber,
      createdAt: now.millisecondsSinceEpoch,
      userId: original.userId,
      subtotal: -selectedItems.fold<double>(
        0,
        (sum, item) => sum + (item.unitPrice * item.quantity),
      ),
      totalTax: -selectedItems.fold<double>(
        0,
        (sum, item) => sum + item.taxAmount,
      ),
      total: -selectedItems.fold<double>(0, (sum, item) => sum + item.total),
      type: 'creditNote',
      relatedInvoiceId: originalInvoiceId,
      originInvoiceId: originalInvoiceId,
      refundReasonPolicy: refundReasonPolicy.backendName,
      refundReasonCode: sanitizedReason,
      authorizedByUserId: authorizedByUserId.trim(),
      authorizedByRole: authorizedByRole.name,
      terminalId: terminalId,
      sourceSequence: sourceSequence,
      idempotencyKey: 'credit-note:$terminalId:$creditNoteId',
      payloadHash: payloadHash,
      paymentStatus: 'paid',
      syncStatus: refundReasonPolicy == RefundReasonPolicy.managerReviewHold
          ? 'error'
          : 'pending',
    );

    final itemEntities = selectedItems
        .map(
          (i) => InvoiceItemEntity(
            id: const Uuid().v4(),
            invoiceId: creditNoteId,
            productId: i.productId,
            productName: 'RETURN: ${i.productName}',
            quantity: -i.quantity,
            unitPrice: i.unitPrice,
            originalTaxRate: i.originalTaxRate,
            appliedTaxRate: i.appliedTaxRate,
            taxAmount: -i.taxAmount,
            total: -i.total,
            variantId: i.variantId,
            notes: sanitizedReason,
            recipeVersionId: i.recipeVersionId,
            originInvoiceItemId: i.id,
          ),
        )
        .toList();

    final movementEntities = await _buildCreditNoteMovements(
      refundReasonPolicy,
      selectedItems,
      original,
      creditNoteId,
      sanitizedReason,
    );

    final preparedAudit = await auditRepository.prepareLog(
      'CREDIT_NOTE_CREATED',
      metadata:
          '{"original_id": "$originalInvoiceId", "new_id": "$creditNoteId", "refundReasonPolicy": "${refundReasonPolicy.backendName}", "authorizedByUserId": "$authorizedByUserId"}',
    );
    final auditEntity = preparedAudit == null
        ? null
        : AuditMapper.toEntity(preparedAudit);

    await transactionDao.executeSaleTransaction(
      creditNoteEntity,
      itemEntities,
      [],
      [],
      movementEntities,
      auditEntity,
      false,
    );

    await numberingService.incrementNumber();
  }

  List<InvoiceItemEntity> _buildRefundItems(
    List<InvoiceItemEntity> originalItems,
    List<CreditNoteRefundLine> requestedLines,
  ) {
    final originalsById = {for (final item in originalItems) item.id: item};
    final seenOriginItemIds = <String>{};
    final List<InvoiceItemEntity> selected = [];

    for (final line in requestedLines) {
      if (!seenOriginItemIds.add(line.originInvoiceItemId)) {
        throw StateError(
          'Credit note refund lines must not duplicate an origin invoice item.',
        );
      }
      if (line.quantity <= 0) {
        throw StateError('Credit note refund quantity must be positive.');
      }
      final original = originalsById[line.originInvoiceItemId];
      if (original == null) {
        throw StateError('Credit note origin invoice item was not found.');
      }
      if (line.quantity > original.quantity + 0.000001) {
        throw StateError(
          'Credit note refund quantity exceeds original line quantity.',
        );
      }
      final ratio = line.quantity / original.quantity;
      selected.add(
        InvoiceItemEntity(
          id: original.id,
          invoiceId: original.invoiceId,
          productId: original.productId,
          productName: original.productName,
          quantity: line.quantity,
          unitPrice: original.unitPrice,
          originalTaxRate: original.originalTaxRate,
          appliedTaxRate: original.appliedTaxRate,
          taxAmount: original.taxAmount * ratio,
          total: original.total * ratio,
          discount: original.discount * ratio,
          variantId: original.variantId,
          notes: original.notes,
          recipeVersionId: original.recipeVersionId,
        ),
      );
    }
    return selected;
  }

  Future<void> _assertRefundWithinOriginalQuantity(
    String originalInvoiceId,
    List<InvoiceItemEntity> originalItems,
    List<InvoiceItemEntity> selectedItems,
  ) async {
    final originalQuantityByItemId = {
      for (final item in originalItems) item.id: item.quantity,
    };
    final refundedQuantityByItemId = <String, double>{};
    final existingCreditNotes = await transactionDao.getCreditNotesByRelatedId(
      originalInvoiceId,
    );

    for (final creditNote in existingCreditNotes) {
      final creditItems = await itemDao.getItemsByInvoiceId(creditNote.id);
      for (final item in creditItems) {
        final originItemId = item.originInvoiceItemId;
        if (originItemId == null) continue;
        refundedQuantityByItemId[originItemId] =
            (refundedQuantityByItemId[originItemId] ?? 0) + item.quantity.abs();
      }
    }

    for (final item in selectedItems) {
      final alreadyRefunded = refundedQuantityByItemId[item.id] ?? 0;
      final originalQuantity = originalQuantityByItemId[item.id] ?? 0;
      if (alreadyRefunded + item.quantity > originalQuantity + 0.000001) {
        throw StateError(
          'Credit note cumulative refund exceeds original line quantity.',
        );
      }
    }
  }

  Future<List<MovementEntity>> _buildCreditNoteMovements(
    RefundReasonPolicy policy,
    List<InvoiceItemEntity> selectedItems,
    InvoiceEntity original,
    String creditNoteId,
    String reason,
  ) async {
    if (policy == RefundReasonPolicy.financialOnly ||
        policy == RefundReasonPolicy.wasteNoRestock ||
        policy == RefundReasonPolicy.managerReviewHold) {
      return [];
    }

    final movements = await reverseInventoryUseCase.execute(
      selectedItems.map(SalesMapper.toItemDomain).toList(growable: false),
      'Credit note ${original.number}: $reason',
    );
    return movements
        .map(
          (movement) => InventoryMapper.toMovementEntity(
            movement.copyWith(
              userId: original.userId,
              sourceDocumentType: 'CREDIT_NOTE_RESTOCK',
              sourceDocumentId: creditNoteId,
              originMovementId: null,
              originInvoiceItemId: movement.originInvoiceItemId,
            ),
          ),
        )
        .toList(growable: false);
  }

  String _buildCreditNotePayloadHash({
    required String creditNoteId,
    required String originalInvoiceId,
    required String reason,
    required RefundReasonPolicy policy,
    required List<InvoiceItemEntity> lines,
  }) {
    final canonical = jsonEncode({
      'creditNoteId': creditNoteId,
      'originInvoiceId': originalInvoiceId,
      'reason': reason,
      'refundReasonPolicy': policy.backendName,
      'lines': lines
          .map(
            (line) => {
              'originInvoiceItemId': line.id,
              'quantity': line.quantity,
              'total': line.total,
            },
          )
          .toList(growable: false),
    });
    return sha256.convert(utf8.encode(canonical)).toString();
  }

  String _buildSalePayloadHash({
    required Invoice invoice,
    required List<InvoiceItem> items,
    required List<Payment> payments,
  }) {
    final canonical = jsonEncode({
      'invoiceId': invoice.id,
      'number': invoice.number,
      'documentType': 'SALE',
      'subtotal': invoice.subtotal,
      'totalTax': invoice.totalTax,
      'total': invoice.total,
      'items': items
          .map(
            (item) => {
              'id': item.id,
              'productId': item.productId,
              'quantity': item.quantity,
              'total': item.total,
            },
          )
          .toList(growable: false),
      'payments': payments
          .map(
            (payment) => {
              'id': payment.id,
              'method': payment.method.name,
              'amount': payment.amount,
            },
          )
          .toList(growable: false),
    });
    return sha256.convert(utf8.encode(canonical)).toString();
  }

  @override
  Future<List<Invoice>> getInvoicesBySessionId(String sessionId) async {
    final session = await database.cashierSessionDao.getSessionById(sessionId);
    if (session == null) return [];

    final startTime = session.openedAt;
    final endTime = session.closedAt ?? DateTime.now().millisecondsSinceEpoch;

    final entities = await invoiceDao.getInvoicesByTimeRange(
      startTime,
      endTime,
    );
    return entities.map(SalesMapper.toInvoiceDomain).toList();
  }

  @override
  Future<List<Payment>> getPaymentsBySessionId(String sessionId) async {
    final session = await database.cashierSessionDao.getSessionById(sessionId);
    if (session == null) return [];

    final startTime = session.openedAt;
    final endTime = session.closedAt ?? DateTime.now().millisecondsSinceEpoch;

    final entities = await paymentDao.getPaymentsByTimeRange(
      startTime,
      endTime,
    );
    return entities.map(SalesMapper.toPaymentDomain).toList();
  }
}
