import 'package:floor/floor.dart';
import '../models/security_profile_entity.dart';

@dao
abstract class SecurityProfileDao {
  @Query('SELECT * FROM security_profiles WHERE user_id = :userId LIMIT 1')
  Future<SecurityProfileEntity?> findByUserId(String userId);

  @Insert(onConflict: OnConflictStrategy.replace)
  Future<void> insertProfiles(List<SecurityProfileEntity> profiles);

  @Query('DELETE FROM security_profiles')
  Future<void> deleteAll();

  @Query(
    "SELECT * FROM security_profiles WHERE totp_secret_seed IS NOT NULL AND totp_secret_seed != '' AND lower(substr(totp_secret_seed, 1, 3)) != 'enc'",
  )
  Future<List<SecurityProfileEntity>> findLegacyPlaintextTotpSeeds();

  @Query('UPDATE security_profiles SET totp_secret_seed = :encryptedSeed WHERE user_id = :userId')
  Future<void> updateTotpSecretSeed(String userId, String encryptedSeed);
}
