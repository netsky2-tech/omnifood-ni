// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'tax_configuration.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

final _privateConstructorUsedError = UnsupportedError(
    'It seems like you constructed your class using `MyClass._()`. This constructor is only meant to be used by freezed and you are not supposed to need it nor use it.\nPlease check the documentation here for more information: https://github.com/rrousselGit/freezed#adding-getters-and-methods-to-our-models');

TaxConfiguration _$TaxConfigurationFromJson(Map<String, dynamic> json) {
  return _TaxConfiguration.fromJson(json);
}

/// @nodoc
mixin _$TaxConfiguration {
  String get id => throw _privateConstructorUsedError;
  String get name => throw _privateConstructorUsedError;
  double get rate => throw _privateConstructorUsedError;
  bool get isActive => throw _privateConstructorUsedError;
  bool get isDefault => throw _privateConstructorUsedError;

  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;
  @JsonKey(ignore: true)
  $TaxConfigurationCopyWith<TaxConfiguration> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $TaxConfigurationCopyWith<$Res> {
  factory $TaxConfigurationCopyWith(
          TaxConfiguration value, $Res Function(TaxConfiguration) then) =
      _$TaxConfigurationCopyWithImpl<$Res, TaxConfiguration>;
  @useResult
  $Res call(
      {String id, String name, double rate, bool isActive, bool isDefault});
}

/// @nodoc
class _$TaxConfigurationCopyWithImpl<$Res, $Val extends TaxConfiguration>
    implements $TaxConfigurationCopyWith<$Res> {
  _$TaxConfigurationCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? name = null,
    Object? rate = null,
    Object? isActive = null,
    Object? isDefault = null,
  }) {
    return _then(_value.copyWith(
      id: null == id
          ? _value.id
          : id // ignore: cast_nullable_to_non_nullable
              as String,
      name: null == name
          ? _value.name
          : name // ignore: cast_nullable_to_non_nullable
              as String,
      rate: null == rate
          ? _value.rate
          : rate // ignore: cast_nullable_to_non_nullable
              as double,
      isActive: null == isActive
          ? _value.isActive
          : isActive // ignore: cast_nullable_to_non_nullable
              as bool,
      isDefault: null == isDefault
          ? _value.isDefault
          : isDefault // ignore: cast_nullable_to_non_nullable
              as bool,
    ) as $Val);
  }
}

/// @nodoc
abstract class _$$TaxConfigurationImplCopyWith<$Res>
    implements $TaxConfigurationCopyWith<$Res> {
  factory _$$TaxConfigurationImplCopyWith(_$TaxConfigurationImpl value,
          $Res Function(_$TaxConfigurationImpl) then) =
      __$$TaxConfigurationImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call(
      {String id, String name, double rate, bool isActive, bool isDefault});
}

/// @nodoc
class __$$TaxConfigurationImplCopyWithImpl<$Res>
    extends _$TaxConfigurationCopyWithImpl<$Res, _$TaxConfigurationImpl>
    implements _$$TaxConfigurationImplCopyWith<$Res> {
  __$$TaxConfigurationImplCopyWithImpl(_$TaxConfigurationImpl _value,
      $Res Function(_$TaxConfigurationImpl) _then)
      : super(_value, _then);

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? name = null,
    Object? rate = null,
    Object? isActive = null,
    Object? isDefault = null,
  }) {
    return _then(_$TaxConfigurationImpl(
      id: null == id
          ? _value.id
          : id // ignore: cast_nullable_to_non_nullable
              as String,
      name: null == name
          ? _value.name
          : name // ignore: cast_nullable_to_non_nullable
              as String,
      rate: null == rate
          ? _value.rate
          : rate // ignore: cast_nullable_to_non_nullable
              as double,
      isActive: null == isActive
          ? _value.isActive
          : isActive // ignore: cast_nullable_to_non_nullable
              as bool,
      isDefault: null == isDefault
          ? _value.isDefault
          : isDefault // ignore: cast_nullable_to_non_nullable
              as bool,
    ));
  }
}

/// @nodoc
@JsonSerializable()
class _$TaxConfigurationImpl implements _TaxConfiguration {
  const _$TaxConfigurationImpl(
      {required this.id,
      required this.name,
      required this.rate,
      this.isActive = true,
      this.isDefault = false});

  factory _$TaxConfigurationImpl.fromJson(Map<String, dynamic> json) =>
      _$$TaxConfigurationImplFromJson(json);

  @override
  final String id;
  @override
  final String name;
  @override
  final double rate;
  @override
  @JsonKey()
  final bool isActive;
  @override
  @JsonKey()
  final bool isDefault;

  @override
  String toString() {
    return 'TaxConfiguration(id: $id, name: $name, rate: $rate, isActive: $isActive, isDefault: $isDefault)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$TaxConfigurationImpl &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.name, name) || other.name == name) &&
            (identical(other.rate, rate) || other.rate == rate) &&
            (identical(other.isActive, isActive) ||
                other.isActive == isActive) &&
            (identical(other.isDefault, isDefault) ||
                other.isDefault == isDefault));
  }

  @JsonKey(ignore: true)
  @override
  int get hashCode =>
      Object.hash(runtimeType, id, name, rate, isActive, isDefault);

  @JsonKey(ignore: true)
  @override
  @pragma('vm:prefer-inline')
  _$$TaxConfigurationImplCopyWith<_$TaxConfigurationImpl> get copyWith =>
      __$$TaxConfigurationImplCopyWithImpl<_$TaxConfigurationImpl>(
          this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$TaxConfigurationImplToJson(
      this,
    );
  }
}

abstract class _TaxConfiguration implements TaxConfiguration {
  const factory _TaxConfiguration(
      {required final String id,
      required final String name,
      required final double rate,
      final bool isActive,
      final bool isDefault}) = _$TaxConfigurationImpl;

  factory _TaxConfiguration.fromJson(Map<String, dynamic> json) =
      _$TaxConfigurationImpl.fromJson;

  @override
  String get id;
  @override
  String get name;
  @override
  double get rate;
  @override
  bool get isActive;
  @override
  bool get isDefault;
  @override
  @JsonKey(ignore: true)
  _$$TaxConfigurationImplCopyWith<_$TaxConfigurationImpl> get copyWith =>
      throw _privateConstructorUsedError;
}
