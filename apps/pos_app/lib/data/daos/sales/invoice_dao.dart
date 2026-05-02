import 'package:floor/floor.dart';
import '../../models/sales/invoice_entity.dart';

@dao
abstract class InvoiceDao {
  @Query('SELECT * FROM invoices WHERE id = :id')
  Future<InvoiceEntity?> getInvoiceById(String id);

  @Query('SELECT * FROM invoices WHERE invoice_number = :number')
  Future<InvoiceEntity?> getInvoiceByNumber(String number);

  @Query('SELECT * FROM invoices ORDER BY created_at DESC')
  Future<List<InvoiceEntity>> getAllInvoices();

  @Query('SELECT * FROM invoices WHERE sync_status = :status')
  Future<List<InvoiceEntity>> getInvoicesBySyncStatus(String status);

  @Insert(onConflict: OnConflictStrategy.replace)
  Future<void> insertInvoice(InvoiceEntity invoice);

  @Update(onConflict: OnConflictStrategy.replace)
  Future<void> updateInvoice(InvoiceEntity invoice);

  @Query('SELECT MAX(invoice_number) FROM invoices')
  Future<String?> getLastInvoiceNumber();
}
