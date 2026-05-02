import 'package:floor/floor.dart';
import '../../models/sales/invoice_entity.dart';
import '../../models/sales/invoice_item_entity.dart';
import '../../models/sales/payment_entity.dart';
import '../../models/inventory/insumo_entity.dart';
import '../../models/inventory/movement_entity.dart';
import '../../models/sales/invoice_item_modifier_entity.dart';

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

  @transaction
  Future<void> executeSaleTransaction(
    InvoiceEntity invoice,
    List<InvoiceItemEntity> items,
    List<InvoiceItemModifierEntity> modifiers,
    List<PaymentEntity> payments,
    List<MovementEntity> movements,
  ) async {
    await insertInvoice(invoice);
    await insertInvoiceItems(items);
    if (modifiers.isNotEmpty) {
      await insertInvoiceItemModifiers(modifiers);
    }
    await insertPayments(payments);

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
  }
}
