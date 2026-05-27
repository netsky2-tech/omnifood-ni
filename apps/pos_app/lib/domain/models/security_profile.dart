import 'package:freezed_annotation/freezed_annotation.dart';

part 'security_profile.freezed.dart';
part 'security_profile.g.dart';

@freezed
class SecurityProfile with _$SecurityProfile {
  const factory SecurityProfile({
    @JsonKey(name: 'user_id') required String userId,
    @JsonKey(name: 'pin_hash') String? pinHash,
    @JsonKey(name: 'totp_secret_seed') String? totpSecretSeed,
    @JsonKey(name: 'is_totp_enabled') @Default(false) bool isTotpEnabled,
    @JsonKey(name: 'is_pin_enabled') @Default(true) bool isPinEnabled,
  }) = _SecurityProfile;

  factory SecurityProfile.fromJson(Map<String, dynamic> json) => _$SecurityProfileFromJson(json);
}
