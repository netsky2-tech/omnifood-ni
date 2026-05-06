import 'package:floor/floor.dart';
import '../../models/sales/invoice_entity.dart';
import '../../models/sales/invoice_item_entity.dart';
import '../../models/sales/payment_entity.dart';
import '../../models/inventory/insumo_entity.dart';
import '../../models/inventory/movement_entity.dart';
import '../../models/sales/invoice_item_modifier_entity.dart';
import '../../models/audit_log_entity.dart';

@dao
abstract class SalesTransactionDao {
  @Insert(onConflict: OnConflictStrategy.replace)
  Future<void> insertInvoice(InvoiceEntity invoice);

  @Insert(onConflict: OnConflictStrategy.replace)
  Future<void> insertInvoiceItems(List<InvoiceItemEntity> items);

  @Insert(onConflict: OnConflictStrategy.replace)
  Future<void> insertInvoiceItemModifiers(List<InvoiceItemModifierEntity> modifiers);

  @Insert(onConflict: OnConflictStrategy.replace)
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
    // 1. Credit Note Validation
    if (invoice.type == 'creditNote' && invoice.relatedInvoiceId != null) {
      final original = await getInvoiceById(invoice.relatedInvoiceId!);
      if (original == null) {
        throw Exception('Original invoice not found');
      }

      final existingCreditNotes = await getCreditNotesByRelatedId(invoice.relatedInvoiceId!);
      final double existingTotal = existingCreditNotes.fold(0, (sum, cn) => sum + cn.total);

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
        final newStock = insumo.stock + movement.quantity; // quantity is negative for sales
        await updateInsumo(InsumoEntity(
          id: insumo.id,
          name: insumo.name,
          consumptionUom: insumo.consumptionUom,
          warehouseId: insumo.warehouseId,
          isPerishable: insumo.isPerishable,
          stock: newStock,
          averageCost: insumo.averageCost,
          parLevel: insumo.parLevel,
          isActive: insumo.isActive,
        ));
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
}
