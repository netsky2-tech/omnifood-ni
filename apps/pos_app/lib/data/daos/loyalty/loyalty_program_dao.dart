import 'package:floor/floor.dart';
import '../../models/loyalty/loyalty_program_entity.dart';

@dao
abstract class LoyaltyProgramDao {
  @Query('SELECT * FROM loyalty_programs WHERE tenant_id = :tenantId AND status = :status')
  Future<List<LoyaltyProgramEntity>> getProgramsByStatus(
    String tenantId,
    String status,
  );

  @Query('SELECT * FROM loyalty_programs WHERE tenant_id = :tenantId')
  Future<List<LoyaltyProgramEntity>> getAllPrograms(String tenantId);

  @Query('SELECT * FROM loyalty_programs WHERE id = :id')
  Future<LoyaltyProgramEntity?> getProgramById(String id);

  @Insert(onConflict: OnConflictStrategy.replace)
  Future<void> saveProgram(LoyaltyProgramEntity program);

  @Insert(onConflict: OnConflictStrategy.replace)
  Future<void> savePrograms(List<LoyaltyProgramEntity> programs);

  @Query('DELETE FROM loyalty_programs WHERE tenant_id = :tenantId')
  Future<void> deleteAllPrograms(String tenantId);

  @Query('SELECT * FROM loyalty_programs WHERE tenant_id = :tenantId AND status = \'ACTIVE\'')
  Future<List<LoyaltyProgramEntity>> getActivePrograms(String tenantId);
}
