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
import 'package:pos_app/domain/services/inventory/movement_engine.dart';
import 'package:pos_app/domain/repositories/audit_repository.dart';
import 'package:pos_app/data/daos/sales/sales_transaction_dao.dart';
import 'package:pos_app/domain/services/sales/dgi_numbering_service.dart';
import 'package:pos_app/data/models/sales/invoice_entity.dart';
import 'package:pos_app/data/models/sales/invoice_item_entity.dart';
import 'package:pos_app/data/models/inventory/movement_entity.dart';

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
    final updatedInvoice = invoice.copyWith(number: finalNumber);

    final invoiceEntity = SalesMapper.toInvoiceEntity(updatedInvoice);
    final itemEntities = items.map(SalesMapper.toItemEntity).toList();
    final paymentEntities = payments.map(SalesMapper.toPaymentEntity).toList();

    // Prepare inventory movements using the use case
    final movements = await processInventoryUseCase.execute(items);
    final movementEntities = movements
        .map((m) => InventoryMapper.toMovementEntity(m.copyWith(userId: updatedInvoice.userId)))
        .toList();

    try {
      await transactionDao.executeSaleTransaction(
        invoiceEntity,
        itemEntities,
        [], 
        paymentEntities,
        movementEntities,
      );

      await numberingService.incrementNumber();

      await auditRepository.log(
        'SALE_CREATED',
        metadata: '{"invoice_id": "${updatedInvoice.id}", "number": "${updatedInvoice.number}", "total": ${updatedInvoice.total}}',
      );
    } catch (e) {
      rethrow;
    }
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

      aggregates.add(SalesMapper.toSyncJson(
        invoice,
        items.map(SalesMapper.toItemDomain).toList(),
        payments.map(SalesMapper.toPaymentDomain).toList(),
      ));
    }
    return aggregates;
  }

  @override
  Future<void> markAsSynced(String invoiceId) async {
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
        syncStatus: 'synced',
        paymentStatus: entity.paymentStatus,
        type: entity.type,
        customerId: entity.customerId,
        globalTaxOverride: entity.globalTaxOverride,
        relatedInvoiceId: entity.relatedInvoiceId,
      );
      await invoiceDao.updateInvoice(updated);
    }
  }

  @override
  Future<void> voidInvoice(String invoiceId, String reason) async {
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
        isCanceled: true,
        voidReason: reason,
        syncStatus: 'pending',
        paymentStatus: entity.paymentStatus,
        type: entity.type,
        customerId: entity.customerId,
        globalTaxOverride: entity.globalTaxOverride,
        relatedInvoiceId: entity.relatedInvoiceId,
      );
      await invoiceDao.updateInvoice(updated);

      final itemEntities = await itemDao.getItemsByInvoiceId(invoiceId);
      final items = itemEntities.map(SalesMapper.toItemDomain).toList();
      
      final movements = await reverseInventoryUseCase.execute(items, 'Anulación Factura: ${entity.number}');
      final movementEntities = movements
          .map((m) => InventoryMapper.toMovementEntity(m.copyWith(userId: entity.userId)))
          .toList();

      for (final movEntity in movementEntities) {
        await database.movementDao.insertMovement(movEntity);
        await database.insumoDao.updateStock(movEntity.insumoId, movEntity.newStock);
      }

      await auditRepository.log(
        'SALE_VOIDED',
        metadata: '{"invoice_id": "$invoiceId", "reason": "$reason"}',
      );
    }
  }

  @override
  Future<void> createCreditNote({
    required String originalInvoiceId,
    required String reason,
  }) async {
    final original = await invoiceDao.getInvoiceById(originalInvoiceId);
    if (original == null) throw Exception('Original invoice not found');

    final items = await itemDao.getItemsByInvoiceId(originalInvoiceId);

    final creditNoteId = const Uuid().v4();
    final creditNoteNumber = await numberingService.getNextNumber();

    final creditNoteEntity = InvoiceEntity(
      id: creditNoteId,
      number: creditNoteNumber,
      createdAt: DateTime.now().millisecondsSinceEpoch,
      userId: original.userId,
      subtotal: -original.subtotal,
      totalTax: -original.totalTax,
      total: -original.total,
      type: 'creditNote',
      relatedInvoiceId: originalInvoiceId,
      paymentStatus: 'paid',
      syncStatus: 'pending',
    );

    final itemEntities = items.map((i) => InvoiceItemEntity(
      id: const Uuid().v4(),
      invoiceId: creditNoteId,
      productId: i.productId,
      productName: 'DEVOLUCION: ${i.productName}',
      quantity: -i.quantity,
      unitPrice: i.unitPrice,
      originalTaxRate: i.originalTaxRate,
      appliedTaxRate: i.appliedTaxRate,
      taxAmount: -i.taxAmount,
      total: -i.total,
      variantId: i.variantId,
      notes: reason,
    )).toList();

    // Reversing stock (adding back) using UseCase for BOM support
    final domainItems = items.map(SalesMapper.toItemDomain).toList();
    final movements = await reverseInventoryUseCase.execute(domainItems, 'Devolución Factura: ${original.number}');
    final movementEntities = movements
        .map((m) => InventoryMapper.toMovementEntity(m.copyWith(userId: original.userId)))
        .toList();

    await transactionDao.executeSaleTransaction(
      creditNoteEntity,
      itemEntities,
      [], 
      [], 
      movementEntities,
    );

    await numberingService.incrementNumber();
    await auditRepository.log('CREDIT_NOTE_CREATED', metadata: '{"original_id": "$originalInvoiceId", "new_id": "$creditNoteId"}');
  }

  @override
  Future<List<Invoice>> getInvoicesBySessionId(String sessionId) async {
    final session = await database.cashierSessionDao.getSessionById(sessionId);
    if (session == null) return [];

    final startTime = session.openedAt;
    final endTime = session.closedAt ?? DateTime.now().millisecondsSinceEpoch;

    final entities = await invoiceDao.getInvoicesByTimeRange(startTime, endTime);
    return entities.map(SalesMapper.toInvoiceDomain).toList();
  }

  @override
  Future<List<Payment>> getPaymentsBySessionId(String sessionId) async {
    final session = await database.cashierSessionDao.getSessionById(sessionId);
    if (session == null) return [];

    final startTime = session.openedAt;
    final endTime = session.closedAt ?? DateTime.now().millisecondsSinceEpoch;

    final entities = await paymentDao.getPaymentsByTimeRange(startTime, endTime);
    return entities.map(SalesMapper.toPaymentDomain).toList();
  }
}
