import 'package:floor/floor.dart';

import '../../models/inventory/count_session_document_entity.dart';

@dao
abstract class CountSessionDao {
  @Query('SELECT * FROM count_session_documents ORDER BY updated_at DESC')
  Future<List<CountSessionDocumentEntity>> findAllDocuments();

  @Query('SELECT * FROM count_session_documents WHERE is_synced = 0 ORDER BY created_at ASC')
  Future<List<CountSessionDocumentEntity>> findUnsynced();

  @Insert(onConflict: OnConflictStrategy.replace)
  Future<void> upsertDocument(CountSessionDocumentEntity entity);

  @Query('UPDATE count_session_documents SET is_synced = 1 WHERE id = :id')
  Future<void> markAsSynced(String id);
}
