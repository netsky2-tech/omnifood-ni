import 'package:floor/floor.dart';
import '../../models/loyalty/loyalty_reward_entity.dart';

@dao
abstract class LoyaltyRewardDao {
  @Query('SELECT * FROM loyalty_rewards WHERE loyalty_program_id = :programId ORDER BY presentation_order ASC')
  Future<List<LoyaltyRewardEntity>> getRewardsByProgram(String programId);

  @Query('SELECT * FROM loyalty_rewards WHERE tenant_id = :tenantId AND status = :status')
  Future<List<LoyaltyRewardEntity>> getRewardsByStatus(
    String tenantId,
    String status,
  );

  @Query('SELECT * FROM loyalty_rewards WHERE id = :id')
  Future<LoyaltyRewardEntity?> getRewardById(String id);

  @Insert(onConflict: OnConflictStrategy.replace)
  Future<void> saveReward(LoyaltyRewardEntity reward);

  @Insert(onConflict: OnConflictStrategy.replace)
  Future<void> saveRewards(List<LoyaltyRewardEntity> rewards);

  @Query('DELETE FROM loyalty_rewards WHERE tenant_id = :tenantId')
  Future<void> deleteAllRewards(String tenantId);

  @Query('SELECT * FROM loyalty_rewards WHERE tenant_id = :tenantId AND status = \'ACTIVE\' ORDER BY presentation_order ASC')
  Future<List<LoyaltyRewardEntity>> getActiveRewards(String tenantId);
}
