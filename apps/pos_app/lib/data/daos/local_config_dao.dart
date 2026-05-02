import 'package:floor/floor.dart';
import 'package:pos_app/data/models/local_config_entity.dart';

@dao
abstract class LocalConfigDao {
  @Query('SELECT * FROM local_configs WHERE key = :key')
  Future<LocalConfigEntity?> getConfigByKey(String key);

  @Insert(onConflict: OnConflictStrategy.replace)
  Future<void> saveConfig(LocalConfigEntity config);

  @Query('DELETE FROM local_configs WHERE key = :key')
  Future<void> deleteConfig(String key);
}
