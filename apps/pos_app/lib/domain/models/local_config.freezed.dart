// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'local_config.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

final _privateConstructorUsedError = UnsupportedError(
    'It seems like you constructed your class using `MyClass._()`. This constructor is only meant to be used by freezed and you are not supposed to need it nor use it.\nPlease check the documentation here for more information: https://github.com/rrousselGit/freezed#adding-getters-and-methods-to-our-models');

LocalConfig _$LocalConfigFromJson(Map<String, dynamic> json) {
  return _LocalConfig.fromJson(json);
}

/// @nodoc
mixin _$LocalConfig {
  String get key => throw _privateConstructorUsedError;
  String get value => throw _privateConstructorUsedError;
  String? get description => throw _privateConstructorUsedError;

  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;
  @JsonKey(ignore: true)
  $LocalConfigCopyWith<LocalConfig> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $LocalConfigCopyWith<$Res> {
  factory $LocalConfigCopyWith(
          LocalConfig value, $Res Function(LocalConfig) then) =
      _$LocalConfigCopyWithImpl<$Res, LocalConfig>;
  @useResult
  $Res call({String key, String value, String? description});
}

/// @nodoc
class _$LocalConfigCopyWithImpl<$Res, $Val extends LocalConfig>
    implements $LocalConfigCopyWith<$Res> {
  _$LocalConfigCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? key = null,
    Object? value = null,
    Object? description = freezed,
  }) {
    return _then(_value.copyWith(
      key: null == key
          ? _value.key
          : key // ignore: cast_nullable_to_non_nullable
              as String,
      value: null == value
          ? _value.value
          : value // ignore: cast_nullable_to_non_nullable
              as String,
      description: freezed == description
          ? _value.description
          : description // ignore: cast_nullable_to_non_nullable
              as String?,
    ) as $Val);
  }
}

/// @nodoc
abstract class _$$LocalConfigImplCopyWith<$Res>
    implements $LocalConfigCopyWith<$Res> {
  factory _$$LocalConfigImplCopyWith(
          _$LocalConfigImpl value, $Res Function(_$LocalConfigImpl) then) =
      __$$LocalConfigImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call({String key, String value, String? description});
}

/// @nodoc
class __$$LocalConfigImplCopyWithImpl<$Res>
    extends _$LocalConfigCopyWithImpl<$Res, _$LocalConfigImpl>
    implements _$$LocalConfigImplCopyWith<$Res> {
  __$$LocalConfigImplCopyWithImpl(
      _$LocalConfigImpl _value, $Res Function(_$LocalConfigImpl) _then)
      : super(_value, _then);

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? key = null,
    Object? value = null,
    Object? description = freezed,
  }) {
    return _then(_$LocalConfigImpl(
      key: null == key
          ? _value.key
          : key // ignore: cast_nullable_to_non_nullable
              as String,
      value: null == value
          ? _value.value
          : value // ignore: cast_nullable_to_non_nullable
              as String,
      description: freezed == description
          ? _value.description
          : description // ignore: cast_nullable_to_non_nullable
              as String?,
    ));
  }
}

/// @nodoc
@JsonSerializable()
class _$LocalConfigImpl implements _LocalConfig {
  const _$LocalConfigImpl(
      {required this.key, required this.value, this.description});

  factory _$LocalConfigImpl.fromJson(Map<String, dynamic> json) =>
      _$$LocalConfigImplFromJson(json);

  @override
  final String key;
  @override
  final String value;
  @override
  final String? description;

  @override
  String toString() {
    return 'LocalConfig(key: $key, value: $value, description: $description)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$LocalConfigImpl &&
            (identical(other.key, key) || other.key == key) &&
            (identical(other.value, value) || other.value == value) &&
            (identical(other.description, description) ||
                other.description == description));
  }

  @JsonKey(ignore: true)
  @override
  int get hashCode => Object.hash(runtimeType, key, value, description);

  @JsonKey(ignore: true)
  @override
  @pragma('vm:prefer-inline')
  _$$LocalConfigImplCopyWith<_$LocalConfigImpl> get copyWith =>
      __$$LocalConfigImplCopyWithImpl<_$LocalConfigImpl>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$LocalConfigImplToJson(
      this,
    );
  }
}

abstract class _LocalConfig implements LocalConfig {
  const factory _LocalConfig(
      {required final String key,
      required final String value,
      final String? description}) = _$LocalConfigImpl;

  factory _LocalConfig.fromJson(Map<String, dynamic> json) =
      _$LocalConfigImpl.fromJson;

  @override
  String get key;
  @override
  String get value;
  @override
  String? get description;
  @override
  @JsonKey(ignore: true)
  _$$LocalConfigImplCopyWith<_$LocalConfigImpl> get copyWith =>
      throw _privateConstructorUsedError;
}
