// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'catalog_value.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

final _privateConstructorUsedError = UnsupportedError(
    'It seems like you constructed your class using `MyClass._()`. This constructor is only meant to be used by freezed and you are not supposed to need it nor use it.\nPlease check the documentation here for more information: https://github.com/rrousselGit/freezed#adding-getters-and-methods-to-our-models');

CatalogValue _$CatalogValueFromJson(Map<String, dynamic> json) {
  return _CatalogValue.fromJson(json);
}

/// @nodoc
mixin _$CatalogValue {
  String get id => throw _privateConstructorUsedError;
  @JsonKey(fromJson: CatalogType.fromJson, toJson: CatalogType.toJson)
  CatalogType get catalogType => throw _privateConstructorUsedError;
  String get code => throw _privateConstructorUsedError;
  String get name => throw _privateConstructorUsedError;
  bool get isActive => throw _privateConstructorUsedError;
  int get sortOrder => throw _privateConstructorUsedError;

  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;
  @JsonKey(ignore: true)
  $CatalogValueCopyWith<CatalogValue> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $CatalogValueCopyWith<$Res> {
  factory $CatalogValueCopyWith(
          CatalogValue value, $Res Function(CatalogValue) then) =
      _$CatalogValueCopyWithImpl<$Res, CatalogValue>;
  @useResult
  $Res call(
      {String id,
      @JsonKey(fromJson: CatalogType.fromJson, toJson: CatalogType.toJson)
      CatalogType catalogType,
      String code,
      String name,
      bool isActive,
      int sortOrder});
}

/// @nodoc
class _$CatalogValueCopyWithImpl<$Res, $Val extends CatalogValue>
    implements $CatalogValueCopyWith<$Res> {
  _$CatalogValueCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? catalogType = null,
    Object? code = null,
    Object? name = null,
    Object? isActive = null,
    Object? sortOrder = null,
  }) {
    return _then(_value.copyWith(
      id: null == id
          ? _value.id
          : id // ignore: cast_nullable_to_non_nullable
              as String,
      catalogType: null == catalogType
          ? _value.catalogType
          : catalogType // ignore: cast_nullable_to_non_nullable
              as CatalogType,
      code: null == code
          ? _value.code
          : code // ignore: cast_nullable_to_non_nullable
              as String,
      name: null == name
          ? _value.name
          : name // ignore: cast_nullable_to_non_nullable
              as String,
      isActive: null == isActive
          ? _value.isActive
          : isActive // ignore: cast_nullable_to_non_nullable
              as bool,
      sortOrder: null == sortOrder
          ? _value.sortOrder
          : sortOrder // ignore: cast_nullable_to_non_nullable
              as int,
    ) as $Val);
  }
}

/// @nodoc
abstract class _$$CatalogValueImplCopyWith<$Res>
    implements $CatalogValueCopyWith<$Res> {
  factory _$$CatalogValueImplCopyWith(
          _$CatalogValueImpl value, $Res Function(_$CatalogValueImpl) then) =
      __$$CatalogValueImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call(
      {String id,
      @JsonKey(fromJson: CatalogType.fromJson, toJson: CatalogType.toJson)
      CatalogType catalogType,
      String code,
      String name,
      bool isActive,
      int sortOrder});
}

/// @nodoc
class __$$CatalogValueImplCopyWithImpl<$Res>
    extends _$CatalogValueCopyWithImpl<$Res, _$CatalogValueImpl>
    implements _$$CatalogValueImplCopyWith<$Res> {
  __$$CatalogValueImplCopyWithImpl(
      _$CatalogValueImpl _value, $Res Function(_$CatalogValueImpl) _then)
      : super(_value, _then);

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? catalogType = null,
    Object? code = null,
    Object? name = null,
    Object? isActive = null,
    Object? sortOrder = null,
  }) {
    return _then(_$CatalogValueImpl(
      id: null == id
          ? _value.id
          : id // ignore: cast_nullable_to_non_nullable
              as String,
      catalogType: null == catalogType
          ? _value.catalogType
          : catalogType // ignore: cast_nullable_to_non_nullable
              as CatalogType,
      code: null == code
          ? _value.code
          : code // ignore: cast_nullable_to_non_nullable
              as String,
      name: null == name
          ? _value.name
          : name // ignore: cast_nullable_to_non_nullable
              as String,
      isActive: null == isActive
          ? _value.isActive
          : isActive // ignore: cast_nullable_to_non_nullable
              as bool,
      sortOrder: null == sortOrder
          ? _value.sortOrder
          : sortOrder // ignore: cast_nullable_to_non_nullable
              as int,
    ));
  }
}

/// @nodoc
@JsonSerializable()
class _$CatalogValueImpl implements _CatalogValue {
  const _$CatalogValueImpl(
      {required this.id,
      @JsonKey(fromJson: CatalogType.fromJson, toJson: CatalogType.toJson)
      required this.catalogType,
      required this.code,
      required this.name,
      this.isActive = true,
      this.sortOrder = 0});

  factory _$CatalogValueImpl.fromJson(Map<String, dynamic> json) =>
      _$$CatalogValueImplFromJson(json);

  @override
  final String id;
  @override
  @JsonKey(fromJson: CatalogType.fromJson, toJson: CatalogType.toJson)
  final CatalogType catalogType;
  @override
  final String code;
  @override
  final String name;
  @override
  @JsonKey()
  final bool isActive;
  @override
  @JsonKey()
  final int sortOrder;

  @override
  String toString() {
    return 'CatalogValue(id: $id, catalogType: $catalogType, code: $code, name: $name, isActive: $isActive, sortOrder: $sortOrder)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$CatalogValueImpl &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.catalogType, catalogType) ||
                other.catalogType == catalogType) &&
            (identical(other.code, code) || other.code == code) &&
            (identical(other.name, name) || other.name == name) &&
            (identical(other.isActive, isActive) ||
                other.isActive == isActive) &&
            (identical(other.sortOrder, sortOrder) ||
                other.sortOrder == sortOrder));
  }

  @JsonKey(ignore: true)
  @override
  int get hashCode => Object.hash(
      runtimeType, id, catalogType, code, name, isActive, sortOrder);

  @JsonKey(ignore: true)
  @override
  @pragma('vm:prefer-inline')
  _$$CatalogValueImplCopyWith<_$CatalogValueImpl> get copyWith =>
      __$$CatalogValueImplCopyWithImpl<_$CatalogValueImpl>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$CatalogValueImplToJson(
      this,
    );
  }
}

abstract class _CatalogValue implements CatalogValue {
  const factory _CatalogValue(
      {required final String id,
      @JsonKey(fromJson: CatalogType.fromJson, toJson: CatalogType.toJson)
      required final CatalogType catalogType,
      required final String code,
      required final String name,
      final bool isActive,
      final int sortOrder}) = _$CatalogValueImpl;

  factory _CatalogValue.fromJson(Map<String, dynamic> json) =
      _$CatalogValueImpl.fromJson;

  @override
  String get id;
  @override
  @JsonKey(fromJson: CatalogType.fromJson, toJson: CatalogType.toJson)
  CatalogType get catalogType;
  @override
  String get code;
  @override
  String get name;
  @override
  bool get isActive;
  @override
  int get sortOrder;
  @override
  @JsonKey(ignore: true)
  _$$CatalogValueImplCopyWith<_$CatalogValueImpl> get copyWith =>
      throw _privateConstructorUsedError;
}
