// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'security_profile.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

final _privateConstructorUsedError = UnsupportedError(
    'It seems like you constructed your class using `MyClass._()`. This constructor is only meant to be used by freezed and you are not supposed to need it nor use it.\nPlease check the documentation here for more information: https://github.com/rrousselGit/freezed#adding-getters-and-methods-to-our-models');

SecurityProfile _$SecurityProfileFromJson(Map<String, dynamic> json) {
  return _SecurityProfile.fromJson(json);
}

/// @nodoc
mixin _$SecurityProfile {
  @JsonKey(name: 'user_id')
  String get userId => throw _privateConstructorUsedError;
  @JsonKey(name: 'pin_hash')
  String? get pinHash => throw _privateConstructorUsedError;
  @JsonKey(name: 'totp_secret_seed')
  String? get totpSecretSeed => throw _privateConstructorUsedError;
  @JsonKey(name: 'is_totp_enabled')
  bool get isTotpEnabled => throw _privateConstructorUsedError;
  @JsonKey(name: 'is_pin_enabled')
  bool get isPinEnabled => throw _privateConstructorUsedError;

  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;
  @JsonKey(ignore: true)
  $SecurityProfileCopyWith<SecurityProfile> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $SecurityProfileCopyWith<$Res> {
  factory $SecurityProfileCopyWith(
          SecurityProfile value, $Res Function(SecurityProfile) then) =
      _$SecurityProfileCopyWithImpl<$Res, SecurityProfile>;
  @useResult
  $Res call(
      {@JsonKey(name: 'user_id') String userId,
      @JsonKey(name: 'pin_hash') String? pinHash,
      @JsonKey(name: 'totp_secret_seed') String? totpSecretSeed,
      @JsonKey(name: 'is_totp_enabled') bool isTotpEnabled,
      @JsonKey(name: 'is_pin_enabled') bool isPinEnabled});
}

/// @nodoc
class _$SecurityProfileCopyWithImpl<$Res, $Val extends SecurityProfile>
    implements $SecurityProfileCopyWith<$Res> {
  _$SecurityProfileCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? userId = null,
    Object? pinHash = freezed,
    Object? totpSecretSeed = freezed,
    Object? isTotpEnabled = null,
    Object? isPinEnabled = null,
  }) {
    return _then(_value.copyWith(
      userId: null == userId
          ? _value.userId
          : userId // ignore: cast_nullable_to_non_nullable
              as String,
      pinHash: freezed == pinHash
          ? _value.pinHash
          : pinHash // ignore: cast_nullable_to_non_nullable
              as String?,
      totpSecretSeed: freezed == totpSecretSeed
          ? _value.totpSecretSeed
          : totpSecretSeed // ignore: cast_nullable_to_non_nullable
              as String?,
      isTotpEnabled: null == isTotpEnabled
          ? _value.isTotpEnabled
          : isTotpEnabled // ignore: cast_nullable_to_non_nullable
              as bool,
      isPinEnabled: null == isPinEnabled
          ? _value.isPinEnabled
          : isPinEnabled // ignore: cast_nullable_to_non_nullable
              as bool,
    ) as $Val);
  }
}

/// @nodoc
abstract class _$$SecurityProfileImplCopyWith<$Res>
    implements $SecurityProfileCopyWith<$Res> {
  factory _$$SecurityProfileImplCopyWith(_$SecurityProfileImpl value,
          $Res Function(_$SecurityProfileImpl) then) =
      __$$SecurityProfileImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call(
      {@JsonKey(name: 'user_id') String userId,
      @JsonKey(name: 'pin_hash') String? pinHash,
      @JsonKey(name: 'totp_secret_seed') String? totpSecretSeed,
      @JsonKey(name: 'is_totp_enabled') bool isTotpEnabled,
      @JsonKey(name: 'is_pin_enabled') bool isPinEnabled});
}

/// @nodoc
class __$$SecurityProfileImplCopyWithImpl<$Res>
    extends _$SecurityProfileCopyWithImpl<$Res, _$SecurityProfileImpl>
    implements _$$SecurityProfileImplCopyWith<$Res> {
  __$$SecurityProfileImplCopyWithImpl(
      _$SecurityProfileImpl _value, $Res Function(_$SecurityProfileImpl) _then)
      : super(_value, _then);

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? userId = null,
    Object? pinHash = freezed,
    Object? totpSecretSeed = freezed,
    Object? isTotpEnabled = null,
    Object? isPinEnabled = null,
  }) {
    return _then(_$SecurityProfileImpl(
      userId: null == userId
          ? _value.userId
          : userId // ignore: cast_nullable_to_non_nullable
              as String,
      pinHash: freezed == pinHash
          ? _value.pinHash
          : pinHash // ignore: cast_nullable_to_non_nullable
              as String?,
      totpSecretSeed: freezed == totpSecretSeed
          ? _value.totpSecretSeed
          : totpSecretSeed // ignore: cast_nullable_to_non_nullable
              as String?,
      isTotpEnabled: null == isTotpEnabled
          ? _value.isTotpEnabled
          : isTotpEnabled // ignore: cast_nullable_to_non_nullable
              as bool,
      isPinEnabled: null == isPinEnabled
          ? _value.isPinEnabled
          : isPinEnabled // ignore: cast_nullable_to_non_nullable
              as bool,
    ));
  }
}

/// @nodoc
@JsonSerializable()
class _$SecurityProfileImpl implements _SecurityProfile {
  const _$SecurityProfileImpl(
      {@JsonKey(name: 'user_id') required this.userId,
      @JsonKey(name: 'pin_hash') this.pinHash,
      @JsonKey(name: 'totp_secret_seed') this.totpSecretSeed,
      @JsonKey(name: 'is_totp_enabled') this.isTotpEnabled = false,
      @JsonKey(name: 'is_pin_enabled') this.isPinEnabled = true});

  factory _$SecurityProfileImpl.fromJson(Map<String, dynamic> json) =>
      _$$SecurityProfileImplFromJson(json);

  @override
  @JsonKey(name: 'user_id')
  final String userId;
  @override
  @JsonKey(name: 'pin_hash')
  final String? pinHash;
  @override
  @JsonKey(name: 'totp_secret_seed')
  final String? totpSecretSeed;
  @override
  @JsonKey(name: 'is_totp_enabled')
  final bool isTotpEnabled;
  @override
  @JsonKey(name: 'is_pin_enabled')
  final bool isPinEnabled;

  @override
  String toString() {
    return 'SecurityProfile(userId: $userId, pinHash: $pinHash, totpSecretSeed: $totpSecretSeed, isTotpEnabled: $isTotpEnabled, isPinEnabled: $isPinEnabled)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$SecurityProfileImpl &&
            (identical(other.userId, userId) || other.userId == userId) &&
            (identical(other.pinHash, pinHash) || other.pinHash == pinHash) &&
            (identical(other.totpSecretSeed, totpSecretSeed) ||
                other.totpSecretSeed == totpSecretSeed) &&
            (identical(other.isTotpEnabled, isTotpEnabled) ||
                other.isTotpEnabled == isTotpEnabled) &&
            (identical(other.isPinEnabled, isPinEnabled) ||
                other.isPinEnabled == isPinEnabled));
  }

  @JsonKey(ignore: true)
  @override
  int get hashCode => Object.hash(runtimeType, userId, pinHash, totpSecretSeed,
      isTotpEnabled, isPinEnabled);

  @JsonKey(ignore: true)
  @override
  @pragma('vm:prefer-inline')
  _$$SecurityProfileImplCopyWith<_$SecurityProfileImpl> get copyWith =>
      __$$SecurityProfileImplCopyWithImpl<_$SecurityProfileImpl>(
          this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$SecurityProfileImplToJson(
      this,
    );
  }
}

abstract class _SecurityProfile implements SecurityProfile {
  const factory _SecurityProfile(
          {@JsonKey(name: 'user_id') required final String userId,
          @JsonKey(name: 'pin_hash') final String? pinHash,
          @JsonKey(name: 'totp_secret_seed') final String? totpSecretSeed,
          @JsonKey(name: 'is_totp_enabled') final bool isTotpEnabled,
          @JsonKey(name: 'is_pin_enabled') final bool isPinEnabled}) =
      _$SecurityProfileImpl;

  factory _SecurityProfile.fromJson(Map<String, dynamic> json) =
      _$SecurityProfileImpl.fromJson;

  @override
  @JsonKey(name: 'user_id')
  String get userId;
  @override
  @JsonKey(name: 'pin_hash')
  String? get pinHash;
  @override
  @JsonKey(name: 'totp_secret_seed')
  String? get totpSecretSeed;
  @override
  @JsonKey(name: 'is_totp_enabled')
  bool get isTotpEnabled;
  @override
  @JsonKey(name: 'is_pin_enabled')
  bool get isPinEnabled;
  @override
  @JsonKey(ignore: true)
  _$$SecurityProfileImplCopyWith<_$SecurityProfileImpl> get copyWith =>
      throw _privateConstructorUsedError;
}
