// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'restaurant_area.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

final _privateConstructorUsedError = UnsupportedError(
    'It seems like you constructed your class using `MyClass._()`. This constructor is only meant to be used by freezed and you are not supposed to need it nor use it.\nPlease check the documentation here for more information: https://github.com/rrousselGit/freezed#adding-getters-and-methods-to-our-models');

RestaurantArea _$RestaurantAreaFromJson(Map<String, dynamic> json) {
  return _RestaurantArea.fromJson(json);
}

/// @nodoc
mixin _$RestaurantArea {
  String get id => throw _privateConstructorUsedError;
  String get name => throw _privateConstructorUsedError;
  int get displayOrder => throw _privateConstructorUsedError;
  bool get isActive => throw _privateConstructorUsedError;

  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;
  @JsonKey(ignore: true)
  $RestaurantAreaCopyWith<RestaurantArea> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $RestaurantAreaCopyWith<$Res> {
  factory $RestaurantAreaCopyWith(
          RestaurantArea value, $Res Function(RestaurantArea) then) =
      _$RestaurantAreaCopyWithImpl<$Res, RestaurantArea>;
  @useResult
  $Res call({String id, String name, int displayOrder, bool isActive});
}

/// @nodoc
class _$RestaurantAreaCopyWithImpl<$Res, $Val extends RestaurantArea>
    implements $RestaurantAreaCopyWith<$Res> {
  _$RestaurantAreaCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? name = null,
    Object? displayOrder = null,
    Object? isActive = null,
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
      displayOrder: null == displayOrder
          ? _value.displayOrder
          : displayOrder // ignore: cast_nullable_to_non_nullable
              as int,
      isActive: null == isActive
          ? _value.isActive
          : isActive // ignore: cast_nullable_to_non_nullable
              as bool,
    ) as $Val);
  }
}

/// @nodoc
abstract class _$$RestaurantAreaImplCopyWith<$Res>
    implements $RestaurantAreaCopyWith<$Res> {
  factory _$$RestaurantAreaImplCopyWith(_$RestaurantAreaImpl value,
          $Res Function(_$RestaurantAreaImpl) then) =
      __$$RestaurantAreaImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call({String id, String name, int displayOrder, bool isActive});
}

/// @nodoc
class __$$RestaurantAreaImplCopyWithImpl<$Res>
    extends _$RestaurantAreaCopyWithImpl<$Res, _$RestaurantAreaImpl>
    implements _$$RestaurantAreaImplCopyWith<$Res> {
  __$$RestaurantAreaImplCopyWithImpl(
      _$RestaurantAreaImpl _value, $Res Function(_$RestaurantAreaImpl) _then)
      : super(_value, _then);

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? name = null,
    Object? displayOrder = null,
    Object? isActive = null,
  }) {
    return _then(_$RestaurantAreaImpl(
      id: null == id
          ? _value.id
          : id // ignore: cast_nullable_to_non_nullable
              as String,
      name: null == name
          ? _value.name
          : name // ignore: cast_nullable_to_non_nullable
              as String,
      displayOrder: null == displayOrder
          ? _value.displayOrder
          : displayOrder // ignore: cast_nullable_to_non_nullable
              as int,
      isActive: null == isActive
          ? _value.isActive
          : isActive // ignore: cast_nullable_to_non_nullable
              as bool,
    ));
  }
}

/// @nodoc
@JsonSerializable()
class _$RestaurantAreaImpl implements _RestaurantArea {
  const _$RestaurantAreaImpl(
      {required this.id,
      required this.name,
      this.displayOrder = 0,
      this.isActive = true});

  factory _$RestaurantAreaImpl.fromJson(Map<String, dynamic> json) =>
      _$$RestaurantAreaImplFromJson(json);

  @override
  final String id;
  @override
  final String name;
  @override
  @JsonKey()
  final int displayOrder;
  @override
  @JsonKey()
  final bool isActive;

  @override
  String toString() {
    return 'RestaurantArea(id: $id, name: $name, displayOrder: $displayOrder, isActive: $isActive)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$RestaurantAreaImpl &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.name, name) || other.name == name) &&
            (identical(other.displayOrder, displayOrder) ||
                other.displayOrder == displayOrder) &&
            (identical(other.isActive, isActive) ||
                other.isActive == isActive));
  }

  @JsonKey(ignore: true)
  @override
  int get hashCode =>
      Object.hash(runtimeType, id, name, displayOrder, isActive);

  @JsonKey(ignore: true)
  @override
  @pragma('vm:prefer-inline')
  _$$RestaurantAreaImplCopyWith<_$RestaurantAreaImpl> get copyWith =>
      __$$RestaurantAreaImplCopyWithImpl<_$RestaurantAreaImpl>(
          this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$RestaurantAreaImplToJson(
      this,
    );
  }
}

abstract class _RestaurantArea implements RestaurantArea {
  const factory _RestaurantArea(
      {required final String id,
      required final String name,
      final int displayOrder,
      final bool isActive}) = _$RestaurantAreaImpl;

  factory _RestaurantArea.fromJson(Map<String, dynamic> json) =
      _$RestaurantAreaImpl.fromJson;

  @override
  String get id;
  @override
  String get name;
  @override
  int get displayOrder;
  @override
  bool get isActive;
  @override
  @JsonKey(ignore: true)
  _$$RestaurantAreaImplCopyWith<_$RestaurantAreaImpl> get copyWith =>
      throw _privateConstructorUsedError;
}
