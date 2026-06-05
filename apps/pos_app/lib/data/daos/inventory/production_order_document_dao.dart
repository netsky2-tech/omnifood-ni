import 'package:floor/floor.dart';
import '../../models/inventory/production_order_document_entity.dart';

@dao
abstract class ProductionOrderDocumentDao {
  @Query('SELECT * FROM production_order_documents ORDER BY operation_date DESC')
  Future<List<ProductionOrderDocumentEntity>> findAllDocuments();

  @Query('SELECT * FROM production_order_documents WHERE is_synced = 0 ORDER BY operation_date ASC')
  Future<List<ProductionOrderDocumentEntity>> findUnsynced();

  @Insert(onConflict: OnConflictStrategy.replace)
  Future<void> upsertDocument(ProductionOrderDocumentEntity entity);

  @Query('UPDATE production_order_documents SET is_synced = 1 WHERE id = :id')
  Future<void> markAsSynced(String id);
}
