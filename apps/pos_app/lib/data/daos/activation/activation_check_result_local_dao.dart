import 'package:floor/floor.dart';
import '../../models/activation/activation_check_result_local_entity.dart';

@dao
abstract class ActivationCheckResultLocalDao {
  @Query('SELECT * FROM activation_checks_local WHERE tenant_id = :tenantId AND activation_attempt_id = :attemptId AND check_code = :checkCode')
  Future<ActivationCheckResultLocalEntity?> getCheck(
    String tenantId,
    String attemptId,
    String checkCode,
  );

  @Query('SELECT * FROM activation_checks_local WHERE tenant_id = :tenantId AND activation_attempt_id = :attemptId')
  Future<List<ActivationCheckResultLocalEntity>> getChecksForAttempt(
    String tenantId,
    String attemptId,
  );

  @Insert(onConflict: OnConflictStrategy.replace)
  Future<void> insertOrReplace(ActivationCheckResultLocalEntity check);

  @Insert(onConflict: OnConflictStrategy.replace)
  Future<void> insertChecks(List<ActivationCheckResultLocalEntity> checks);

  @Query('DELETE FROM activation_checks_local WHERE tenant_id = :tenantId AND activation_attempt_id = :attemptId')
  Future<void> deleteChecksForAttempt(String tenantId, String attemptId);

  @Query('SELECT * FROM activation_checks_local')
  Future<List<ActivationCheckResultLocalEntity>> getAll();

  @transaction
  Future<void> saveCheckResult(ActivationCheckResultLocalEntity check) async {
    await insertOrReplace(check);
  }
}
