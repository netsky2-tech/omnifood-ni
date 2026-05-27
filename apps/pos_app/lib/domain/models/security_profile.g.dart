// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'security_profile.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_$SecurityProfileImpl _$$SecurityProfileImplFromJson(
        Map<String, dynamic> json) =>
    _$SecurityProfileImpl(
      userId: json['user_id'] as String,
      pinHash: json['pin_hash'] as String?,
      totpSecretSeed: json['totp_secret_seed'] as String?,
      isTotpEnabled: json['is_totp_enabled'] as bool? ?? false,
      isPinEnabled: json['is_pin_enabled'] as bool? ?? true,
    );

Map<String, dynamic> _$$SecurityProfileImplToJson(
        _$SecurityProfileImpl instance) =>
    <String, dynamic>{
      'user_id': instance.userId,
      'pin_hash': instance.pinHash,
      'totp_secret_seed': instance.totpSecretSeed,
      'is_totp_enabled': instance.isTotpEnabled,
      'is_pin_enabled': instance.isPinEnabled,
    };
