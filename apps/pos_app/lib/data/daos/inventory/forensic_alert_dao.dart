import 'package:floor/floor.dart';

import '../../models/inventory/forensic_alert_entity.dart';

@dao
abstract class ForensicAlertDao {
  @Query('SELECT * FROM forensic_alerts ORDER BY created_at DESC')
  Future<List<ForensicAlertEntity>> findAllAlerts();

  @Query(
    "SELECT * FROM forensic_alerts WHERE is_synced = 0 AND status != 'active' ORDER BY created_at ASC",
  )
  Future<List<ForensicAlertEntity>> findUnsyncedLifecycleAlerts();

  @Insert(onConflict: OnConflictStrategy.replace)
  Future<void> upsertAlert(ForensicAlertEntity entity);

  @Query('UPDATE forensic_alerts SET is_synced = 1 WHERE id = :id')
  Future<void> markAsSynced(String id);
}
