import 'package:floor/floor.dart';
import '../../models/sales/invoice_item_entity.dart';

@dao
abstract class InvoiceItemDao {
  @Query('SELECT * FROM invoice_items WHERE invoice_id = :invoiceId')
  Future<List<InvoiceItemEntity>> getItemsByInvoiceId(String invoiceId);

  @Insert(onConflict: OnConflictStrategy.replace)
  Future<void> insertItems(List<InvoiceItemEntity> items);
}
