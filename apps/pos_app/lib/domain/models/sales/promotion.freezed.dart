// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'promotion.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

final _privateConstructorUsedError = UnsupportedError(
    'It seems like you constructed your class using `MyClass._()`. This constructor is only meant to be used by freezed and you are not supposed to need it nor use it.\nPlease check the documentation here for more information: https://github.com/rrousselGit/freezed#adding-getters-and-methods-to-our-models');

Promotion _$PromotionFromJson(Map<String, dynamic> json) {
  return _Promotion.fromJson(json);
}

/// @nodoc
mixin _$Promotion {
  String get id => throw _privateConstructorUsedError;
  String get name => throw _privateConstructorUsedError;
  PromotionType get type => throw _privateConstructorUsedError;
  String get targetProductId => throw _privateConstructorUsedError;
  int get buyQuantity => throw _privateConstructorUsedError;
  int get getQuantity => throw _privateConstructorUsedError;
  double get discountValue => throw _privateConstructorUsedError;
  bool get isActive => throw _privateConstructorUsedError;

  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;
  @JsonKey(ignore: true)
  $PromotionCopyWith<Promotion> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $PromotionCopyWith<$Res> {
  factory $PromotionCopyWith(Promotion value, $Res Function(Promotion) then) =
      _$PromotionCopyWithImpl<$Res, Promotion>;
  @useResult
  $Res call(
      {String id,
      String name,
      PromotionType type,
      String targetProductId,
      int buyQuantity,
      int getQuantity,
      double discountValue,
      bool isActive});
}

/// @nodoc
class _$PromotionCopyWithImpl<$Res, $Val extends Promotion>
    implements $PromotionCopyWith<$Res> {
  _$PromotionCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? name = null,
    Object? type = null,
    Object? targetProductId = null,
    Object? buyQuantity = null,
    Object? getQuantity = null,
    Object? discountValue = null,
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
      type: null == type
          ? _value.type
          : type // ignore: cast_nullable_to_non_nullable
              as PromotionType,
      targetProductId: null == targetProductId
          ? _value.targetProductId
          : targetProductId // ignore: cast_nullable_to_non_nullable
              as String,
      buyQuantity: null == buyQuantity
          ? _value.buyQuantity
          : buyQuantity // ignore: cast_nullable_to_non_nullable
              as int,
      getQuantity: null == getQuantity
          ? _value.getQuantity
          : getQuantity // ignore: cast_nullable_to_non_nullable
              as int,
      discountValue: null == discountValue
          ? _value.discountValue
          : discountValue // ignore: cast_nullable_to_non_nullable
              as double,
      isActive: null == isActive
          ? _value.isActive
          : isActive // ignore: cast_nullable_to_non_nullable
              as bool,
    ) as $Val);
  }
}

/// @nodoc
abstract class _$$PromotionImplCopyWith<$Res>
    implements $PromotionCopyWith<$Res> {
  factory _$$PromotionImplCopyWith(
          _$PromotionImpl value, $Res Function(_$PromotionImpl) then) =
      __$$PromotionImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call(
      {String id,
      String name,
      PromotionType type,
      String targetProductId,
      int buyQuantity,
      int getQuantity,
      double discountValue,
      bool isActive});
}

/// @nodoc
class __$$PromotionImplCopyWithImpl<$Res>
    extends _$PromotionCopyWithImpl<$Res, _$PromotionImpl>
    implements _$$PromotionImplCopyWith<$Res> {
  __$$PromotionImplCopyWithImpl(
      _$PromotionImpl _value, $Res Function(_$PromotionImpl) _then)
      : super(_value, _then);

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? name = null,
    Object? type = null,
    Object? targetProductId = null,
    Object? buyQuantity = null,
    Object? getQuantity = null,
    Object? discountValue = null,
    Object? isActive = null,
  }) {
    return _then(_$PromotionImpl(
      id: null == id
          ? _value.id
          : id // ignore: cast_nullable_to_non_nullable
              as String,
      name: null == name
          ? _value.name
          : name // ignore: cast_nullable_to_non_nullable
              as String,
      type: null == type
          ? _value.type
          : type // ignore: cast_nullable_to_non_nullable
              as PromotionType,
      targetProductId: null == targetProductId
          ? _value.targetProductId
          : targetProductId // ignore: cast_nullable_to_non_nullable
              as String,
      buyQuantity: null == buyQuantity
          ? _value.buyQuantity
          : buyQuantity // ignore: cast_nullable_to_non_nullable
              as int,
      getQuantity: null == getQuantity
          ? _value.getQuantity
          : getQuantity // ignore: cast_nullable_to_non_nullable
              as int,
      discountValue: null == discountValue
          ? _value.discountValue
          : discountValue // ignore: cast_nullable_to_non_nullable
              as double,
      isActive: null == isActive
          ? _value.isActive
          : isActive // ignore: cast_nullable_to_non_nullable
              as bool,
    ));
  }
}

/// @nodoc
@JsonSerializable()
class _$PromotionImpl implements _Promotion {
  const _$PromotionImpl(
      {required this.id,
      required this.name,
      required this.type,
      required this.targetProductId,
      this.buyQuantity = 0,
      this.getQuantity = 0,
      this.discountValue = 0.0,
      this.isActive = true});

  factory _$PromotionImpl.fromJson(Map<String, dynamic> json) =>
      _$$PromotionImplFromJson(json);

  @override
  final String id;
  @override
  final String name;
  @override
  final PromotionType type;
  @override
  final String targetProductId;
  @override
  @JsonKey()
  final int buyQuantity;
  @override
  @JsonKey()
  final int getQuantity;
  @override
  @JsonKey()
  final double discountValue;
  @override
  @JsonKey()
  final bool isActive;

  @override
  String toString() {
    return 'Promotion(id: $id, name: $name, type: $type, targetProductId: $targetProductId, buyQuantity: $buyQuantity, getQuantity: $getQuantity, discountValue: $discountValue, isActive: $isActive)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$PromotionImpl &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.name, name) || other.name == name) &&
            (identical(other.type, type) || other.type == type) &&
            (identical(other.targetProductId, targetProductId) ||
                other.targetProductId == targetProductId) &&
            (identical(other.buyQuantity, buyQuantity) ||
                other.buyQuantity == buyQuantity) &&
            (identical(other.getQuantity, getQuantity) ||
                other.getQuantity == getQuantity) &&
            (identical(other.discountValue, discountValue) ||
                other.discountValue == discountValue) &&
            (identical(other.isActive, isActive) ||
                other.isActive == isActive));
  }

  @JsonKey(ignore: true)
  @override
  int get hashCode => Object.hash(runtimeType, id, name, type, targetProductId,
      buyQuantity, getQuantity, discountValue, isActive);

  @JsonKey(ignore: true)
  @override
  @pragma('vm:prefer-inline')
  _$$PromotionImplCopyWith<_$PromotionImpl> get copyWith =>
      __$$PromotionImplCopyWithImpl<_$PromotionImpl>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$PromotionImplToJson(
      this,
    );
  }
}

abstract class _Promotion implements Promotion {
  const factory _Promotion(
      {required final String id,
      required final String name,
      required final PromotionType type,
      required final String targetProductId,
      final int buyQuantity,
      final int getQuantity,
      final double discountValue,
      final bool isActive}) = _$PromotionImpl;

  factory _Promotion.fromJson(Map<String, dynamic> json) =
      _$PromotionImpl.fromJson;

  @override
  String get id;
  @override
  String get name;
  @override
  PromotionType get type;
  @override
  String get targetProductId;
  @override
  int get buyQuantity;
  @override
  int get getQuantity;
  @override
  double get discountValue;
  @override
  bool get isActive;
  @override
  @JsonKey(ignore: true)
  _$$PromotionImplCopyWith<_$PromotionImpl> get copyWith =>
      throw _privateConstructorUsedError;
}
