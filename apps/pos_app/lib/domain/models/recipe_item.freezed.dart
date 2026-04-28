// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'recipe_item.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

final _privateConstructorUsedError = UnsupportedError(
    'It seems like you constructed your class using `MyClass._()`. This constructor is only meant to be used by freezed and you are not supposed to need it nor use it.\nPlease check the documentation here for more information: https://github.com/rrousselGit/freezed#adding-getters-and-methods-to-our-models');

RecipeItem _$RecipeItemFromJson(Map<String, dynamic> json) {
  return _RecipeItem.fromJson(json);
}

/// @nodoc
mixin _$RecipeItem {
  String get productId => throw _privateConstructorUsedError;
  String get ingredientId => throw _privateConstructorUsedError;
  double get quantity => throw _privateConstructorUsedError;

  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;
  @JsonKey(ignore: true)
  $RecipeItemCopyWith<RecipeItem> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $RecipeItemCopyWith<$Res> {
  factory $RecipeItemCopyWith(
          RecipeItem value, $Res Function(RecipeItem) then) =
      _$RecipeItemCopyWithImpl<$Res, RecipeItem>;
  @useResult
  $Res call({String productId, String ingredientId, double quantity});
}

/// @nodoc
class _$RecipeItemCopyWithImpl<$Res, $Val extends RecipeItem>
    implements $RecipeItemCopyWith<$Res> {
  _$RecipeItemCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? productId = null,
    Object? ingredientId = null,
    Object? quantity = null,
  }) {
    return _then(_value.copyWith(
      productId: null == productId
          ? _value.productId
          : productId // ignore: cast_nullable_to_non_nullable
              as String,
      ingredientId: null == ingredientId
          ? _value.ingredientId
          : ingredientId // ignore: cast_nullable_to_non_nullable
              as String,
      quantity: null == quantity
          ? _value.quantity
          : quantity // ignore: cast_nullable_to_non_nullable
              as double,
    ) as $Val);
  }
}

/// @nodoc
abstract class _$$RecipeItemImplCopyWith<$Res>
    implements $RecipeItemCopyWith<$Res> {
  factory _$$RecipeItemImplCopyWith(
          _$RecipeItemImpl value, $Res Function(_$RecipeItemImpl) then) =
      __$$RecipeItemImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call({String productId, String ingredientId, double quantity});
}

/// @nodoc
class __$$RecipeItemImplCopyWithImpl<$Res>
    extends _$RecipeItemCopyWithImpl<$Res, _$RecipeItemImpl>
    implements _$$RecipeItemImplCopyWith<$Res> {
  __$$RecipeItemImplCopyWithImpl(
      _$RecipeItemImpl _value, $Res Function(_$RecipeItemImpl) _then)
      : super(_value, _then);

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? productId = null,
    Object? ingredientId = null,
    Object? quantity = null,
  }) {
    return _then(_$RecipeItemImpl(
      productId: null == productId
          ? _value.productId
          : productId // ignore: cast_nullable_to_non_nullable
              as String,
      ingredientId: null == ingredientId
          ? _value.ingredientId
          : ingredientId // ignore: cast_nullable_to_non_nullable
              as String,
      quantity: null == quantity
          ? _value.quantity
          : quantity // ignore: cast_nullable_to_non_nullable
              as double,
    ));
  }
}

/// @nodoc
@JsonSerializable()
class _$RecipeItemImpl implements _RecipeItem {
  const _$RecipeItemImpl(
      {required this.productId,
      required this.ingredientId,
      required this.quantity});

  factory _$RecipeItemImpl.fromJson(Map<String, dynamic> json) =>
      _$$RecipeItemImplFromJson(json);

  @override
  final String productId;
  @override
  final String ingredientId;
  @override
  final double quantity;

  @override
  String toString() {
    return 'RecipeItem(productId: $productId, ingredientId: $ingredientId, quantity: $quantity)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$RecipeItemImpl &&
            (identical(other.productId, productId) ||
                other.productId == productId) &&
            (identical(other.ingredientId, ingredientId) ||
                other.ingredientId == ingredientId) &&
            (identical(other.quantity, quantity) ||
                other.quantity == quantity));
  }

  @JsonKey(ignore: true)
  @override
  int get hashCode =>
      Object.hash(runtimeType, productId, ingredientId, quantity);

  @JsonKey(ignore: true)
  @override
  @pragma('vm:prefer-inline')
  _$$RecipeItemImplCopyWith<_$RecipeItemImpl> get copyWith =>
      __$$RecipeItemImplCopyWithImpl<_$RecipeItemImpl>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$RecipeItemImplToJson(
      this,
    );
  }
}

abstract class _RecipeItem implements RecipeItem {
  const factory _RecipeItem(
      {required final String productId,
      required final String ingredientId,
      required final double quantity}) = _$RecipeItemImpl;

  factory _RecipeItem.fromJson(Map<String, dynamic> json) =
      _$RecipeItemImpl.fromJson;

  @override
  String get productId;
  @override
  String get ingredientId;
  @override
  double get quantity;
  @override
  @JsonKey(ignore: true)
  _$$RecipeItemImplCopyWith<_$RecipeItemImpl> get copyWith =>
      throw _privateConstructorUsedError;
}
