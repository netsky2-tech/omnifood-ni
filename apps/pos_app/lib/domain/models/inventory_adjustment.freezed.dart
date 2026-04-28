// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'inventory_adjustment.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

final _privateConstructorUsedError = UnsupportedError(
    'It seems like you constructed your class using `MyClass._()`. This constructor is only meant to be used by freezed and you are not supposed to need it nor use it.\nPlease check the documentation here for more information: https://github.com/rrousselGit/freezed#adding-getters-and-methods-to-our-models');

InventoryAdjustment _$InventoryAdjustmentFromJson(Map<String, dynamic> json) {
  return _InventoryAdjustment.fromJson(json);
}

/// @nodoc
mixin _$InventoryAdjustment {
  String get id => throw _privateConstructorUsedError;
  String get ingredientId => throw _privateConstructorUsedError;
  double get delta => throw _privateConstructorUsedError;
  String get reason => throw _privateConstructorUsedError;
  DateTime get timestamp => throw _privateConstructorUsedError;

  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;
  @JsonKey(ignore: true)
  $InventoryAdjustmentCopyWith<InventoryAdjustment> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $InventoryAdjustmentCopyWith<$Res> {
  factory $InventoryAdjustmentCopyWith(
          InventoryAdjustment value, $Res Function(InventoryAdjustment) then) =
      _$InventoryAdjustmentCopyWithImpl<$Res, InventoryAdjustment>;
  @useResult
  $Res call(
      {String id,
      String ingredientId,
      double delta,
      String reason,
      DateTime timestamp});
}

/// @nodoc
class _$InventoryAdjustmentCopyWithImpl<$Res, $Val extends InventoryAdjustment>
    implements $InventoryAdjustmentCopyWith<$Res> {
  _$InventoryAdjustmentCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? ingredientId = null,
    Object? delta = null,
    Object? reason = null,
    Object? timestamp = null,
  }) {
    return _then(_value.copyWith(
      id: null == id
          ? _value.id
          : id // ignore: cast_nullable_to_non_nullable
              as String,
      ingredientId: null == ingredientId
          ? _value.ingredientId
          : ingredientId // ignore: cast_nullable_to_non_nullable
              as String,
      delta: null == delta
          ? _value.delta
          : delta // ignore: cast_nullable_to_non_nullable
              as double,
      reason: null == reason
          ? _value.reason
          : reason // ignore: cast_nullable_to_non_nullable
              as String,
      timestamp: null == timestamp
          ? _value.timestamp
          : timestamp // ignore: cast_nullable_to_non_nullable
              as DateTime,
    ) as $Val);
  }
}

/// @nodoc
abstract class _$$InventoryAdjustmentImplCopyWith<$Res>
    implements $InventoryAdjustmentCopyWith<$Res> {
  factory _$$InventoryAdjustmentImplCopyWith(_$InventoryAdjustmentImpl value,
          $Res Function(_$InventoryAdjustmentImpl) then) =
      __$$InventoryAdjustmentImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call(
      {String id,
      String ingredientId,
      double delta,
      String reason,
      DateTime timestamp});
}

/// @nodoc
class __$$InventoryAdjustmentImplCopyWithImpl<$Res>
    extends _$InventoryAdjustmentCopyWithImpl<$Res, _$InventoryAdjustmentImpl>
    implements _$$InventoryAdjustmentImplCopyWith<$Res> {
  __$$InventoryAdjustmentImplCopyWithImpl(_$InventoryAdjustmentImpl _value,
      $Res Function(_$InventoryAdjustmentImpl) _then)
      : super(_value, _then);

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? ingredientId = null,
    Object? delta = null,
    Object? reason = null,
    Object? timestamp = null,
  }) {
    return _then(_$InventoryAdjustmentImpl(
      id: null == id
          ? _value.id
          : id // ignore: cast_nullable_to_non_nullable
              as String,
      ingredientId: null == ingredientId
          ? _value.ingredientId
          : ingredientId // ignore: cast_nullable_to_non_nullable
              as String,
      delta: null == delta
          ? _value.delta
          : delta // ignore: cast_nullable_to_non_nullable
              as double,
      reason: null == reason
          ? _value.reason
          : reason // ignore: cast_nullable_to_non_nullable
              as String,
      timestamp: null == timestamp
          ? _value.timestamp
          : timestamp // ignore: cast_nullable_to_non_nullable
              as DateTime,
    ));
  }
}

/// @nodoc
@JsonSerializable()
class _$InventoryAdjustmentImpl implements _InventoryAdjustment {
  const _$InventoryAdjustmentImpl(
      {required this.id,
      required this.ingredientId,
      required this.delta,
      required this.reason,
      required this.timestamp});

  factory _$InventoryAdjustmentImpl.fromJson(Map<String, dynamic> json) =>
      _$$InventoryAdjustmentImplFromJson(json);

  @override
  final String id;
  @override
  final String ingredientId;
  @override
  final double delta;
  @override
  final String reason;
  @override
  final DateTime timestamp;

  @override
  String toString() {
    return 'InventoryAdjustment(id: $id, ingredientId: $ingredientId, delta: $delta, reason: $reason, timestamp: $timestamp)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$InventoryAdjustmentImpl &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.ingredientId, ingredientId) ||
                other.ingredientId == ingredientId) &&
            (identical(other.delta, delta) || other.delta == delta) &&
            (identical(other.reason, reason) || other.reason == reason) &&
            (identical(other.timestamp, timestamp) ||
                other.timestamp == timestamp));
  }

  @JsonKey(ignore: true)
  @override
  int get hashCode =>
      Object.hash(runtimeType, id, ingredientId, delta, reason, timestamp);

  @JsonKey(ignore: true)
  @override
  @pragma('vm:prefer-inline')
  _$$InventoryAdjustmentImplCopyWith<_$InventoryAdjustmentImpl> get copyWith =>
      __$$InventoryAdjustmentImplCopyWithImpl<_$InventoryAdjustmentImpl>(
          this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$InventoryAdjustmentImplToJson(
      this,
    );
  }
}

abstract class _InventoryAdjustment implements InventoryAdjustment {
  const factory _InventoryAdjustment(
      {required final String id,
      required final String ingredientId,
      required final double delta,
      required final String reason,
      required final DateTime timestamp}) = _$InventoryAdjustmentImpl;

  factory _InventoryAdjustment.fromJson(Map<String, dynamic> json) =
      _$InventoryAdjustmentImpl.fromJson;

  @override
  String get id;
  @override
  String get ingredientId;
  @override
  double get delta;
  @override
  String get reason;
  @override
  DateTime get timestamp;
  @override
  @JsonKey(ignore: true)
  _$$InventoryAdjustmentImplCopyWith<_$InventoryAdjustmentImpl> get copyWith =>
      throw _privateConstructorUsedError;
}
