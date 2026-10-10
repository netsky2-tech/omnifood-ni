import 'package:floor/floor.dart';
import '../../models/sales/invoice_item_entity.dart';
import '../../models/sales/invoice_item_modifier_entity.dart';

@dao
abstract class InvoiceItemDao {
  @Query('SELECT * FROM invoice_items WHERE invoice_id = :invoiceId')
  Future<List<InvoiceItemEntity>> getItemsByInvoiceId(String invoiceId);

  /// Every persisted modifier row of an invoice's items, in one batched
  /// query (the push path rebuilds the wire payload per invoice, and N+1
  /// per-item lookups would multiply sync queries). rowid order preserves
  /// the cart's insertion order of the modifiers on each line.
  @Query(
    'SELECT invoice_item_modifiers.* FROM invoice_item_modifiers '
    'INNER JOIN invoice_items ON invoice_items.id = invoice_item_modifiers.invoice_item_id '
    'WHERE invoice_items.invoice_id = :invoiceId '
    'ORDER BY invoice_item_modifiers.rowid',
  )
  Future<List<InvoiceItemModifierEntity>> getModifierRowsByInvoiceId(
    String invoiceId,
  );

  @Insert(onConflict: OnConflictStrategy.replace)
  Future<void> insertItems(List<InvoiceItemEntity> items);
}
