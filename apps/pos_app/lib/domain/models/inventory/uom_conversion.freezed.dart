// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'uom_conversion.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

final _privateConstructorUsedError = UnsupportedError(
    'It seems like you constructed your class using `MyClass._()`. This constructor is only meant to be used by freezed and you are not supposed to need it nor use it.\nPlease check the documentation here for more information: https://github.com/rrousselGit/freezed#adding-getters-and-methods-to-our-models');

UomConversion _$UomConversionFromJson(Map<String, dynamic> json) {
  return _UomConversion.fromJson(json);
}

/// @nodoc
mixin _$UomConversion {
  String get id => throw _privateConstructorUsedError;
  String get insumoId => throw _privateConstructorUsedError;
  String get unitName => throw _privateConstructorUsedError;
  double get factor => throw _privateConstructorUsedError;
  bool get isDefault => throw _privateConstructorUsedError;

  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;
  @JsonKey(ignore: true)
  $UomConversionCopyWith<UomConversion> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $UomConversionCopyWith<$Res> {
  factory $UomConversionCopyWith(
          UomConversion value, $Res Function(UomConversion) then) =
      _$UomConversionCopyWithImpl<$Res, UomConversion>;
  @useResult
  $Res call(
      {String id,
      String insumoId,
      String unitName,
      double factor,
      bool isDefault});
}

/// @nodoc
class _$UomConversionCopyWithImpl<$Res, $Val extends UomConversion>
    implements $UomConversionCopyWith<$Res> {
  _$UomConversionCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? insumoId = null,
    Object? unitName = null,
    Object? factor = null,
    Object? isDefault = null,
  }) {
    return _then(_value.copyWith(
      id: null == id
          ? _value.id
          : id // ignore: cast_nullable_to_non_nullable
              as String,
      insumoId: null == insumoId
          ? _value.insumoId
          : insumoId // ignore: cast_nullable_to_non_nullable
              as String,
      unitName: null == unitName
          ? _value.unitName
          : unitName // ignore: cast_nullable_to_non_nullable
              as String,
      factor: null == factor
          ? _value.factor
          : factor // ignore: cast_nullable_to_non_nullable
              as double,
      isDefault: null == isDefault
          ? _value.isDefault
          : isDefault // ignore: cast_nullable_to_non_nullable
              as bool,
    ) as $Val);
  }
}

/// @nodoc
abstract class _$$UomConversionImplCopyWith<$Res>
    implements $UomConversionCopyWith<$Res> {
  factory _$$UomConversionImplCopyWith(
          _$UomConversionImpl value, $Res Function(_$UomConversionImpl) then) =
      __$$UomConversionImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call(
      {String id,
      String insumoId,
      String unitName,
      double factor,
      bool isDefault});
}

/// @nodoc
class __$$UomConversionImplCopyWithImpl<$Res>
    extends _$UomConversionCopyWithImpl<$Res, _$UomConversionImpl>
    implements _$$UomConversionImplCopyWith<$Res> {
  __$$UomConversionImplCopyWithImpl(
      _$UomConversionImpl _value, $Res Function(_$UomConversionImpl) _then)
      : super(_value, _then);

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? insumoId = null,
    Object? unitName = null,
    Object? factor = null,
    Object? isDefault = null,
  }) {
    return _then(_$UomConversionImpl(
      id: null == id
          ? _value.id
          : id // ignore: cast_nullable_to_non_nullable
              as String,
      insumoId: null == insumoId
          ? _value.insumoId
          : insumoId // ignore: cast_nullable_to_non_nullable
              as String,
      unitName: null == unitName
          ? _value.unitName
          : unitName // ignore: cast_nullable_to_non_nullable
              as String,
      factor: null == factor
          ? _value.factor
          : factor // ignore: cast_nullable_to_non_nullable
              as double,
      isDefault: null == isDefault
          ? _value.isDefault
          : isDefault // ignore: cast_nullable_to_non_nullable
              as bool,
    ));
  }
}

/// @nodoc
@JsonSerializable()
class _$UomConversionImpl implements _UomConversion {
  const _$UomConversionImpl(
      {required this.id,
      required this.insumoId,
      required this.unitName,
      required this.factor,
      this.isDefault = false});

  factory _$UomConversionImpl.fromJson(Map<String, dynamic> json) =>
      _$$UomConversionImplFromJson(json);

  @override
  final String id;
  @override
  final String insumoId;
  @override
  final String unitName;
  @override
  final double factor;
  @override
  @JsonKey()
  final bool isDefault;

  @override
  String toString() {
    return 'UomConversion(id: $id, insumoId: $insumoId, unitName: $unitName, factor: $factor, isDefault: $isDefault)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$UomConversionImpl &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.insumoId, insumoId) ||
                other.insumoId == insumoId) &&
            (identical(other.unitName, unitName) ||
                other.unitName == unitName) &&
            (identical(other.factor, factor) || other.factor == factor) &&
            (identical(other.isDefault, isDefault) ||
                other.isDefault == isDefault));
  }

  @JsonKey(ignore: true)
  @override
  int get hashCode =>
      Object.hash(runtimeType, id, insumoId, unitName, factor, isDefault);

  @JsonKey(ignore: true)
  @override
  @pragma('vm:prefer-inline')
  _$$UomConversionImplCopyWith<_$UomConversionImpl> get copyWith =>
      __$$UomConversionImplCopyWithImpl<_$UomConversionImpl>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$UomConversionImplToJson(
      this,
    );
  }
}

abstract class _UomConversion implements UomConversion {
  const factory _UomConversion(
      {required final String id,
      required final String insumoId,
      required final String unitName,
      required final double factor,
      final bool isDefault}) = _$UomConversionImpl;

  factory _UomConversion.fromJson(Map<String, dynamic> json) =
      _$UomConversionImpl.fromJson;

  @override
  String get id;
  @override
  String get insumoId;
  @override
  String get unitName;
  @override
  double get factor;
  @override
  bool get isDefault;
  @override
  @JsonKey(ignore: true)
  _$$UomConversionImplCopyWith<_$UomConversionImpl> get copyWith =>
      throw _privateConstructorUsedError;
}
