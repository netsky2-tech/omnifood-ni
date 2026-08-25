// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'kitchen_order_item.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

final _privateConstructorUsedError = UnsupportedError(
    'It seems like you constructed your class using `MyClass._()`. This constructor is only meant to be used by freezed and you are not supposed to need it nor use it.\nPlease check the documentation here for more information: https://github.com/rrousselGit/freezed#adding-getters-and-methods-to-our-models');

KitchenOrderItem _$KitchenOrderItemFromJson(Map<String, dynamic> json) {
  return _KitchenOrderItem.fromJson(json);
}

/// @nodoc
mixin _$KitchenOrderItem {
  String get id => throw _privateConstructorUsedError;
  String get kitchenOrderId => throw _privateConstructorUsedError;
  String get productId => throw _privateConstructorUsedError;
  String get productName => throw _privateConstructorUsedError;
  double get quantity => throw _privateConstructorUsedError;
  String get status => throw _privateConstructorUsedError;
  String? get notes => throw _privateConstructorUsedError;
  List<String> get modifiers => throw _privateConstructorUsedError;

  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;
  @JsonKey(ignore: true)
  $KitchenOrderItemCopyWith<KitchenOrderItem> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $KitchenOrderItemCopyWith<$Res> {
  factory $KitchenOrderItemCopyWith(
          KitchenOrderItem value, $Res Function(KitchenOrderItem) then) =
      _$KitchenOrderItemCopyWithImpl<$Res, KitchenOrderItem>;
  @useResult
  $Res call(
      {String id,
      String kitchenOrderId,
      String productId,
      String productName,
      double quantity,
      String status,
      String? notes,
      List<String> modifiers});
}

/// @nodoc
class _$KitchenOrderItemCopyWithImpl<$Res, $Val extends KitchenOrderItem>
    implements $KitchenOrderItemCopyWith<$Res> {
  _$KitchenOrderItemCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? kitchenOrderId = null,
    Object? productId = null,
    Object? productName = null,
    Object? quantity = null,
    Object? status = null,
    Object? notes = freezed,
    Object? modifiers = null,
  }) {
    return _then(_value.copyWith(
      id: null == id
          ? _value.id
          : id // ignore: cast_nullable_to_non_nullable
              as String,
      kitchenOrderId: null == kitchenOrderId
          ? _value.kitchenOrderId
          : kitchenOrderId // ignore: cast_nullable_to_non_nullable
              as String,
      productId: null == productId
          ? _value.productId
          : productId // ignore: cast_nullable_to_non_nullable
              as String,
      productName: null == productName
          ? _value.productName
          : productName // ignore: cast_nullable_to_non_nullable
              as String,
      quantity: null == quantity
          ? _value.quantity
          : quantity // ignore: cast_nullable_to_non_nullable
              as double,
      status: null == status
          ? _value.status
          : status // ignore: cast_nullable_to_non_nullable
              as String,
      notes: freezed == notes
          ? _value.notes
          : notes // ignore: cast_nullable_to_non_nullable
              as String?,
      modifiers: null == modifiers
          ? _value.modifiers
          : modifiers // ignore: cast_nullable_to_non_nullable
              as List<String>,
    ) as $Val);
  }
}

/// @nodoc
abstract class _$$KitchenOrderItemImplCopyWith<$Res>
    implements $KitchenOrderItemCopyWith<$Res> {
  factory _$$KitchenOrderItemImplCopyWith(_$KitchenOrderItemImpl value,
          $Res Function(_$KitchenOrderItemImpl) then) =
      __$$KitchenOrderItemImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call(
      {String id,
      String kitchenOrderId,
      String productId,
      String productName,
      double quantity,
      String status,
      String? notes,
      List<String> modifiers});
}

/// @nodoc
class __$$KitchenOrderItemImplCopyWithImpl<$Res>
    extends _$KitchenOrderItemCopyWithImpl<$Res, _$KitchenOrderItemImpl>
    implements _$$KitchenOrderItemImplCopyWith<$Res> {
  __$$KitchenOrderItemImplCopyWithImpl(_$KitchenOrderItemImpl _value,
      $Res Function(_$KitchenOrderItemImpl) _then)
      : super(_value, _then);

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? kitchenOrderId = null,
    Object? productId = null,
    Object? productName = null,
    Object? quantity = null,
    Object? status = null,
    Object? notes = freezed,
    Object? modifiers = null,
  }) {
    return _then(_$KitchenOrderItemImpl(
      id: null == id
          ? _value.id
          : id // ignore: cast_nullable_to_non_nullable
              as String,
      kitchenOrderId: null == kitchenOrderId
          ? _value.kitchenOrderId
          : kitchenOrderId // ignore: cast_nullable_to_non_nullable
              as String,
      productId: null == productId
          ? _value.productId
          : productId // ignore: cast_nullable_to_non_nullable
              as String,
      productName: null == productName
          ? _value.productName
          : productName // ignore: cast_nullable_to_non_nullable
              as String,
      quantity: null == quantity
          ? _value.quantity
          : quantity // ignore: cast_nullable_to_non_nullable
              as double,
      status: null == status
          ? _value.status
          : status // ignore: cast_nullable_to_non_nullable
              as String,
      notes: freezed == notes
          ? _value.notes
          : notes // ignore: cast_nullable_to_non_nullable
              as String?,
      modifiers: null == modifiers
          ? _value._modifiers
          : modifiers // ignore: cast_nullable_to_non_nullable
              as List<String>,
    ));
  }
}

/// @nodoc
@JsonSerializable()
class _$KitchenOrderItemImpl implements _KitchenOrderItem {
  const _$KitchenOrderItemImpl(
      {required this.id,
      required this.kitchenOrderId,
      required this.productId,
      required this.productName,
      required this.quantity,
      this.status = 'PENDIENTE',
      this.notes,
      final List<String> modifiers = const []})
      : _modifiers = modifiers;

  factory _$KitchenOrderItemImpl.fromJson(Map<String, dynamic> json) =>
      _$$KitchenOrderItemImplFromJson(json);

  @override
  final String id;
  @override
  final String kitchenOrderId;
  @override
  final String productId;
  @override
  final String productName;
  @override
  final double quantity;
  @override
  @JsonKey()
  final String status;
  @override
  final String? notes;
  final List<String> _modifiers;
  @override
  @JsonKey()
  List<String> get modifiers {
    if (_modifiers is EqualUnmodifiableListView) return _modifiers;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableListView(_modifiers);
  }

  @override
  String toString() {
    return 'KitchenOrderItem(id: $id, kitchenOrderId: $kitchenOrderId, productId: $productId, productName: $productName, quantity: $quantity, status: $status, notes: $notes, modifiers: $modifiers)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$KitchenOrderItemImpl &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.kitchenOrderId, kitchenOrderId) ||
                other.kitchenOrderId == kitchenOrderId) &&
            (identical(other.productId, productId) ||
                other.productId == productId) &&
            (identical(other.productName, productName) ||
                other.productName == productName) &&
            (identical(other.quantity, quantity) ||
                other.quantity == quantity) &&
            (identical(other.status, status) || other.status == status) &&
            (identical(other.notes, notes) || other.notes == notes) &&
            const DeepCollectionEquality()
                .equals(other._modifiers, _modifiers));
  }

  @JsonKey(ignore: true)
  @override
  int get hashCode => Object.hash(
      runtimeType,
      id,
      kitchenOrderId,
      productId,
      productName,
      quantity,
      status,
      notes,
      const DeepCollectionEquality().hash(_modifiers));

  @JsonKey(ignore: true)
  @override
  @pragma('vm:prefer-inline')
  _$$KitchenOrderItemImplCopyWith<_$KitchenOrderItemImpl> get copyWith =>
      __$$KitchenOrderItemImplCopyWithImpl<_$KitchenOrderItemImpl>(
          this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$KitchenOrderItemImplToJson(
      this,
    );
  }
}

abstract class _KitchenOrderItem implements KitchenOrderItem {
  const factory _KitchenOrderItem(
      {required final String id,
      required final String kitchenOrderId,
      required final String productId,
      required final String productName,
      required final double quantity,
      final String status,
      final String? notes,
      final List<String> modifiers}) = _$KitchenOrderItemImpl;

  factory _KitchenOrderItem.fromJson(Map<String, dynamic> json) =
      _$KitchenOrderItemImpl.fromJson;

  @override
  String get id;
  @override
  String get kitchenOrderId;
  @override
  String get productId;
  @override
  String get productName;
  @override
  double get quantity;
  @override
  String get status;
  @override
  String? get notes;
  @override
  List<String> get modifiers;
  @override
  @JsonKey(ignore: true)
  _$$KitchenOrderItemImplCopyWith<_$KitchenOrderItemImpl> get copyWith =>
      throw _privateConstructorUsedError;
}
