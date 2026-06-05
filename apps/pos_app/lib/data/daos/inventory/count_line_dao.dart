import 'package:floor/floor.dart';

import '../../models/inventory/count_line_entity.dart';

@dao
abstract class CountLineDao {
  @Query('SELECT * FROM count_lines WHERE session_id = :sessionId ORDER BY id ASC')
  Future<List<CountLineEntity>> findBySessionId(String sessionId);

  @Insert(onConflict: OnConflictStrategy.replace)
  Future<void> insertLines(List<CountLineEntity> lines);

  @Query('DELETE FROM count_lines WHERE session_id = :sessionId')
  Future<void> deleteBySessionId(String sessionId);
}
