import 'package:floor/floor.dart';

@Entity(tableName: 'security_profiles')
class SecurityProfileEntity {
  @primaryKey
  @ColumnInfo(name: 'user_id')
  final String userId;

  @ColumnInfo(name: 'pin_hash')
  final String? pinHash;

  @ColumnInfo(name: 'totp_secret_seed')
  final String? totpSecretSeed;

  @ColumnInfo(name: 'is_totp_enabled')
  final bool isTotpEnabled;

  @ColumnInfo(name: 'is_pin_enabled')
  final bool isPinEnabled;

  SecurityProfileEntity({
    required this.userId,
    this.pinHash,
    this.totpSecretSeed,
    required this.isTotpEnabled,
    required this.isPinEnabled,
  });
}
