import 'package:floor/floor.dart';
import '../../models/activation/activation_attempt_local_entity.dart';

@dao
abstract class ActivationAttemptLocalDao {
  @Query('SELECT * FROM activation_attempts_local WHERE attempt_id = :attemptId')
  Future<ActivationAttemptLocalEntity?> getAttemptById(String attemptId);

  @Query('SELECT * FROM activation_attempts_local WHERE tenant_id = :tenantId ORDER BY assigned_at DESC LIMIT 1')
  Future<ActivationAttemptLocalEntity?> getLatestAttempt(String tenantId);

  @Query("SELECT * FROM activation_attempts_local WHERE tenant_id = :tenantId AND local_status NOT IN ('EVIDENCE_ACKED', 'FAIL') ORDER BY assigned_at DESC LIMIT 1")
  Future<ActivationAttemptLocalEntity?> getActiveAttempt(String tenantId);

  @Insert(onConflict: OnConflictStrategy.replace)
  Future<void> insertOrReplace(ActivationAttemptLocalEntity attempt);

  @Update(onConflict: OnConflictStrategy.replace)
  Future<void> updateAttempt(ActivationAttemptLocalEntity attempt);

  @Query('DELETE FROM activation_attempts_local WHERE tenant_id = :tenantId')
  Future<void> deleteByTenantId(String tenantId);

  @Query('SELECT * FROM activation_attempts_local')
  Future<List<ActivationAttemptLocalEntity>> getAll();

  @transaction
  Future<void> saveAttempt(ActivationAttemptLocalEntity attempt) async {
    await insertOrReplace(attempt);
  }
}
