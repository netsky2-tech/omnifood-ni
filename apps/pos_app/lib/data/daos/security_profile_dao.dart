import 'package:floor/floor.dart';
import '../models/security_profile_entity.dart';

@dao
abstract class SecurityProfileDao {
  @Query('SELECT * FROM security_profiles WHERE user_id = :userId LIMIT 1')
  Future<SecurityProfileEntity?> findByUserId(String userId);

  /// Reads every stored profile so a sync can merge instead of overwrite.
  ///
  /// Issue #944: the staff sync runs on the USER channel, where the backend
  /// masks `pin_hash`/`totp_secret_seed` for every user the requester may not
  /// read. A masked value is not a fact about the user — it is a fact about
  /// the requester — so the merge needs the local value to fall back to.
  @Query('SELECT * FROM security_profiles')
  Future<List<SecurityProfileEntity>> findAll();

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
