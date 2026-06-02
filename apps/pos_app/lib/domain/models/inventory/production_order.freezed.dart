// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'production_order.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

final _privateConstructorUsedError = UnsupportedError(
    'It seems like you constructed your class using `MyClass._()`. This constructor is only meant to be used by freezed and you are not supposed to need it nor use it.\nPlease check the documentation here for more information: https://github.com/rrousselGit/freezed#adding-getters-and-methods-to-our-models');

ProductionOrder _$ProductionOrderFromJson(Map<String, dynamic> json) {
  return _ProductionOrder.fromJson(json);
}

/// @nodoc
mixin _$ProductionOrder {
  String get id => throw _privateConstructorUsedError;
  String get recipeVersionId => throw _privateConstructorUsedError;
  String get producedInsumoId => throw _privateConstructorUsedError;
  double get orderQuantity => throw _privateConstructorUsedError;
  DateTime get operationDate => throw _privateConstructorUsedError;

  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;
  @JsonKey(ignore: true)
  $ProductionOrderCopyWith<ProductionOrder> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $ProductionOrderCopyWith<$Res> {
  factory $ProductionOrderCopyWith(
          ProductionOrder value, $Res Function(ProductionOrder) then) =
      _$ProductionOrderCopyWithImpl<$Res, ProductionOrder>;
  @useResult
  $Res call(
      {String id,
      String recipeVersionId,
      String producedInsumoId,
      double orderQuantity,
      DateTime operationDate});
}

/// @nodoc
class _$ProductionOrderCopyWithImpl<$Res, $Val extends ProductionOrder>
    implements $ProductionOrderCopyWith<$Res> {
  _$ProductionOrderCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? recipeVersionId = null,
    Object? producedInsumoId = null,
    Object? orderQuantity = null,
    Object? operationDate = null,
  }) {
    return _then(_value.copyWith(
      id: null == id
          ? _value.id
          : id // ignore: cast_nullable_to_non_nullable
              as String,
      recipeVersionId: null == recipeVersionId
          ? _value.recipeVersionId
          : recipeVersionId // ignore: cast_nullable_to_non_nullable
              as String,
      producedInsumoId: null == producedInsumoId
          ? _value.producedInsumoId
          : producedInsumoId // ignore: cast_nullable_to_non_nullable
              as String,
      orderQuantity: null == orderQuantity
          ? _value.orderQuantity
          : orderQuantity // ignore: cast_nullable_to_non_nullable
              as double,
      operationDate: null == operationDate
          ? _value.operationDate
          : operationDate // ignore: cast_nullable_to_non_nullable
              as DateTime,
    ) as $Val);
  }
}

/// @nodoc
abstract class _$$ProductionOrderImplCopyWith<$Res>
    implements $ProductionOrderCopyWith<$Res> {
  factory _$$ProductionOrderImplCopyWith(_$ProductionOrderImpl value,
          $Res Function(_$ProductionOrderImpl) then) =
      __$$ProductionOrderImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call(
      {String id,
      String recipeVersionId,
      String producedInsumoId,
      double orderQuantity,
      DateTime operationDate});
}

/// @nodoc
class __$$ProductionOrderImplCopyWithImpl<$Res>
    extends _$ProductionOrderCopyWithImpl<$Res, _$ProductionOrderImpl>
    implements _$$ProductionOrderImplCopyWith<$Res> {
  __$$ProductionOrderImplCopyWithImpl(
      _$ProductionOrderImpl _value, $Res Function(_$ProductionOrderImpl) _then)
      : super(_value, _then);

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? recipeVersionId = null,
    Object? producedInsumoId = null,
    Object? orderQuantity = null,
    Object? operationDate = null,
  }) {
    return _then(_$ProductionOrderImpl(
      id: null == id
          ? _value.id
          : id // ignore: cast_nullable_to_non_nullable
              as String,
      recipeVersionId: null == recipeVersionId
          ? _value.recipeVersionId
          : recipeVersionId // ignore: cast_nullable_to_non_nullable
              as String,
      producedInsumoId: null == producedInsumoId
          ? _value.producedInsumoId
          : producedInsumoId // ignore: cast_nullable_to_non_nullable
              as String,
      orderQuantity: null == orderQuantity
          ? _value.orderQuantity
          : orderQuantity // ignore: cast_nullable_to_non_nullable
              as double,
      operationDate: null == operationDate
          ? _value.operationDate
          : operationDate // ignore: cast_nullable_to_non_nullable
              as DateTime,
    ));
  }
}

/// @nodoc
@JsonSerializable()
class _$ProductionOrderImpl implements _ProductionOrder {
  const _$ProductionOrderImpl(
      {required this.id,
      required this.recipeVersionId,
      required this.producedInsumoId,
      required this.orderQuantity,
      required this.operationDate});

  factory _$ProductionOrderImpl.fromJson(Map<String, dynamic> json) =>
      _$$ProductionOrderImplFromJson(json);

  @override
  final String id;
  @override
  final String recipeVersionId;
  @override
  final String producedInsumoId;
  @override
  final double orderQuantity;
  @override
  final DateTime operationDate;

  @override
  String toString() {
    return 'ProductionOrder(id: $id, recipeVersionId: $recipeVersionId, producedInsumoId: $producedInsumoId, orderQuantity: $orderQuantity, operationDate: $operationDate)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$ProductionOrderImpl &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.recipeVersionId, recipeVersionId) ||
                other.recipeVersionId == recipeVersionId) &&
            (identical(other.producedInsumoId, producedInsumoId) ||
                other.producedInsumoId == producedInsumoId) &&
            (identical(other.orderQuantity, orderQuantity) ||
                other.orderQuantity == orderQuantity) &&
            (identical(other.operationDate, operationDate) ||
                other.operationDate == operationDate));
  }

  @JsonKey(ignore: true)
  @override
  int get hashCode => Object.hash(runtimeType, id, recipeVersionId,
      producedInsumoId, orderQuantity, operationDate);

  @JsonKey(ignore: true)
  @override
  @pragma('vm:prefer-inline')
  _$$ProductionOrderImplCopyWith<_$ProductionOrderImpl> get copyWith =>
      __$$ProductionOrderImplCopyWithImpl<_$ProductionOrderImpl>(
          this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$ProductionOrderImplToJson(
      this,
    );
  }
}

abstract class _ProductionOrder implements ProductionOrder {
  const factory _ProductionOrder(
      {required final String id,
      required final String recipeVersionId,
      required final String producedInsumoId,
      required final double orderQuantity,
      required final DateTime operationDate}) = _$ProductionOrderImpl;

  factory _ProductionOrder.fromJson(Map<String, dynamic> json) =
      _$ProductionOrderImpl.fromJson;

  @override
  String get id;
  @override
  String get recipeVersionId;
  @override
  String get producedInsumoId;
  @override
  double get orderQuantity;
  @override
  DateTime get operationDate;
  @override
  @JsonKey(ignore: true)
  _$$ProductionOrderImplCopyWith<_$ProductionOrderImpl> get copyWith =>
      throw _privateConstructorUsedError;
}
