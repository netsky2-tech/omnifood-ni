import 'package:pos_app/domain/models/audit_log.dart';
import 'package:pos_app/domain/usecases/inventory/frozen_sale_inventory_movement_boundary.dart';
import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:pos_app/domain/usecases/inventory/process_sale_inventory_use_case.dart';
import 'package:pos_app/domain/usecases/inventory/reverse_sale_inventory_use_case.dart';
import 'package:pos_app/domain/usecases/sales/issue_date.dart';
import 'package:pos_app/domain/usecases/sales/void_decision.dart'
    show reprintSnapshotUnavailableCode;
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
import 'package:pos_app/data/models/local_config_entity.dart';
import 'package:pos_app/domain/models/config/tax_regime.dart';
import 'package:pos_app/data/models/customer/customer_point_transaction_entity.dart';
import 'package:pos_app/data/models/sales/invoice_item_entity.dart';
import 'package:pos_app/data/models/inventory/movement_entity.dart';
import 'package:pos_app/data/models/fulfillment/fulfillment_persistence_entities.dart';
import 'package:pos_app/data/mappers/audit_mapper.dart';
import 'package:pos_app/domain/models/user.dart';
import 'package:pos_app/domain/models/fulfillment/fulfillment_checkout_context.dart';

class SalesRepositoryImpl implements SalesRepository {
  @override
  Future<void> acknowledgeSaleSync({
    required String invoiceId,
    required String? outcome,
    required List<String> acknowledgedCorrelationIds,
  }) async {
    final invoice = await invoiceDao.getInvoiceById(invoiceId);
    if (invoice == null) {
      throw StateError('Invoice not found for ACK reconciliation: $invoiceId');
    }

    final localMovements = await transactionDao.getMovementsBySaleId(invoiceId);
    final expectedCorrelations = localMovements
        .map((m) => m.saleCorrelationId ?? m.id)
        .where((id) => id.isNotEmpty)
        .toSet();

    final ackSet = acknowledgedCorrelationIds.toSet();
    final effectiveOutcome = outcome ?? invoice.inventoryOutcome;

    if (effectiveOutcome == 'APPLIED_NO_INVENTORY_IMPACT' ||
        effectiveOutcome == 'APPLIED_INVENTORY_PENDING') {
      if (ackSet.isNotEmpty) {
        throw StateError(
          'Integrity failure: Non-empty ACK set for invoice $invoiceId with outcome $effectiveOutcome: $ackSet',
        );
      }
    } else {
      if (ackSet.length != expectedCorrelations.length ||
          !ackSet.containsAll(expectedCorrelations)) {
        throw StateError(
          'Integrity failure: ACK correlation IDs do not match local expected set for invoice $invoiceId. '
          'Expected: $expectedCorrelations, Received: $ackSet',
        );
      }
    }

    await transactionDao.executeAckTransaction(
      invoiceId,
      'synced',
      MovementDeliveryState.cloudAcknowledged,
    );
  }

  @override
  Future<int> getInventoryEnrichmentPendingCount() async {
    final count = await invoiceDao.getInventoryEnrichmentPendingCount();
    return count ?? 0;
  }

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
  final void Function(FulfillmentCheckoutContext)?
  onFulfillmentCheckoutContextReady;

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
    this.onFulfillmentCheckoutContextReady,
  });

  @override
  Future<void> saveSale({
    required Invoice invoice,
    required List<InvoiceItem> items,
    required List<Payment> payments,
    FulfillmentCheckoutContext? fulfillmentContext,
  }) async {
    if (fulfillmentContext != null) {
      await _validateFulfillmentContext(fulfillmentContext);
    }
    if (await numberingService.isRangeExhausted()) {
      throw Exception('DGI Authorized Numbering Range exhausted.');
    }

    final finalNumber = await numberingService.getNextNumber();
    final nextDgiSequence = _nextDgiSequence(finalNumber);
    final existingInvoice = await invoiceDao.getInvoiceById(invoice.id);
    final terminalId =
        existingInvoice?.terminalId ??
        invoice.terminalId ??
        'pos-${invoice.userId}';
    final sourceSequence =
        existingInvoice?.sourceSequence ??
        (await transactionDao.getNextInvoiceSourceSequence(terminalId)) ??
        1;
    final isFrozenSale = _isFrozenSale(items);
    final sourceInvoice = invoice.copyWith(
      number: finalNumber,
      terminalId: terminalId,
      sourceSequence: sourceSequence,
      idempotencyKey:
          invoice.idempotencyKey ?? 'sale:$terminalId:${invoice.id}',
    );

    // Frozen SALE_TIME_V1 lines are already bound to immutable sale-time facts.
    // Legacy lines still resolve their active recipe version before persistence.
    final resolvedItems = isFrozenSale
        ? items
        : await _resolveRecipeVersionBindings(items);
    final updatedInvoice = sourceInvoice.copyWith(
      payloadHash: _buildSalePayloadHash(
        invoice: sourceInvoice,
        items: resolvedItems,
        payments: payments,
      ),
    );

    // B1a-4 (D-11): bind the sale to the cashier's own open shift, resolved
    // from the sale's own user + terminal (offline lookup, no network). When
    // no matching open session exists, persist null rather than inventing a
    // shift: B1a-2's guard treats null as "unknown", never as "different".
    final openShiftSession = await database.cashierSessionDao
        .getActiveSessionForUserAndTerminal(
      updatedInvoice.userId,
      terminalId,
    );
    final invoiceEntity = SalesMapper.toInvoiceEntity(updatedInvoice)
      ..shiftId = openShiftSession?.id
      // D-12: the local calendar issue date is fixed at issuance. Stored,
      // never recomputed at void time from the epoch createdAt — deriving it
      // then would re-interpret the ticket under the device's CURRENT
      // timezone, and that boundary is what decides voidability.
      ..localIssueDate = localCalendarDate(updatedInvoice.createdAt)
      // D-13: immutable fiscal header snapshot, taken at issuance from the
      // same config the print path reads. Key resolution MIRRORS
      // printer_config_service exactly (printer_header_* first, then the
      // business-profile fallbacks; ruc = the fiscal ruc key) — do not
      // "simplify" the fallbacks: they decide which key feeds legal
      // documents. Only non-blank values enter the JSON; a blank config
      // stores null and reprints fail closed later.
      ..fiscalHeaderSnapshot = await _buildFiscalHeaderSnapshot();
    final itemEntities = resolvedItems.map(SalesMapper.toItemEntity).toList();
    final paymentEntities = payments.map(SalesMapper.toPaymentEntity).toList();
    final movementEntities = isFrozenSale
        ? _frozenMovements(resolvedItems, updatedInvoice)
        : await _legacyMovements(resolvedItems, updatedInvoice);

    try {
      if (fulfillmentContext != null) {
        onFulfillmentCheckoutContextReady?.call(fulfillmentContext);
        await transactionDao.executeFulfillmentSaleTransaction(
          invoiceEntity,
          itemEntities,
          [],
          paymentEntities,
          movementEntities,
          null,
          _fulfillment(updatedInvoice, fulfillmentContext, resolvedItems),
          _printJobs(updatedInvoice, fulfillmentContext, resolvedItems),
          _outbox(updatedInvoice, fulfillmentContext),
          false,
        );
      } else {
        await transactionDao.executeSaleWithDgiTransaction(
          invoiceEntity,
          itemEntities,
          [],
          paymentEntities,
          movementEntities,
          null, // Audit log is written separately
          nextDgiSequence,
          false,
        );
      }

      await auditRepository.log(
        'SALE_CREATED',
        metadata: jsonEncode(<String, String>{
        'invoice_id': updatedInvoice.id,
        'number': updatedInvoice.number,
        'total': updatedInvoice.total.toStringAsFixed(2),
      }),
      );
    } catch (e) {
      rethrow;
    }
  }

  Future<void> _validateFulfillmentContext(
    FulfillmentCheckoutContext context,
  ) async {
    final snapshot = await database.fulfillmentTopologyDao.findSnapshot(
      context.topologySnapshotId,
      context.tenantId,
    );
    if (snapshot == null ||
        snapshot.revision != context.topologyRevision ||
        snapshot.hash != context.topologyHash) {
      throw StateError('Fulfillment checkout topology snapshot is invalid.');
    }
  }

  FulfillmentRecordEntity _fulfillment(
    Invoice invoice,
    FulfillmentCheckoutContext context,
    List<InvoiceItem> items,
  ) => FulfillmentRecordEntity(
    id: 'fulfillment-${invoice.id}',
    tenantId: context.tenantId,
    saleId: invoice.id,
    topologySnapshotId: context.topologySnapshotId,
    topologyRevision: context.topologyRevision,
    channel: context.channel,
    routeState: 'ROUTED',
    deliveryState: 'PENDING',
    linesPayload: _linesPayload(items),
  );

  List<PrintJobEntity> _printJobs(
    Invoice invoice,
    FulfillmentCheckoutContext context,
    List<InvoiceItem> items,
  ) {
    if (!context.channel.contains('PRINT')) return const [];
    final fulfillmentId = 'fulfillment-${invoice.id}';
    return [
      PrintJobEntity(
        id: 'print-${invoice.id}',
        tenantId: context.tenantId,
        fulfillmentId: fulfillmentId,
        documentKind: 'TICKET',
        sequence: 0,
        payload: _linesPayload(items),
        state: 'PENDING',
        retryCount: 0,
        idempotencyKey: 'print:$fulfillmentId:ticket:0',
      ),
    ];
  }

  OutboxEventEntity _outbox(
    Invoice invoice,
    FulfillmentCheckoutContext context,
  ) {
    final fulfillmentId = 'fulfillment-${invoice.id}';
    return OutboxEventEntity(
      eventId: 'event:$fulfillmentId',
      tenantId: context.tenantId,
      deviceId: invoice.terminalId ?? 'pos-${invoice.userId}',
      sourceSequence: invoice.sourceSequence ?? 1,
      aggregateType: 'fulfillment',
      aggregateId: fulfillmentId,
      idempotencyKey: 'outbox:${context.tenantId}:$fulfillmentId',
      payloadHash: 'pending',
      topologyRevision: context.topologyRevision,
      state: 'PENDING',
      attempts: 0,
    );
  }

  String _linesPayload(List<InvoiceItem> items) => jsonEncode(
    items
        .map(
          (item) => {
            'lineId': item.id,
            'productId': item.productId,
            'quantity': item.quantity,
          },
        )
        .toList(growable: false),
  );

  String _nextDgiSequence(String invoiceNumber) {
    final match = RegExp(r'(\d+)$').firstMatch(invoiceNumber.trim());
    if (match == null) {
      throw FormatException('DGI invoice number does not end in a sequence.');
    }
    return (int.parse(match.group(1)!) + 1).toString();
  }

  bool _isFrozenSale(List<InvoiceItem> items) {
    if (items.isEmpty) return false;
    final allFrozen = items.every(
      (item) =>
          item.inventorySnapshotVersion == 'SALE_TIME_V1' &&
          item.inventorySnapshot != null,
    );
    final allLegacy = items.every(
      (item) =>
          item.inventorySnapshotVersion == null &&
          item.inventorySnapshot == null,
    );
    if (!allFrozen && !allLegacy) {
      throw StateError(
        'Sale inventory snapshots must be all frozen or all legacy.',
      );
    }
    return allFrozen;
  }

  List<MovementEntity> _frozenMovements(
    List<InvoiceItem> items,
    Invoice invoice,
  ) {
    final result = FrozenSaleInventoryMovementBoundary().derive(
      items
          .map(
            (item) => FrozenSaleInventoryMovementLine(
              invoiceItemId: item.id,
              quantity: item.quantity,
              snapshot: item.inventorySnapshot!,
            ),
          )
          .toList(growable: false),
    );
    final expectedOutcome = switch (result.outcome) {
      LocalSaleMovementOutcome.applied => 'APPLIED',
      LocalSaleMovementOutcome.suppressedNoInventoryImpact =>
        'APPLIED_NO_INVENTORY_IMPACT',
      LocalSaleMovementOutcome.suppressedInventoryPending =>
        'APPLIED_INVENTORY_PENDING',
    };
    final expectedReason = switch (result.outcome) {
      LocalSaleMovementOutcome.applied => null,
      LocalSaleMovementOutcome.suppressedNoInventoryImpact =>
        'NO_EXPLICIT_INSUMO_MAPPING',
      LocalSaleMovementOutcome.suppressedInventoryPending =>
        'MISSING_PUBLISHED_RECIPE',
    };
    if (invoice.inventoryPolicyVersion != 'SALE_TIME_V1' ||
        invoice.inventoryOutcome != expectedOutcome ||
        invoice.inventoryOutcomeReason != expectedReason) {
      throw StateError(
        'Frozen sale inventory outcome does not match snapshots.',
      );
    }
    return result.movements
        .map(
          (movement) => MovementEntity(
            id: movement.saleCorrelationId,
            insumoId: movement.insumoId,
            type: 'sale',
            quantity: -movement.quantity,
            previousStock: 0,
            newStock: 0,
            timestamp: invoice.createdAt.toIso8601String(),
            userId: invoice.userId,
            sourceDocumentType: 'SALE',
            sourceDocumentId: invoice.id,
            originInvoiceItemId: movement.invoiceItemId,
            deliveryOwner: MovementDeliveryOwner.saleSync,
            deliveryState: MovementDeliveryState.localApplied,
            saleId: invoice.id,
            saleCorrelationId: movement.saleCorrelationId,
          ),
        )
        .toList(growable: false);
  }

  Future<List<MovementEntity>> _legacyMovements(
    List<InvoiceItem> items,
    Invoice invoice,
  ) async {
    final movements = await processInventoryUseCase.execute(items);
    return movements
        .map(
          (movement) => InventoryMapper.toMovementEntity(
            movement.copyWith(
              userId: invoice.userId,
              sourceDocumentType: 'invoice',
              sourceDocumentId: invoice.id,
              deliveryOwner: MovementDeliveryOwner.saleSync,
              deliveryState: MovementDeliveryState.localApplied,
              saleId: invoice.id,
            ),
          ),
        )
        .toList(growable: false);
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

  /// #548: the single copy point for invoice rewrites. Carries EVERY column
  /// of [InvoiceEntity]; only the named overrides differ from [entity].
  /// The pre-#548 voidInvoice/markAsFailed rebuilt the entity from a partial
  /// field list, which fabricated data: non-nullable columns (the BCN and
  /// commercial rates) silently fell back to constructor defaults, and
  /// nullable columns (inventory provenance, shift membership) to null.
  /// Adding a column to InvoiceEntity means adding it here; the full-column
  /// preservation tests in sales_repository_impl_test.dart enforce it.
  InvoiceEntity _copyInvoiceEntity(
    InvoiceEntity entity, {
    bool? isCanceled,
    String? voidReason,
    String? syncStatus,
  }) {
    return InvoiceEntity(
      id: entity.id,
      number: entity.number,
      createdAt: entity.createdAt,
      userId: entity.userId,
      subtotal: entity.subtotal,
      totalTax: entity.totalTax,
      total: entity.total,
      isCanceled: isCanceled ?? entity.isCanceled,
      voidReason: voidReason ?? entity.voidReason,
      syncStatus: syncStatus ?? entity.syncStatus,
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
      inventoryPolicyVersion: entity.inventoryPolicyVersion,
      inventoryOutcome: entity.inventoryOutcome,
      inventoryOutcomeReason: entity.inventoryOutcomeReason,
      bcnOfficialRate: entity.bcnOfficialRate,
      commercialRate: entity.commercialRate,
      totalUsd: entity.totalUsd,
      shiftId: entity.shiftId,
      localIssueDate: entity.localIssueDate,
      fiscalHeaderSnapshot: entity.fiscalHeaderSnapshot,
    );
  }

  /// D-13: builds the immutable fiscal header snapshot from the same config
  /// keys (and fallback order) printer_config_service reads for the live
  /// print path. Null when every value is blank: an unconfigured business
  /// has no header to reproduce, and reprints of such rows fail closed
  /// instead of printing a fabricated default header.
  Future<String?> _buildFiscalHeaderSnapshot() async {
    Future<LocalConfigEntity?> read(String key) =>
        database.localConfigDao.getConfigByKey(key);

    String? nonBlank(LocalConfigEntity? entity) {
      final value = entity?.value.trim() ?? '';
      return value.isEmpty ? null : value;
    }

    final businessName = nonBlank(await read('printer_header_business_name')) ??
        nonBlank(await read('business_name'));
    final ruc = nonBlank(await read('ruc'));
    final address =
        nonBlank(await read('printer_header_address')) ?? nonBlank(await read('address'));
    final phone =
        nonBlank(await read('printer_header_phone')) ?? nonBlank(await read('phone'));
    final fiscalAuthorizationNumber = nonBlank(await read('dgi_authorization_code'));
    // JD-B-003/A-003: the tax regime is part of the fiscal header — a
    // reprint renders the regime AS ISSUED. Same key loadCompanyTaxRegime
    // reads.
    final taxRegime = nonBlank(await read('tax_regime'));

    final snapshot = <String, String>{};
    void put(String key, String? value) {
      if (value != null) snapshot[key] = value;
    }

    put('businessName', businessName);
    put('ruc', ruc);
    put('address', address);
    put('phone', phone);
    put('fiscalAuthorizationNumber', fiscalAuthorizationNumber);
    put('taxRegime', taxRegime);
    // The regime is REQUIRED for a faithful reprint (JD-B-003/A-003): a
    // snapshot without it is INCOMPLETE and the reprint fails closed (same
    // named denial as a missing snapshot), never a live fallback.
    return snapshot.containsKey('taxRegime') ? jsonEncode(snapshot) : null;
  }

  /// D-13: assembles a faithful reprint of the document AS ISSUED. The
  /// header comes from the immutable fiscal snapshot taken at checkout —
  /// NEVER from current config. Writes the REPRINT_REQUESTED audit entry at
  /// request acceptance (before any printing happens; a failed print does
  /// not un-audit the request — the void precedent). Print-only: nothing in
  /// this path consumes a correlativo.
  @override
  Future<ReprintPreparation> prepareReprintInvoice(
    String invoiceId,
    String reasonCode, {
    String? reasonDetail,
  }) async {
    final trimmedCode = reasonCode.trim();
    if (trimmedCode.isEmpty) {
      throw ArgumentError(
        'A reprint reason code is mandatory (D-13).',
      );
    }
    final trimmedDetail = reasonDetail?.trim();

    final entity = await invoiceDao.getInvoiceById(invoiceId);
    if (entity == null) {
      throw StateError('Invoice $invoiceId not found');
    }

    // Fail closed: pre-snapshot rows cannot be reproduced faithfully, and
    // there is no fallback to live config (that would fabricate a legal
    // document). No backfill either — the values were never recorded.
    final rawSnapshot = entity.fiscalHeaderSnapshot?.trim() ?? '';
    if (rawSnapshot.isEmpty) {
      throw StateError(
        '$reprintSnapshotUnavailableCode: invoice $invoiceId predates the fiscal header snapshot',
      );
    }
    final Map<String, dynamic> snapshot;
    TaxRegime snapshotRegime;
    // JD-B-003/A-003 (R2-7): ANY anomaly decoding or parsing the snapshot —
    // corrupted jsonb, a non-string regime, an unknown regime code — maps to
    // the named denial. Nothing may throw past REPRINT_SNAPSHOT_UNAVAILABLE.
    try {
      snapshot = jsonDecode(rawSnapshot) as Map<String, dynamic>;
      final rawRegime = snapshot['taxRegime'];
      if (rawRegime is! String) {
        throw const FormatException('taxRegime is missing or not a string');
      }
      final parsed = TaxRegime.fromString(rawRegime);
      if (parsed == null) {
        throw const FormatException('taxRegime is not a known regime code');
      }
      snapshotRegime = parsed;
    } catch (_) {
      throw StateError(
        '$reprintSnapshotUnavailableCode: the fiscal header snapshot of invoice $invoiceId is corrupted or incomplete',
      );
    }
    final header = snapshot.map(
      (key, value) => MapEntry(key, value is String ? value : ''),
    );

    final items =
        (await itemDao.getItemsByInvoiceId(invoiceId))
            .map(SalesMapper.toItemDomain)
            .toList();
    final payments =
        (await paymentDao.getPaymentsByInvoiceId(invoiceId))
            .map(SalesMapper.toPaymentDomain)
            .toList();
    final invoice = SalesMapper.toInvoiceDomain(entity);

    await auditRepository.log(
      'REPRINT_REQUESTED',
      metadata: jsonEncode(<String, String>{
        'invoice_id': invoiceId,
        'number': entity.number,
        'reason_code': trimmedCode,
        if (trimmedDetail != null && trimmedDetail.isNotEmpty)
          'reason_detail': trimmedDetail,
        'reprint_at': DateTime.now().toIso8601String(),
      }),
    );

    return ReprintPreparation(
      invoice: invoice,
      fiscalHeader: header,
      taxRegime: snapshotRegime,
      items: items,
      payments: payments,
    );
  }

  Future<void> markAsFailed(String invoiceId) async {
    final entity = await invoiceDao.getInvoiceById(invoiceId);
    if (entity != null) {
      final updated = _copyInvoiceEntity(entity, syncStatus: 'failed');
      await invoiceDao.updateInvoice(updated);
    }
  }

  @override
  Future<void> voidInvoice(
    String invoiceId,
    String reasonCode, {
    String? reasonDetail,
  }) async {
    // D-15/#525 AC-6: the reason is mandatory at the repository boundary.
    // This throws BEFORE any read or write: an unreasoned void must never
    // reach the fiscal engine, not even partially.
    final trimmedCode = reasonCode.trim();
    if (trimmedCode.isEmpty) {
      throw ArgumentError(
        'A void reason code is mandatory (D-15, #525 AC-6).',
      );
    }
    final trimmedDetail = reasonDetail?.trim();
    final effectiveReason = (trimmedDetail == null || trimmedDetail.isEmpty)
        ? trimmedCode
        : '$trimmedCode \u2014 $trimmedDetail';

    final entity = await invoiceDao.getInvoiceById(invoiceId);
    if (entity == null) return;
    // D-15/#525 AC-3: a canceled invoice can never be voided again. This is
    // an invariant violation (caller bug), not an operator-facing policy
    // denial — hence StateError instead of a VoidDecision case.
    if (entity.isCanceled) {
      throw StateError(
        'Invoice \$invoiceId is already canceled; void cannot re-run (AC-3).',
      );
    }

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
            m.copyWith(
              userId: entity.userId,
              sourceDocumentType: 'invoice',
              sourceDocumentId: entity.id,
            ),
          ),
        )
        .toList();

    // B1a-2 (D-15): the loyalty reversal rides the SAME transaction. The
    // sale granted/consumed points through customer_point_transactions (the
    // view model's try/catch is not trustworthy evidence) — the void
    // compensates the NET points of the invoice with one 'adjust'
    // transaction and a relative balance update, atomic with the flag flip.
    // No customer or no point transactions → clean no-op. The idempotency
    // key documents the reversal; note the idempotency_key index on
    // customer_point_transactions is NOT unique, so data-layer uniqueness is
    // not enforced — protection is the double-void guard above plus the
    // transaction's all-or-nothing rollback.
    CustomerPointTransactionEntity? loyaltyReversal;
    int? loyaltyReversalUpdatedAt;
    if (entity.customerId != null && entity.customerId!.trim().isNotEmpty) {
      final pointTxs = await database.customerPointTransactionDao
          .getTransactionsByInvoice(invoiceId);
      if (pointTxs.isNotEmpty) {
        final reversalDelta =
            -pointTxs.fold<double>(0, (sum, tx) => sum + tx.points);
        final customer =
            await database.customerDao.getCustomerById(entity.customerId!);
        if (customer != null && reversalDelta != 0) {
          final now = DateTime.now().millisecondsSinceEpoch;
          loyaltyReversal = CustomerPointTransactionEntity(
            id: const Uuid().v4(),
            customerId: entity.customerId!,
            invoiceId: invoiceId,
            type: 'adjust',
            points: reversalDelta,
            // Snapshot of the expected post-reversal balance, from the same
            // fresh read the sale path uses. The row update itself is
            // relative (points_balance = points_balance + delta) inside the
            // transaction, so a concurrent adjustment cannot be lost.
            balanceAfter: customer.pointsBalance + reversalDelta,
            conversionRate: pointTxs.first.conversionRate,
            reason: 'Reversal by void',
            createdAt: now,
            syncStatus: 'pending',
            reversalOfTransactionId: pointTxs.first.id,
            idempotencyKey: 'void-reversal:$invoiceId',
          );
          loyaltyReversalUpdatedAt = now;
        }
      }
    }

    // Prepare the forensic hash-chained audit entry WITHOUT inserting,
    // so the audit row is persisted in the same atomic unit as the
    // cancellation (see below). Returns null when there is no current
    // user, mirroring auditRepository.log(). The structured reason is the
    // D-15 metrics hook: reason_code/reason_detail ride the existing keys
    // (#548 lesson: jsonEncode, never raw interpolation).
    final preparedAudit = await auditRepository.prepareLog(
      'SALE_VOIDED',
      metadata: jsonEncode(<String, String>{
        'invoice_id': invoiceId,
        'reason': effectiveReason,
        'reason_code': trimmedCode,
        if (trimmedDetail != null && trimmedDetail.isNotEmpty)
          'reason_detail': trimmedDetail,
      }),
    );
    final auditEntity = preparedAudit == null
        ? null
        : AuditMapper.toEntity(preparedAudit);

    // DGI forbids deleting invoices — cancellation is a flag flip, never
    // a row deletion. syncStatus is reset to 'pending' so the cancelled
    // invoice re-syncs upstream. #548: copied through the full-column
    // helper so no fiscal/provenance column (rates, inventory outcome,
    // shift membership) is fabricated during the rewrite.
    final canceledInvoice = _copyInvoiceEntity(
      entity,
      isCanceled: true,
      voidReason: effectiveReason,
      syncStatus: 'pending',
    );

    // Persist EVERYTHING in a single Floor @transaction:
    //   reversal movements + insumo stock + isCanceled flag + loyalty
    //   reversal + audit log.
    // A DAO failure after any inner write rolls back the whole unit, so
    // no partial reversal/cancellation/audit state can be committed.
    await transactionDao.executeVoidTransaction(
      movementEntities,
      canceledInvoice,
      auditEntity,
      false,
      loyaltyReversal,
      loyaltyReversalUpdatedAt,
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
    String? terminalId,
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
    // The document's own terminal column keeps the historical derived value;
    // the ISSUANCE SHIFT lookup uses the caller-supplied real terminal only
    // (JD-B-002/R2-3).
    final documentTerminalId = 'pos-${original.userId}';
    final sourceSequence = await transactionDao.getNextInvoiceSourceSequence(
      documentTerminalId,
    );
    final payloadHash = _buildCreditNotePayloadHash(
      creditNoteId: creditNoteId,
      originalInvoiceId: originalInvoiceId,
      reason: sanitizedReason,
      policy: refundReasonPolicy,
      lines: selectedItems,
    );

    // JD-B-002: rates copy from the ORIGIN invoice (the server path already
    // does this) — never the constructor defaults (36.6241/36.50/0.0 would
    // fabricate a fiscal fact). shiftId/localIssueDate = the ISSUANCE
    // moment: the open session for the issuing user on this terminal and
    // today's local date; null when no session is open — never invented.
    // fiscalHeaderSnapshot = a FRESH snapshot of current config: this is a
    // NEW document issued now, not a reprint of the origin.
    // JD-B-002/R2-3: the issuance shift lookup uses ONLY the caller-supplied
    // real terminal. The synthetic 'pos-<user>' value on the document is NOT
    // used for the lookup — a synthetic match would fabricate shift
    // membership. Null terminal (or no session on that terminal) => null
    // shiftId, honestly.
    final issuingSession = (terminalId != null && terminalId.trim().isNotEmpty)
        ? await database.cashierSessionDao.getActiveSessionForUserAndTerminal(
            authorizedByUserId.trim(),
            terminalId.trim(),
          )
        : null;
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
      terminalId: documentTerminalId,
      sourceSequence: sourceSequence,
      idempotencyKey: 'credit-note:$documentTerminalId:$creditNoteId',
      payloadHash: payloadHash,
      paymentStatus: 'paid',
      syncStatus: refundReasonPolicy == RefundReasonPolicy.managerReviewHold
          ? 'error'
          : 'pending',
      bcnOfficialRate: original.bcnOfficialRate,
      commercialRate: original.commercialRate,
      totalUsd: original.totalUsd,
      shiftId: issuingSession?.id,
      localIssueDate: localCalendarDate(now),
      fiscalHeaderSnapshot: await _buildFiscalHeaderSnapshot(),
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
      metadata: jsonEncode(<String, String>{
        'original_id': originalInvoiceId,
        'new_id': creditNoteId,
        'refundReasonPolicy': refundReasonPolicy.backendName,
        'authorizedByUserId': authorizedByUserId,
      }),
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
